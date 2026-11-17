import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OutgoingMediaService } from '../../src/services/outgoing-media.service.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGP4z8DwHwohFABFzAf5Zsv/OQAAAABJRU5ErkJggg==', 'base64');

describe('OutgoingMediaService file egress', () => {
    let root: string;
    let workspace: string;
    let media: string;
    let service: OutgoingMediaService;
    const prepared: Array<{ dispose(): Promise<void> }> = [];
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'wa-media-test-'));
        workspace = join(root, 'workspace');
        media = join(root, 'media');
        await mkdir(workspace);
        await mkdir(media);
        service = new OutgoingMediaService({ workspaceRoot: workspace, mediaRoot: media });
    });
    afterEach(async () => {
        await Promise.all(prepared.splice(0).map(item => item.dispose()));
        await rm(root, { recursive: true, force: true });
    });
    it.each([['report.pdf', '%PDF-1.4\ntest', 'application/pdf'], ['notes.md', '# Public test', 'text/markdown'], ['sheet.xlsx', 'PK\u0003\u0004test', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']])('snapshots %s with filename, MIME and caption', async (name, content, mimetype) => {
        const file = join(workspace, name);
        await writeFile(file, content);
        const result = await service.prepare({ path: file, type: 'document', caption: 'Test caption' });
        prepared.push(result);
        expect(result.metadata).toMatchObject({ fileName: name, mimetype, size: Buffer.byteLength(content), type: 'document' });
        expect(result.content).toMatchObject({ document: { url: expect.any(String) }, fileName: name, mimetype, caption: 'Test caption' });
        const snapshot = (result.content as { document: { url: string } }).document.url;
        expect(snapshot).not.toBe(file);
        await writeFile(file, 'changed after validation');
        expect((await readFile(snapshot)).toString()).toBe(content);
        await result.dispose();
        await expect(access(snapshot)).rejects.toThrow();
        await expect(access(file)).resolves.toBeUndefined();
    });
    it('accepts a real PNG by signature and sends it only as an explicit image', async () => {
        await writeFile(join(media, 'image.png'), png);
        const result = await service.prepare({ path: join(media, 'image.png'), type: 'image', caption: 'Image' });
        prepared.push(result);
        expect(result.content).toMatchObject({ image: { url: expect.any(String) }, mimetype: 'image/png', caption: 'Image' });
    });
    it('rejects type mismatch, URLs, missing, empty and directory inputs', async () => {
        const file = join(workspace, 'not-an-image.png');
        await writeFile(file, 'plain text');
        await writeFile(join(workspace, 'empty'), '');
        for (const path of ['https://example.com/a.png', 'data:image/png;base64,AAAA', join(workspace, 'missing'), join(workspace, 'empty'), workspace, file]) {
            await expect(service.prepare({ path, type: 'image' })).rejects.toThrow();
        }
    });
    it('enforces the size budget before copying', async () => {
        const file = join(workspace, 'large.txt');
        await writeFile(file, '123456789');
        const limited = new OutgoingMediaService({ workspaceRoot: workspace, mediaRoot: media, maxBytes: 8 });
        await expect(limited.prepare({ path: file, type: 'document' })).rejects.toThrow();
    });
    it('rejects outside roots and symlinks escaping a permitted root', async () => {
        const outside = join(root, 'outside.txt');
        await writeFile(outside, 'not approved');
        await symlink(outside, join(workspace, 'escape.txt'));
        for (const path of [outside, join(workspace, '../outside.txt'), join(workspace, 'escape.txt')]) {
            await expect(service.prepare({ path, type: 'document' })).rejects.toThrow();
        }
    });
    it('rejects credential names, auth folders and disguised private keys', async () => {
        await mkdir(join(workspace, 'auth'));
        for (const file of ['.env.production', 'id_rsa', 'private.pem', 'auth/creds.json', 'disguised.md']) {
            const path = join(workspace, file);
            await writeFile(path, file === 'disguised.md' ? '-----BEGIN PRIVATE KEY-----\nnot-a-real-key' : 'fixture');
            await expect(service.prepare({ path, type: 'document' })).rejects.toThrow();
        }
    });
    it('a pre-aborted request never prepares an upload', async () => {
        const path = join(workspace, 'test.md');
        await writeFile(path, 'safe fixture');
        const abort = new AbortController();
        abort.abort();
        await expect(service.prepare({ path, type: 'document' }, abort.signal)).rejects.toThrow();
    });
});
