import { access, mkdir, readdir, cp, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export function getDefaultStorageRoot(): string {
    return join(homedir(), '.pi', 'agent', 'extensions', 'whatsapp-pi');
}

export function getDefaultLegacyStorageRoot(): string {
    return join(homedir(), '.pi', 'agent', 'extension', 'whatsapp-pi');
}

export interface StoragePaths {
    root: string;
    legacyRoot: string;
    authStateDir: string;
    configPath: string;
    recentsDir: string;
    recentsPath: string;
    logDir: string;
    logPath: string;
    mediaDir: string;
}

export function createStoragePaths(root = getDefaultStorageRoot(), legacyRoot = getDefaultLegacyStorageRoot()): StoragePaths {
    return {
        root,
        legacyRoot,
        authStateDir: join(root, 'auth'),
        configPath: join(root, 'config.json'),
        recentsDir: join(root, 'recents'),
        recentsPath: join(root, 'recents', 'recents.json'),
        logDir: root,
        logPath: join(root, 'whatsapp-pi.log'),
        mediaDir: join(root, 'whatsapp-medias')
    };
}

export async function ensureStorageDirectories(paths: Pick<StoragePaths, 'root' | 'authStateDir' | 'recentsDir' | 'logDir'>) {
    await mkdir(paths.root, { recursive: true });
    await mkdir(paths.authStateDir, { recursive: true });
    await mkdir(paths.recentsDir, { recursive: true });
    await mkdir(paths.logDir, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function copyEntry(source: string, target: string) {
    const sourceStats = await stat(source);
    if (sourceStats.isDirectory()) {
        await mkdir(target, { recursive: true });
        const entries = await readdir(source, { withFileTypes: true });
        for (const entry of entries) {
            await copyEntry(join(source, entry.name), join(target, entry.name));
        }
        return;
    }

    if (await pathExists(target)) {
        return;
    }

    await cp(source, target, { force: false, preserveTimestamps: true });
}

export async function migrateLegacyStorage(paths: Pick<StoragePaths, 'root' | 'legacyRoot'>): Promise<boolean> {
    const legacyRoots = [paths.legacyRoot, join(homedir(), '.pi', 'whatsapp-pi')]
        .filter((root, index, roots) => root && roots.indexOf(root) === index && root !== paths.root);

    let migrated = false;

    await mkdir(paths.root, { recursive: true });

    for (const legacyRoot of legacyRoots) {
        if (!(await pathExists(legacyRoot))) {
            continue;
        }

        const entries = await readdir(legacyRoot, { withFileTypes: true });

        for (const entry of entries) {
            await copyEntry(join(legacyRoot, entry.name), join(paths.root, entry.name));
        }

        migrated = true;
    }

    return migrated;
}
