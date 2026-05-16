import { useMultiFileAuthState } from 'baileys';
import { join } from 'path';
import { readFile, writeFile, mkdir, rm, rename } from 'fs/promises';
import { homedir } from 'os';
import { SessionStatus } from '../models/whatsapp.types.js';
import { t } from '../i18n.js';

export interface Contact {
    number: string;
    name?: string;
    sendNumber?: string;
}

export class SessionManager {
    // Data is stored in the user's home directory to persist across updates
    private readonly baseDir = join(homedir(), '.pi', 'whatsapp-pi');
    private authStateDir = join(this.baseDir, 'auth');
    private readonly configPath = join(this.baseDir, 'config.json');

    static isGroupJid(jid: string): boolean {
        return jid.endsWith('@g.us');
    }

    /**
     * Sets a group-specific auth directory so each agent bound to a group
     * registers as its own WhatsApp linked device.
     */
    setGroupJidForAuth(groupJid: string) {
        const sanitized = groupJid.replace(/[^a-zA-Z0-9]/g, '_');
        this.authStateDir = join(this.baseDir, `auth-${sanitized}`);
    }

    private status: SessionStatus = 'logged-out';
    private allowList: Contact[] = [];
    private allowedGroups: Contact[] = [];
    private ignoredNumbers: Contact[] = [];
    private hasAuthState = false;
    private openaiKey: string = '';
    private visionModel: string = 'gpt-4o';
    private operatorJid: string = '';

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
                        const sendNumber = typeof item.sendNumber === 'string' ? item.sendNumber : undefined;
                        return { number: num, name: item.name, sendNumber };
                    }
                }
                return null;
            };

            const loadedAllowList = (config.allowList || []).map(cleanContact).filter(Boolean) as Contact[];
            const loadedAllowedGroups = (config.allowedGroups || []).map(cleanContact).filter(Boolean) as Contact[];
            const migratedGroups = loadedAllowList.filter(c => SessionManager.isGroupJid(c.number));
            this.allowList = loadedAllowList.filter(c => !SessionManager.isGroupJid(c.number));
            this.allowedGroups = this.mergeContacts(loadedAllowedGroups, migratedGroups);
            this.ignoredNumbers = (config.ignoredNumbers || []).map(cleanContact).filter(Boolean) as Contact[];
            this.status = config.status || 'logged-out';
            this.hasAuthState = Boolean(config.hasAuthState);
            this.openaiKey = config.openaiKey || '';
            this.visionModel = config.visionModel || 'gpt-4o';
            this.operatorJid = config.operatorJid || '';

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
            this.hasAuthState = this.hasAuthState || await this.hasCredentialsFile();
            const config = {
                allowList: this.allowList,
                allowedGroups: this.allowedGroups,
                ignoredNumbers: this.ignoredNumbers,
                status: this.status,
                hasAuthState: this.hasAuthState,
                openaiKey: this.openaiKey,
                visionModel: this.visionModel,
                operatorJid: this.operatorJid
            };
            await mkdir(this.baseDir, { recursive: true });
            const serialized = JSON.stringify(config, null, 2);
            await writeFile(tempPath, serialized);
            try {
                await rename(tempPath, this.configPath);
            } catch {
                // Windows EPERM: atomic rename failed (file locked). Fall back to direct write.
                await writeFile(this.configPath, serialized);
                await rm(tempPath, { force: true }).catch(() => {});
            }
        } catch (error) {
            await rm(tempPath, { force: true }).catch(() => {});
            console.error(t('session.manager.failedSaveConfig'), error);
        }
    }

    getAllowList(): Contact[] {
        return this.allowList;
    }

    getAllowedContact(number: string): Contact | undefined {
        return this.allowList.find(c => c.number === number);
    }

    getAllowedGroups(): Contact[] {
        return this.allowedGroups;
    }

    getAllowedGroup(groupJid: string): Contact | undefined {
        return this.allowedGroups.find(c => c.number === groupJid);
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
            console.warn(t('session.manager.invalidNumber'), cleanNumber);
            return;
        }

        const existing = this.allowList.find(c => c.number === cleanNumber);
        if (!existing) {
            if (SessionManager.isGroupJid(cleanNumber)) {
                await this.addAllowedGroup(cleanNumber, name);
                return;
            }
            this.allowList.push({ number: cleanNumber, name });
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

    async addAllowedGroup(groupJid: string, name?: string) {
        if (!SessionManager.isGroupJid(groupJid)) {
            console.warn(t('session.manager.invalidNumber'), groupJid);
            return;
        }

        const existing = this.allowedGroups.find(c => c.number === groupJid);
        if (!existing) {
            this.allowedGroups.push({ number: groupJid, name });
            this.ignoredNumbers = this.ignoredNumbers.filter(c => c.number !== groupJid);
            await this.saveConfig();
            return;
        }

        if (name && !existing.name) {
            existing.name = name;
            await this.saveConfig();
        }
    }

    async removeAllowedGroup(groupJid: string) {
        this.allowedGroups = this.allowedGroups.filter(c => c.number !== groupJid);
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

    async setContactSendNumber(number: string, sendNumber: string) {
        const contact = this.getAllowedContact(number);
        if (!contact) return;
        contact.sendNumber = sendNumber.trim();
        await this.saveConfig();
    }

    async removeContactSendNumber(number: string) {
        const contact = this.getAllowedContact(number);
        if (!contact) return;
        delete contact.sendNumber;
        await this.saveConfig();
    }

    async setAllowedGroupAlias(groupJid: string, alias: string) {
        const trimmedAlias = alias.trim();
        if (!trimmedAlias) {
            return;
        }

        const group = this.getAllowedGroup(groupJid);
        if (!group) {
            return;
        }

        group.name = trimmedAlias;
        await this.saveConfig();
    }

    async removeAllowedGroupAlias(groupJid: string) {
        const group = this.getAllowedGroup(groupJid);
        if (!group || !group.name) {
            return;
        }

        delete group.name;
        await this.saveConfig();
    }

    isAllowed(number: string): boolean {
        return this.allowList.some(c => c.number === number);
    }

    isAllowedGroup(groupJid: string): boolean {
        return this.allowedGroups.some(c => c.number === groupJid);
    }

    isConversationAllowed(sender: string): boolean {
        return SessionManager.isGroupJid(sender)
            ? this.isAllowedGroup(sender)
            : this.isAllowed(sender);
    }

    async trackIgnoredNumber(number: string, name?: string) {
        // Only track if not already allowed or ignored.
        if (!this.isConversationAllowed(number) &&
            !this.ignoredNumbers.find(c => c.number === number)) {
            this.ignoredNumbers.push({ number, name });
            await this.saveConfig();
        }
    }

    private mergeContacts(primary: Contact[], secondary: Contact[]): Contact[] {
        const merged = [...primary];
        for (const contact of secondary) {
            const existing = merged.find(c => c.number === contact.number);
            if (!existing) {
                merged.push(contact);
            } else {
                if (!existing.name && contact.name) {
                    existing.name = contact.name;
                }
            }
        }
        return merged;
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
            console.error(t('session.manager.failedDeleteAuthState'), error);
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

    getOperatorJid(): string {
        return this.operatorJid;
    }

    async setOperatorJid(jid: string) {
        this.operatorJid = jid;
        await this.saveConfig();
    }

    getAuthStateDir(): string {
        return this.authStateDir;
    }
}
