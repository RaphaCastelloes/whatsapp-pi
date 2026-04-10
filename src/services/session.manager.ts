import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rm, readFile, writeFile, mkdir } from 'fs/promises';
import { SessionStatus } from '../models/whatsapp.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SessionManager {
    // Data is stored in a fixed folder inside the extension project
    private readonly baseDir = join(__dirname, '..', '..', '.pi-data');
    private readonly authDir = join(this.baseDir, 'auth');
    private readonly configPath = join(this.baseDir, 'config.json');

    private status: SessionStatus = 'logged-out';
    private allowList: string[] = [];

    public async ensureInitialized() {
        try {
            await mkdir(this.baseDir, { recursive: true });
            await this.loadConfig();
        } catch (error) {}
    }

    private async loadConfig() {
        try {
            const data = await readFile(this.configPath, 'utf-8');
            const config = JSON.parse(data);
            this.allowList = config.allowList || [];
            this.status = config.status || 'logged-out';
        } catch (error) {
            // File not found is fine
        }
    }

    public async saveConfig() {
        try {
            const config = {
                allowList: this.allowList,
                status: this.status
            };
            await writeFile(this.configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    getAllowList(): string[] {
        return this.allowList;
    }

    async addNumber(number: string) {
        if (!this.allowList.includes(number)) {
            this.allowList.push(number);
            await this.saveConfig();
        }
    }

    async removeNumber(number: string) {
        this.allowList = this.allowList.filter(n => n !== number);
        await this.saveConfig();
    }

    isAllowed(number: string): boolean {
        return this.allowList.includes(number);
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
