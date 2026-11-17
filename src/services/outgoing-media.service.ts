import { constants, type Stats } from 'node:fs';
import { mkdtemp, open, realpath, rm, stat, lstat, chmod, readFile, type FileHandle } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { getFfmpegCommands } from './ffmpeg-path.js';
import type { AnyMessageContent } from 'baileys';
import { createStoragePaths } from './storage-path.js';
import { t } from '../i18n.js';

export type OutgoingMediaType = 'document' | 'image' | 'audio' | 'video';
export interface OutgoingMediaRequest {
    path: string;
    type: OutgoingMediaType;
    caption?: string;
    voiceNote?: boolean;
}
export interface OutgoingMediaMetadata {
    type: OutgoingMediaType;
    fileName: string;
    mimetype: string;
    size: number;
    converted?: boolean;
    voiceNote?: boolean;
}
export interface PreparedOutgoingMedia {
    content: AnyMessageContent;
    metadata: OutgoingMediaMetadata;
    dispose(): Promise<void>;
}
interface MediaOptions {
    workspaceRoot: string;
    mediaRoot?: string;
    maxBytes?: number;
    ffmpegCommands?: readonly string[];
    conversionTimeoutMs?: number;
}

const documentMimes: Record<string, string> = {
    '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.json': 'application/json', '.zip': 'application/zip'
};

/** Validates explicit local-file egress and owns an immutable upload snapshot. */
export class OutgoingMediaService {
    private readonly mediaRoot: string;
    private readonly maxBytes: number;

    constructor(private readonly options: MediaOptions) {
        this.mediaRoot = options.mediaRoot ?? createStoragePaths().mediaDir;
        this.maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    }

