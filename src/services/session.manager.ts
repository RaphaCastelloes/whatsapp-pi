import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rm, readFile, writeFile, mkdir } from 'fs/promises';
import { SessionStatus } from '../models/whatsapp.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Contact {
    number: string;
    name?: string;
}

export class SessionManager {
    // Data is stored in a fixed folder inside the extension project
    private readonly baseDir = join(__dirname, '..', '..', '.pi-data');
    private readonly authDir = join(this.baseDir, 'auth');
    private readonly configPath = join(this.baseDir, 'config.json');

    private status: SessionStatus = 'logged-out';
    private allowList: Contact[] = [];
    private blockList: Contact[] = [];
    private ignoredNumbers: Contact[] = [];

    public async ensureInitialized() {
        try {
            await mkdir(this.baseDir, { recursive: true });
            await mkdir(this.authDir, { recursive: true });
            await this.loadConfig();
        } catch (error) {}
    }

    private async loadConfig() {
        try {
            const data = await readFile(this.configPath, 'utf-8');
            const config = JSON.parse(data);
            
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
        } catch (error) {
            // File not found is fine
        }
    }

    public async saveConfig() {
        try {
            const config = {
                allowList: this.allowList,
                blockList: this.blockList,
                ignoredNumbers: this.ignoredNumbers,
                status: this.status
            };
            await writeFile(this.configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    getAllowList(): Contact[] {
        return this.allowList;
    }

    getBlockList(): Contact[] {
        return this.blockList;
    }

    getIgnoredNumbers(): Contact[] {
        return this.ignoredNumbers;
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

        if (!this.allowList.find(c => c.number === cleanNumber)) {
            this.allowList.push({ number: cleanNumber, name });
            // Remove from blockList and ignoredNumbers if it was there
            this.blockList = this.blockList.filter(c => c.number !== cleanNumber);
            this.ignoredNumbers = this.ignoredNumbers.filter(c => c.number !== cleanNumber);
            await this.saveConfig();
        }
    }

    async removeNumber(number: string) {
        this.allowList = this.allowList.filter(c => c.number !== number);
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
        try {
            const credsPah = join(this.authDir, 'creds.json');
            await readFile(credsPah);
            return true;
        } catch {
            return false;
        }
    }

    async getAuthState() {
        return await useMultiFileAuthState(this.authDir);
    }

    async clearSession() {
        try {
            await rm(this.authDir, { recursive: true, force: true });
            this.status = 'logged-out';
            await this.saveConfig();
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    getStatus(): SessionStatus {
        return this.status;
    }

    async setStatus(status: SessionStatus) {
        this.status = status;
        await this.saveConfig();
    }

    getAuthDir(): string {
        return this.authDir;
    }
}
