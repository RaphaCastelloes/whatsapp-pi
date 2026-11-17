import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants } from 'node:fs';
import { mkdtemp, mkdir, realpath, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutgoingMediaService } from '../../src/services/outgoing-media.service.ts';

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('node:fs/promises', async importOriginal => {
    const original = await importOriginal<typeof import('node:fs/promises')>();
    mocks.open.mockImplementation(original.open);
    return { ...original, open: mocks.open };
});
const run = promisify(execFile);

describe('opened-file authority and nonregular inputs', () => {
    let root: string;
    beforeEach(async () => {
        const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        mocks.open.mockReset().mockImplementation(original.open);
        root = await mkdtemp(join(tmpdir(), 'wa-fs-test-'));
    });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });
    it('rejects an ancestor swapped to an outside symlink between validation and open', async () => {
        const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        const workspace = join(root, 'workspace');
        const inside = join(workspace, 'export');
        const outside = join(root, 'outside');
        await mkdir(inside, { recursive: true });
        await mkdir(outside);
        const file = join(inside, 'report.json');
        await writeFile(file, '{"fixture":"inside"}');
        await writeFile(join(outside, 'report.json'), '{"fixture":"outside-not-a-real-credential"}');
        const canonical = await realpath(file);
        mocks.open.mockImplementationOnce(async (path, flags, mode) => {
            expect(path).toBe(canonical);
            await rename(inside, inside + '.saved');
            await symlink(outside, inside, 'dir');
            return original.open(path, flags, mode);
        });
        const pending = new OutgoingMediaService({ workspaceRoot: workspace }).prepare({ path: file, type: 'document' });
        try {
            await expect(pending).rejects.toThrow();
        } finally {
            await pending.then(value => value.dispose(), () => {});
        }
    });
    it.skipIf(process.platform === 'win32').each(['existing', 'replacement'])('rejects a %s FIFO promptly without leaving a blocked open', async kind => {
        const original = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
        const file = join(root, 'fixture.pipe');
        if (kind === 'existing') await run('mkfifo', [file]);
        else {
            await writeFile(file, 'regular fixture');
            mocks.open.mockImplementationOnce(async (path, flags, mode) => {
                await unlink(file);
                await run('mkfifo', [file]);
                return original.open(path, flags, mode);
            });
        }
        // Unblock a broken implementation after 200 ms so the red test cannot wedge a worker.
        const release = new Promise<void>(resolve => setTimeout(() => {
            void original.open(file, constants.O_WRONLY | constants.O_NONBLOCK).then(handle => handle.close(), () => {}).finally(resolve);
        }, 200));
        const pending = new OutgoingMediaService({ workspaceRoot: root }).prepare({ path: file, type: 'document' });
        const rejectedPromptly = await Promise.race([pending.then(() => false, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))]);
        await release;
        await pending.then(value => value.dispose(), () => {});
        expect(rejectedPromptly).toBe(true);
    });
});