    public async prepare(request: OutgoingMediaRequest, signal?: AbortSignal): Promise<PreparedOutgoingMedia> {
        this.checkAbort(signal);
        if (!request.path || (!isAbsolute(request.path) && /^[a-z][a-z\d+.-]*:/i.test(request.path))) {
            throw new Error(t('media.invalidPath'));
        }
        if (!['document', 'image', 'audio', 'video'].includes(request.type)) throw new Error(t('media.unsupported'));
        if ((request.voiceNote && request.type !== 'audio') || (request.type === 'audio' && request.caption)) throw new Error(t('media.unsupported'));
        const source = await realpath(resolve(this.options.workspaceRoot, request.path));
        const workspace = await realpath(this.options.workspaceRoot);
        const media = await realpath(this.mediaRoot).catch(() => undefined);
        const inMedia = Boolean(media && this.contains(media, source));
        if ((!this.contains(workspace, source) && !inMedia) || this.isCredentialPath(source, inMedia)) {
            throw new Error(t('media.forbidden'));
        }
        const ancestors = await this.captureAncestors(source);
        const expected = await lstat(source);
        if (!expected.isFile()) throw new Error(t('media.invalidFile'));
        // NONBLOCK prevents FIFO replacement from wedging open before fstat can reject it.
        const input = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
        let directory: string | undefined;
        try {
            const stats = await input.stat();
            await this.verifyOpenedFile(source, expected, input, ancestors);
            if (!stats.isFile() || stats.size === 0) throw new Error(t('media.invalidFile'));
            if (stats.size > this.maxBytes) throw new Error(t('media.tooLarge', { maxMiB: this.maxBytes / 1024 / 1024 }));
            const header = Buffer.alloc(4096);
            const { bytesRead } = await input.read(header, 0, header.length, 0);
            const prefix = header.subarray(0, bytesRead);
            if (/-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY(?: BLOCK)?-----/.test(prefix.toString('utf8'))) {
                throw new Error(t('media.forbidden'));
            }
            if (request.type === 'image' && !this.imageMime(prefix)) throw new Error(t('media.unsupported'));
            if ((request.type === 'audio' || request.type === 'video') && !this.mediaContainer(prefix)) throw new Error(t('media.unsupported'));
            this.checkAbort(signal);
            directory = await mkdtemp(join(tmpdir(), 'whatsapp-outgoing-'));
            const snapshot = join(directory, 'upload' + extname(source).toLowerCase());
            let size = await this.copySnapshot(input, snapshot, signal);
            await this.verifyOpenedFile(source, expected, input, ancestors);
            this.checkAbort(signal);
            const copiedHeader = await this.readHeader(snapshot);
            if (/-----BEGIN (?:[A-Z0-9 ]* )?PRIVATE KEY(?: BLOCK)?-----/.test(copiedHeader.toString('utf8'))) throw new Error(t('media.forbidden'));
            let uploadPath = snapshot;
            let converted: boolean | undefined;
            let seconds: number | undefined;
            let command: string | undefined;
            let jpegThumbnail: string | undefined;
            const deadline = Date.now() + (this.options.conversionTimeoutMs ?? 60_000);
            let mimetype = request.type === 'image' ? this.imageMime(copiedHeader) : documentMimes[extname(source).toLowerCase()] ?? 'application/octet-stream';
            if (!mimetype) throw new Error(t('media.unsupported'));
            if (request.type === 'audio' || request.type === 'video') {
                const result = await this.prepareAudioVideo(snapshot, directory, request, copiedHeader, deadline, signal);
                uploadPath = result.path;
                mimetype = result.mimetype;
                converted = result.converted;
                seconds = result.seconds;
                command = result.command;
                size = (await stat(uploadPath)).size;
                if (!size || size > this.maxBytes) throw new Error(t('media.tooLarge', { maxMiB: this.maxBytes / 1024 / 1024 }));
            }
            if (request.type === 'image' || request.type === 'video') {
                jpegThumbnail = await this.prepareThumbnail(uploadPath, directory, deadline, signal, command);
            }
            this.checkAbort(signal);
            const fileName = converted ? basename(source, extname(source)) + extname(uploadPath) : basename(source);
            const metadata: OutgoingMediaMetadata = { type: request.type, fileName, mimetype, size,
                ...(converted !== undefined ? { converted } : {}), ...(request.type === 'audio' ? { voiceNote: Boolean(request.voiceNote) } : {}) };
            // Baileys streams an owned local snapshot, never a user-provided network URL.
            const payload = { url: uploadPath };
            // Explicit empty waveform means unavailable; never invoke Baileys' unowned decoder.
            const audioContent = { audio: payload, mimetype, ptt: Boolean(request.voiceNote), seconds, waveform: new Uint8Array(0) };
            const content: AnyMessageContent = request.type === 'image' ? { image: payload, mimetype, caption: request.caption, jpegThumbnail }
                : request.type === 'audio' ? audioContent
                : request.type === 'video' ? { video: payload, mimetype, caption: request.caption, jpegThumbnail }
                : { document: payload, fileName, mimetype, caption: request.caption };
            const ownedDirectory = directory;
            return { content, metadata, dispose: () => rm(ownedDirectory, { recursive: true, force: true }) };
        } catch (error) {
            if (directory) await rm(directory, { recursive: true, force: true });
            throw error;
        } finally {
            await input.close();
        }
    }

    private async copySnapshot(input: FileHandle, path: string, signal?: AbortSignal): Promise<number> {
        const output = await open(path, 'wx', 0o600);
        const buffer = Buffer.alloc(64 * 1024);
        let total = 0;
        try {
            while (true) {
                this.checkAbort(signal);
                const { bytesRead } = await input.read(buffer, 0, buffer.length, total);
                if (!bytesRead) break;
                if (total + bytesRead > this.maxBytes) throw new Error(t('media.tooLarge', { maxMiB: this.maxBytes / 1024 / 1024 }));
                let written = 0;
                while (written < bytesRead) {
                    const result = await output.write(buffer, written, bytesRead - written, total + written);
                    if (!result.bytesWritten) throw new Error(t('media.invalidFile'));
                    written += result.bytesWritten;
                }
                total += bytesRead;
            }
            if (!total) throw new Error(t('media.invalidFile'));
            return total;
        } finally {
            await output.close();
        }
    }

    private async captureAncestors(path: string): Promise<Array<{ path: string; dev: number; ino: number }>> {
        const ancestors: Array<{ path: string; dev: number; ino: number }> = [];
        let parent = dirname(path);
        while (true) {
            const entry = await lstat(parent);
            if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(t('media.forbidden'));
            ancestors.push({ path: parent, dev: entry.dev, ino: entry.ino });
            const next = dirname(parent);
            if (next === parent) return ancestors;
            parent = next;
        }
    }

