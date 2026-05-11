import { downloadContentFromMessage } from 'baileys';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LiteParse } from '@llamaindex/liteparse';
import { AudioService } from './audio.service.js';
import type { IncomingResolution } from './incoming-message.resolver.js';
import { WhatsAppPiLogger } from './whatsapp-pi.logger.js';
import { t } from '../i18n.js';

export interface ProcessedIncomingContent {
    text: string;
    imageBuffer?: Buffer;
    imageMimeType?: string;
}

const PDF_PREVIEW_LIMIT = 1200;

export class IncomingMediaService {
    private readonly pdfParser = new LiteParse({ ocrEnabled: true });

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
        this.logger.log(t('incoming.media.audioTranscribing', { pushName }));
        const transcription = await this.audioService.transcribe(audioMessage);
        return { text: t('incoming.media.audioTranscribed', { transcription }) };
    }

    private async processImage(imageMessage: any, fallbackText: string, pushName: string): Promise<ProcessedIncomingContent> {
        this.logger.log(t('incoming.media.imageDownloading', { pushName }));

        try {
            const imageBuffer = await this.downloadMessage(imageMessage, 'image');
            const rawMime = imageMessage.mimetype || 'image/jpeg';
            let imageMimeType = rawMime.toLowerCase().split(';')[0].trim();
            if (imageMimeType === 'image/jpg') imageMimeType = 'image/jpeg';

            this.logger.log(t('incoming.media.imageDownloaded', { imageMimeType, rawMime, size: imageBuffer.length }));

            return {
                text: fallbackText || t('incoming.media.image'),
                imageBuffer,
                imageMimeType
            };
        } catch (error) {
            this.logger.error(t('incoming.media.imageDownloadFailed'), error);
            return { text: t('incoming.media.imageDownloadFailedText') };
        }
    }

    private async processDocument(documentMessage: any, pushName: string): Promise<ProcessedIncomingContent> {
        const fileName = documentMessage.fileName || 'unnamed_document';
        const mimeType = documentMessage.mimetype || 'application/octet-stream';
        const fileSize = documentMessage.fileLength ? Number(documentMessage.fileLength) : 0;

        this.logger.log(t('incoming.media.documentDownloading', { pushName, fileName }));

        try {
            const buffer = await this.downloadMessage(documentMessage, 'document');
            const relativePath = await this.saveDocument(fileName, buffer);

            this.logger.log(t('incoming.media.documentSaved', { relativePath, size: buffer.length }));

            let text = t('incoming.media.documentReceived', { fileName }) + '\n'
                + t('incoming.media.documentMimeType', { mimeType }) + '\n'
                + t('incoming.media.documentSize', { size: this.formatFileSize(fileSize) }) + '\n'
                + t('incoming.media.documentLocation', { relativePath });

            if (this.isPdfDocument(fileName, mimeType)) {
                const preview = await this.extractPdfPreview(buffer);
                if (preview) {
                    text += `\n\n${t('incoming.media.documentPdfPreviewHeading')}\n${preview}`;
                } else {
                    text += `\n\n${t('incoming.media.documentPdfFallbackNotice')}`;
                }
            }

            if (documentMessage.caption) {
                text += `\n\n${t('incoming.media.documentDescription', { caption: documentMessage.caption })}`;
            }

            return { text };
        } catch (error) {
            this.logger.error(t('incoming.media.documentDownloadFailed'), error);
            return { text: t('incoming.media.documentDownloadFailedText', { fileName }) };
        }
    }

    private async extractPdfPreview(buffer: Buffer): Promise<string | null> {
        try {
            const result = await this.pdfParser.parse(buffer);
            return this.formatPdfPreview(result.text);
        } catch (error) {
            this.logger.warn('[WhatsApp-Pi] PDF parsing failed, falling back to storage-only behavior.', error);
            return null;
        }
    }

    private formatPdfPreview(text: string | undefined | null): string | null {
        const normalized = (text || '').replace(/\r\n/g, '\n').trim();
        if (!normalized) {
            return null;
        }

        if (normalized.length <= PDF_PREVIEW_LIMIT) {
            return normalized;
        }

        return `${normalized.slice(0, PDF_PREVIEW_LIMIT)}…`;
    }

    private isPdfDocument(fileName: string, mimeType: string): boolean {
        const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
        return normalizedMimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
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
