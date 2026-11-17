import type { WAMessageKey } from 'baileys';

/** Verified aliases are for indexing/authorization, never a replacement transport key. */
export class JidResolver {
    private readonly lidToPhone = new Map<string, string>();
    private readonly phoneToLid = new Map<string, string>();
    private readonly conflicts = new Set<string>();

    private suppressChanges = false;
    private readonly onChange: () => void;
    constructor(onChange: () => void = () => {}) {
        this.onChange = () => { if (!this.suppressChanges) onChange(); };
    }

    public replaceState(state: { aliases: Array<{ lid: string; pn: string }>; conflicts: string[] }): void {
        this.suppressChanges = true;
        try { this.clear(); this.restoreState(state); }
        finally { this.suppressChanges = false; this.onChange(); }
    }

    public normalize(jid: string): string {
        if (/^\+?\d+$/.test(jid)) return `${jid.replace(/^\+/, '')}@s.whatsapp.net`;
        const [local, domain] = jid.split('@');
        return domain ? `${local.split(':')[0]}@${domain}` : jid;
    }

    public bind(first: string, second: string): boolean {
        const a = this.normalize(first);
        const b = this.normalize(second);
        const lid = a.endsWith('@lid') ? a : b;
        const phone = a.endsWith('@s.whatsapp.net') ? a : b;
        if (!/^\d+@lid$/.test(lid) || !/^\d+@s\.whatsapp\.net$/.test(phone)) return false;
        const oldPhone = this.lidToPhone.get(lid);
        const oldLid = this.phoneToLid.get(phone);
        if (this.conflicts.has(lid) || this.conflicts.has(phone)
            || (oldPhone && oldPhone !== phone) || (oldLid && oldLid !== lid)) {
            for (const jid of [lid, phone, oldPhone, oldLid]) {
                if (jid) this.conflicts.add(jid);
            }
            this.onChange();
            return false;
        }
        if (oldPhone === phone) return true;
        if (this.lidToPhone.size >= 5_000) return false;
        this.lidToPhone.set(lid, phone);
        this.phoneToLid.set(phone, lid);
        this.onChange();
        return true;
    }

    public observe(key: WAMessageKey): void {
        if (key.remoteJid && key.remoteJidAlt) this.bind(key.remoteJid, key.remoteJidAlt);
        if (key.participant && key.participantAlt) this.bind(key.participant, key.participantAlt);
    }

    public canonical(jid: string): string | undefined {
        const normalized = this.normalize(jid);
        if (this.conflicts.has(normalized)) return undefined;
        return this.lidToPhone.get(normalized) ?? normalized;
    }

    public senderNumber(jid: string): string | undefined {
        const canonical = this.canonical(jid);
        if (!canonical) return undefined;
        return /^\d+@s\.whatsapp\.net$/.test(canonical) ? `+${canonical.split('@')[0]}` : canonical;
    }

    public index(scope: string, key: WAMessageKey): string | undefined {
        if (!key.remoteJid || !key.id) return undefined;
        const chat = this.canonical(key.remoteJid);
        const participant = key.participant ? this.canonical(key.participant) : '';
        if (!chat || participant === undefined) return undefined;
        return JSON.stringify([scope, chat, key.id, key.fromMe ?? false, participant]);
    }

    public exportState(): { aliases: Array<{ lid: string; pn: string }>; conflicts: string[] } {
        return { aliases: [...this.lidToPhone].map(([lid, pn]) => ({ lid, pn })), conflicts: [...this.conflicts] };
    }

    public restoreState(state: { aliases: Array<{ lid: string; pn: string }>; conflicts: string[] }): void {
        for (const { lid, pn } of state.aliases) this.bind(lid, pn);
        for (const jid of state.conflicts) this.conflicts.add(jid);
        this.onChange();
    }

    public clear(): void {
        this.lidToPhone.clear();
        this.phoneToLid.clear();
        this.conflicts.clear();
        this.onChange();
    }
}