    private async verifyOpenedFile(path: string, expected: Stats, file: FileHandle, ancestors: Array<{ path: string; dev: number; ino: number }>): Promise<void> {
        const opened = await file.stat();
        const named = await lstat(path);
        const sameFile = (entry: Stats) => entry.isFile() && !entry.isSymbolicLink()
            && entry.dev === expected.dev && entry.ino === expected.ino && entry.size === expected.size
            && entry.mtimeMs === expected.mtimeMs && entry.ctimeMs === expected.ctimeMs;
        if (!sameFile(opened) || !sameFile(named) || await realpath(path) !== path) throw new Error(t('media.forbidden'));
        for (const ancestor of ancestors) {
            const current = await lstat(ancestor.path);
            if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== ancestor.dev || current.ino !== ancestor.ino) {
                throw new Error(t('media.forbidden'));
            }
        }
    }

    private async readHeader(path: string): Promise<Buffer> {
        const file = await open(path, 'r');
        try {
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
            return buffer.subarray(0, bytesRead);
        } finally { await file.close(); }
    }

    private mediaContainer(header: Buffer): string | undefined {
        if (header.subarray(0, 4).toString() === 'OggS') return 'ogg';
        if (header.subarray(0, 4).toString() === 'fLaC') return 'flac';
        if (header.subarray(0, 3).toString() === 'ID3' || (header[0] === 255 && (header[1] & 0xe0) === 0xe0)) return 'mpeg';
        if (header.subarray(4, 8).toString() === 'ftyp') return header.subarray(8, 12).toString() === 'qt  ' ? 'mov' : 'mp4';
        if (header.subarray(0, 4).toString() === 'RIFF') {
            if (header.subarray(8, 12).toString() === 'WAVE') return 'wav';
            if (header.subarray(8, 12).toString() === 'AVI ') return 'avi';
        }
        if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'matroska';
        return undefined;
    }

    private async prepareAudioVideo(path: string, directory: string, request: OutgoingMediaRequest, header: Buffer, deadline: number, signal?: AbortSignal): Promise<{ path: string; mimetype: string; converted: boolean; command: string; seconds?: number }> {
        const container = this.mediaContainer(header);
        if (!container) throw new Error(t('media.unsupported'));
        let command: string | undefined;
        let info = '';
        for (const candidate of this.options.ffmpegCommands ?? getFfmpegCommands()) {
            try {
                const probe = await this.runFfmpeg(candidate, ['-nostdin', '-hide_banner', '-protocol_whitelist', 'file,pipe', '-i', path], deadline, signal);
                if (!/Input #0,/.test(probe.stderr)) throw new Error(t('media.conversionFailed'));
                command = candidate;
                info = probe.stderr;
                break;
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
            }
        }
        if (!command) throw new Error(t('media.ffmpegMissing'));
        const duration = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(info);
        const seconds = duration ? Math.ceil(Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) : undefined;
        const details = { command, ...(request.type === 'audio' ? { seconds } : {}) };
        const audio = /Audio:\s*([\w-]+)/.exec(info)?.[1];
        const videoLine = info.split('\n').find(line => /Video:/.test(line) && !/attached pic/.test(line));
        const video = videoLine ? /Video:\s*([\w-]+)/.exec(videoLine)?.[1] : undefined;
        if (request.type === 'audio') {
            if (!audio || video || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) throw new Error(t('media.unsupported'));
            if (container === 'ogg' && audio === 'opus') return { ...details, path, mimetype: request.voiceNote ? 'audio/ogg; codecs=opus' : 'audio/ogg', converted: false };
            if (!request.voiceNote && container === 'mpeg' && audio === 'mp3') return { ...details, path, mimetype: 'audio/mpeg', converted: false };
            if (!request.voiceNote && container === 'mp4' && audio === 'aac') return { ...details, path, mimetype: 'audio/mp4', converted: false };
        } else {
            if (!video) throw new Error(t('media.unsupported'));
            if (container === 'mp4' && video === 'h264' && (!audio || audio === 'aac') && /\byuv420p\b/.test(videoLine ?? '')) return { ...details, path, mimetype: 'video/mp4', converted: false };
        }
        const output = join(directory, request.type === 'video' ? 'converted.mp4' : request.voiceNote ? 'voice.ogg' : 'audio.m4a');
        const encoding = request.type === 'video'
            ? ['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-movflags', '+faststart']
            : request.voiceNote ? ['-map', '0:a:0', '-vn', '-c:a', 'libopus', '-ar', '48000', '-ac', '1', '-b:a', '32k']
                : ['-map', '0:a:0', '-vn', '-c:a', 'aac', '-ac', '2', '-movflags', '+faststart'];
        const result = await this.runFfmpeg(command, ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', path, ...encoding, output], deadline, signal, output);
        if (result.code !== 0) throw new Error(t('media.conversionFailed'));
        await chmod(output, 0o600);
        return { ...details, path: output, mimetype: request.type === 'video' ? 'video/mp4' : request.voiceNote ? 'audio/ogg; codecs=opus' : 'audio/mp4', converted: true };
    }

    private async prepareThumbnail(path: string, directory: string, deadline: number, signal?: AbortSignal, selected?: string): Promise<string> {
        const output = join(directory, 'thumbnail.jpg');
        for (const command of selected ? [selected] : this.options.ffmpegCommands ?? getFfmpegCommands()) {
            try {
                const result = await this.runFfmpeg(command, ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', path, '-frames:v', '1', '-vf', 'scale=32:32:force_original_aspect_ratio=decrease', '-f', 'image2', output], deadline, signal, output);
                if (result.code !== 0) throw new Error(t('media.conversionFailed'));
                await chmod(output, 0o600);
                const file = await stat(output);
                if (!file.size || file.size > 64 * 1024) throw new Error(t('media.conversionFailed'));
                return (await readFile(output)).toString('base64');
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
            }
        }
        throw new Error(t('media.ffmpegMissing'));
    }

    private runFfmpeg(command: string, args: string[], deadline: number, signal?: AbortSignal, output?: string): Promise<{ code: number | null; stderr: string }> {
        this.checkAbort(signal);
        const remaining = deadline - Date.now();
        if (remaining <= 0) return Promise.reject(new Error(t('media.conversionTimeout')));
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            let failure: Error | undefined;
            let closed = false;
            let forceKill: ReturnType<typeof setTimeout> | undefined;
            const stop = (error: Error) => {
                if (closed || failure) return;
                failure = error;
                child.kill('SIGTERM');
                forceKill = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 2_000);
            };
            const abort = () => stop(new Error(t('media.aborted')));
            const timer = setTimeout(() => stop(new Error(t('media.conversionTimeout'))), remaining);
            const sizeCheck = output ? setInterval(() => {
                void stat(output).then(file => {
                    if (!closed && file.size > this.maxBytes) stop(new Error(t('media.tooLarge', { maxMiB: this.maxBytes / 1024 / 1024 })));
                }, () => {});
            }, 100) : undefined;
            child.stderr?.on('data', (chunk: Buffer) => {
                if (Buffer.byteLength(stderr) + chunk.length > 64 * 1024) stop(new Error(t('media.conversionFailed')));
                else stderr += chunk.toString();
            });
            child.on('error', error => { failure ??= error; });
            child.on('close', code => {
                closed = true;
                clearTimeout(timer);
                if (forceKill) clearTimeout(forceKill);
                if (sizeCheck) clearInterval(sizeCheck);
                signal?.removeEventListener('abort', abort);
                if (failure) reject(failure);
                else resolve({ code, stderr });
            });
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
        });
    }

    private imageMime(header: Buffer): string | undefined {
        if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
        if (header[0] === 255 && header[1] === 216 && header[2] === 255) return 'image/jpeg';
        return undefined;
    }

    private contains(root: string, file: string): boolean {
        const path = relative(root, file);
        return path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path));
    }

    private isCredentialPath(path: string, inMedia: boolean): boolean {
        const parts = path.split(/[\\/]/);
        if (parts.some(part => /^\.env/i.test(part) || /^(?:auth(?:[-_].*)?|credentials|\.ssh|\.gnupg|\.aws|\.azure|\.git)$/i.test(part))) return true;
        if (/^(?:auth|creds|credentials|secrets)\.json$|^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?$|\.(?:pem|key|p8|p12|pfx|kdbx|asc)$/i.test(basename(path))) return true;
        const paths = createStoragePaths();
        return !inMedia && [join(homedir(), '.pi', 'agent'), paths.root, paths.legacyRoot, join(homedir(), '.pi', 'whatsapp-pi')]
            .some(root => this.contains(root, path));
    }

    private checkAbort(signal?: AbortSignal): void {
        if (signal?.aborted) throw new Error(t('media.aborted'));
    }
}
