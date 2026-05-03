import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AudioService } from './audio.service.js';
import type { IncomingResolution } from './incoming-message.resolver.js';
import { WhatsAppPiLogger } from './whatsapp-pi.logger.js';

export interface ProcessedIncomingContent {
    text: string;
    imageBuffer?: Buffer;
    imageMimeType?: string;
}

export class IncomingMediaService {
    constructor(
        private readonly audioService: AudioService,
        private readonly logger = new WhatsAppPiLogger(false)
    ) {}

    async process(resolved: IncomingResolution, pushName: string): Promise<ProcessedIncomingContent> {
        if (resolved.kind === 'audio') {
            return this.processAudio(resolved.audioMessage, pushName);
        }

        if (resolved.kind === 'image') {
            return this.processImage(resolved.imageMessage, resolved.text, pushName);
        }

        if (resolved.kind === 'document') {
            return this.processDocument(resolved.documentMessage, pushName);
        }

        return { text: resolved.text };
    }

    private async processAudio(audioMessage: any, pushName: string): Promise<ProcessedIncomingContent> {
        this.logger.log(`[WhatsApp-Pi] Transcribing audio from ${pushName}...`);
        const transcription = await this.audioService.transcribe(audioMessage);
        return { text: `[Transcribed Audio]: ${transcription}` };
    }

    private async processImage(imageMessage: any, fallbackText: string, pushName: string): Promise<ProcessedIncomingContent> {
        this.logger.log(`[WhatsApp-Pi] Downloading image from ${pushName}...`);

        try {
            const imageBuffer = await this.downloadMessage(imageMessage, 'image');
            const rawMime = imageMessage.mimetype || 'image/jpeg';
            let imageMimeType = rawMime.toLowerCase().split(';')[0].trim();
            if (imageMimeType === 'image/jpg') imageMimeType = 'image/jpeg';

            this.logger.log(`[WhatsApp-Pi] Image downloaded. MIME: ${imageMimeType} (original: ${rawMime}), Size: ${imageBuffer.length} bytes`);

            return {
                text: fallbackText || '[Image]',
                imageBuffer,
                imageMimeType
            };
        } catch (error) {
            this.logger.error('[WhatsApp-Pi] Failed to download image:', error);
            return { text: '[Image (download failed)]' };
        }
    }

    private async processDocument(documentMessage: any, pushName: string): Promise<ProcessedIncomingContent> {
        const fileName = documentMessage.fileName || 'unnamed_document';
        const mimeType = documentMessage.mimetype || 'application/octet-stream';
        const fileSize = documentMessage.fileLength ? Number(documentMessage.fileLength) : 0;

        this.logger.log(`[WhatsApp-Pi] Downloading document from ${pushName}: ${fileName}...`);

        try {
            const buffer = await this.downloadMessage(documentMessage, 'document');
            const relativePath = await this.saveDocument(fileName, buffer);

            this.logger.log(`[WhatsApp-Pi] Document saved to ${relativePath} (${buffer.length} bytes)`);

            let text = `[Document Received: ${fileName}]\n`
                + `MIME Type: ${mimeType}\n`
                + `Size: ${this.formatFileSize(fileSize)}\n`
                + `Location: ${relativePath}`;

            if (documentMessage.caption) {
                text += `\n\nDescription: ${documentMessage.caption}`;
            }

            return { text };
        } catch (error) {
            this.logger.error('[WhatsApp-Pi] Failed to download document:', error);
            return { text: `[Document: ${fileName} (download failed)]` };
        }
    }

    private async downloadMessage(message: any, type: 'image' | 'document'): Promise<Buffer> {
        const stream = await downloadContentFromMessage(message, type);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        return buffer;
    }

    private async saveDocument(fileName: string, buffer: Buffer): Promise<string> {
        const sanitized = fileName.replace(/[^a-z0-9._-]/gi, '_');
        const savedFileName = `${Date.now()}_${sanitized}`;
        const documentDir = join(process.cwd(), '.pi-data', 'whatsapp', 'documents');
        const absolutePath = join(documentDir, savedFileName);

        await mkdir(documentDir, { recursive: true });
        await writeFile(absolutePath, buffer);

        return `./.pi-data/whatsapp/documents/${savedFileName}`;
    }

    private formatFileSize(fileSize: number): string {
        if (fileSize > 1024 * 1024) {
            return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
        }

        return `${(fileSize / 1024).toFixed(1)} KB`;
    }
}
