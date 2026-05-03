import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { join } from 'path';
import { readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import { homedir } from 'os';
import { SessionStatus } from '../models/whatsapp.types.js';

export interface Contact {
    number: string;
    name?: string;
}

export class SessionManager {
    // Data is stored in the user's home directory to persist across updates
    private readonly baseDir: string;
    private readonly authStateDir: string;
    private readonly configPath: string;

    private status: SessionStatus = 'logged-out';
    private allowList: Contact[] = [];
    private blockList: Contact[] = [];
    private ignoredNumbers: Contact[] = [];
    private hasAuthState = false;
    private openaiKey: string = '';
    private visionModel: string = 'gpt-4o';

    constructor(baseDir = join(homedir(), '.pi', 'whatsapp-pi')) {
        this.baseDir = baseDir;
        this.authStateDir = join(this.baseDir, 'auth');
        this.configPath = join(this.baseDir, 'config.json');
    }

    private async ensureStorageDirectories() {
        await mkdir(this.baseDir, { recursive: true });
        await mkdir(this.authStateDir, { recursive: true });
    }

    public async ensureInitialized() {
        try {
            await this.ensureStorageDirectories();
            await this.loadConfig();
            await this.syncAuthStateFromDisk();
        } catch {
            // Initialization is best-effort; callers can continue with defaults.
        }
    }

    private async loadConfig() {
        try {
            const data = await readFile(this.configPath, 'utf-8');
            const { config, recovered } = this.parseConfig(data);
            
            const cleanContact = (item: any): Contact | null => {
                if (typeof item === 'string') return { number: item };
                if (item && typeof item === 'object') {
                    let num = item.number;
                    // Unroll nested objects if any
                    while (num && typeof num === 'object' && num.number) {
                        num = num.number;
                    }
                    if (typeof num === 'string') {
                        return { number: num, name: item.name };
                    }
                }
                return null;
            };

            this.allowList = (config.allowList || []).map(cleanContact).filter(Boolean) as Contact[];
            this.blockList = (config.blockList || []).map(cleanContact).filter(Boolean) as Contact[];
            this.ignoredNumbers = (config.ignoredNumbers || []).map(cleanContact).filter(Boolean) as Contact[];
            this.status = config.status || 'logged-out';
            this.hasAuthState = Boolean(config.hasAuthState);
            this.openaiKey = config.openaiKey || '';
            this.visionModel = config.visionModel || 'gpt-4o';

            if (recovered) {
                await this.saveConfig();
            }
        } catch {
            // File not found is fine
        }
    }

    private parseConfig(data: string): { config: any; recovered: boolean } {
        try {
            return { config: JSON.parse(data), recovered: false };
        } catch (error) {
            const objectEnd = this.findFirstJsonObjectEnd(data);
            if (objectEnd < 0) {
                throw error;
            }

            return {
                config: JSON.parse(data.slice(0, objectEnd + 1)),
                recovered: true
            };
        }
    }

    private findFirstJsonObjectEnd(data: string): number {
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = 0; i < data.length; i++) {
            const char = data[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (char === '\\') {
                    escaped = true;
                } else if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    return i;
                }
            }
        }

        return -1;
    }

    public async saveConfig() {
        const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
        try {
            const config = {
                allowList: this.allowList,
                blockList: this.blockList,
                ignoredNumbers: this.ignoredNumbers,
                status: this.status,
                hasAuthState: this.hasAuthState,
                openaiKey: this.openaiKey,
                visionModel: this.visionModel
            };
            await mkdir(this.baseDir, { recursive: true });
            await writeFile(tempPath, JSON.stringify(config, null, 2));
            await rename(tempPath, this.configPath);
        } catch (error) {
            await rm(tempPath, { force: true }).catch(() => {});
            console.error('Failed to save config:', error);
        }
    }

    getAllowList(): Contact[] {
        return this.allowList;
    }

    getAllowedContact(number: string): Contact | undefined {
        return this.allowList.find(c => c.number === number);
    }

    getBlockList(): Contact[] {
        return this.blockList;
    }

    getIgnoredNumbers(): Contact[] {
        return this.ignoredNumbers;
    }

    async removeIgnoredNumber(number: string) {
        this.ignoredNumbers = this.ignoredNumbers.filter(c => c.number !== number);
        await this.saveConfig();
    }

    async addNumber(number: any, name?: string) {
        // Handle potential nested objects from legacy bugs
        let cleanNumber = number;
        while (cleanNumber && typeof cleanNumber === 'object' && cleanNumber.number) {
            cleanNumber = cleanNumber.number;
        }

        if (typeof cleanNumber !== 'string') {
            console.warn('[SessionManager] Attempted to add invalid number:', cleanNumber);
            return;
        }

        const existing = this.allowList.find(c => c.number === cleanNumber);
        if (!existing) {
            this.allowList.push({ number: cleanNumber, name });
            // Remove from blockList and ignoredNumbers if it was there
            this.blockList = this.blockList.filter(c => c.number !== cleanNumber);
            this.ignoredNumbers = this.ignoredNumbers.filter(c => c.number !== cleanNumber);
            await this.saveConfig();
            return;
        }

        if (name && !existing.name) {
            existing.name = name;
            await this.saveConfig();
        }
    }

    async removeNumber(number: string) {
        this.allowList = this.allowList.filter(c => c.number !== number);
        await this.saveConfig();
    }

    async setAllowedContactAlias(number: string, alias: string) {
        const trimmedAlias = alias.trim();
        if (!trimmedAlias) {
            return;
        }

        const contact = this.getAllowedContact(number);
        if (!contact) {
            return;
        }

        contact.name = trimmedAlias;
        await this.saveConfig();
    }

    async removeAllowedContactAlias(number: string) {
        const contact = this.getAllowedContact(number);
        if (!contact || !contact.name) {
            return;
        }

        delete contact.name;
        await this.saveConfig();
    }

    async blockNumber(number: string, name?: string) {
        if (!this.blockList.find(c => c.number === number)) {
            this.blockList.push({ number, name });
            // Remove from allowList if it was there
            this.allowList = this.allowList.filter(c => c.number !== number);
            await this.saveConfig();
        }
    }

    async unblockNumber(number: string) {
        this.blockList = this.blockList.filter(c => c.number !== number);
        await this.saveConfig();
    }

    async unblockAndAllow(number: string) {
        const blocked = this.blockList.find(c => c.number === number);
        this.blockList = this.blockList.filter(c => c.number !== number);
        if (!this.allowList.find(c => c.number === number)) {
            this.allowList.push({ number, name: blocked?.name });
        }
        await this.saveConfig();
    }

    isAllowed(number: string): boolean {
        return this.allowList.some(c => c.number === number);
    }

    isBlocked(number: string): boolean {
        return this.blockList.some(c => c.number === number);
    }

    async trackIgnoredNumber(number: string, name?: string) {
        // Only track if not already in allow list, block list, or ignored list
        if (!this.allowList.find(c => c.number === number) &&
            !this.blockList.find(c => c.number === number) &&
            !this.ignoredNumbers.find(c => c.number === number)) {
            this.ignoredNumbers.push({ number, name });
            await this.saveConfig();
        }
    }

    public async isRegistered(): Promise<boolean> {
        await this.syncAuthStateFromDisk();
        return this.hasAuthState;
    }

    async markAuthStateAvailable() {
        if (!this.hasAuthState) {
            this.hasAuthState = true;
            await this.saveConfig();
        }
    }

    async getAuthState() {
        await this.ensureStorageDirectories();
        return await useMultiFileAuthState(this.authStateDir);
    }

    private async syncAuthStateFromDisk() {
        const nextHasAuthState = await this.hasCredentialsFile();
        const nextStatus = nextHasAuthState || this.status !== 'connected'
            ? this.status
            : 'disconnected';

        if (nextHasAuthState !== this.hasAuthState || nextStatus !== this.status) {
            this.hasAuthState = nextHasAuthState;
            this.status = nextStatus;
            await this.saveConfig();
        }
    }

    private async hasCredentialsFile(): Promise<boolean> {
        try {
            await readFile(join(this.authStateDir, 'creds.json'));
            return true;
        } catch {
            return false;
        }
    }

    async deleteAuthState() {
        try {
            await rm(this.authStateDir, { recursive: true, force: true });
            await mkdir(this.authStateDir, { recursive: true });
            this.status = 'logged-out';
            this.hasAuthState = false;
            await this.saveConfig();
        } catch (error) {
            console.error('Failed to delete auth state:', error);
        }
    }

    getStatus(): SessionStatus {
        return this.status;
    }

    async setStatus(status: SessionStatus) {
        this.status = status;
        await this.saveConfig();
    }

    getOpenaiKey(): string {
        return this.openaiKey;
    }

    async setOpenaiKey(key: string) {
        this.openaiKey = key;
        await this.saveConfig();
    }

    getVisionModel(): string {
        return this.visionModel;
    }

    async setVisionModel(model: string) {
        this.visionModel = model;
        await this.saveConfig();
    }

    getAuthStateDir(): string {
        return this.authStateDir;
    }
}
