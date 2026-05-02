import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Locale = "pt-BR" | "es" | "fr";
type Key = keyof typeof fallback;
type Params = Record<string, string | number | undefined>;

const namespace = "whatsapp-pi";

const fallback = {
    "tool.label": "Send WhatsApp Message",
    "tool.description": "Send a WhatsApp message to a contact identified by their JID (e.g. 5511999998888@s.whatsapp.net). Returns a JSON result with success status and messageId or error.",
    "tool.promptSnippet": "send_wa_message(jid, message) - Send a WhatsApp message to a contact by JID",
    "tool.param.jid": "WhatsApp JID of the recipient, e.g. 5511999998888@s.whatsapp.net",
    "tool.param.message": "Plain-text message content to send",
    "tool.error.notConnected": "WhatsApp not connected",
    "log.outgoing.title": "[WhatsApp-Pi] Outgoing WhatsApp message",
    "log.outgoing.to": "  To: {jid}",
    "log.outgoing.message": "  Message:",
    "log.result.title": "[WhatsApp-Pi] Outgoing WhatsApp message result",
    "log.result.status.sent": "  Status: sent",
    "log.result.status.failed": "  Status: failed",
    "log.result.messageId": "  MessageId: {messageId}",
    "log.result.error": "  Error: {error}",
    "log.unknownMessageId": "unknown",
    "log.unknownError": "unknown error",
    "notify.replySent": "Sent reply to WhatsApp contact",
    "notify.replyFailed": "Failed to send WhatsApp reply",
    "command.whatsapp.description": "Manage WhatsApp integration",
} as const;

const translations: Record<Locale, Partial<Record<Key, string>>> = {
    "pt-BR": {
        "tool.label": "Enviar mensagem do WhatsApp",
        "tool.description": "Envia uma mensagem do WhatsApp para um contato identificado pelo JID (ex.: 5511999998888@s.whatsapp.net). Retorna um resultado JSON com status de sucesso e messageId ou erro.",
        "tool.promptSnippet": "send_wa_message(jid, message) - Enviar uma mensagem do WhatsApp para um contato por JID",
        "tool.param.jid": "JID do WhatsApp do destinatário, ex.: 5511999998888@s.whatsapp.net",
        "tool.param.message": "Conteúdo da mensagem em texto simples a enviar",
        "tool.error.notConnected": "WhatsApp não conectado",
        "log.outgoing.title": "[WhatsApp-Pi] Mensagem enviada pelo WhatsApp",
        "log.outgoing.to": "  Para: {jid}",
        "log.outgoing.message": "  Mensagem:",
        "log.result.title": "[WhatsApp-Pi] Resultado da mensagem do WhatsApp",
        "log.result.status.sent": "  Status: enviada",
        "log.result.status.failed": "  Status: falhou",
        "log.result.messageId": "  MessageId: {messageId}",
        "log.result.error": "  Erro: {error}",
        "log.unknownMessageId": "desconhecido",
        "log.unknownError": "erro desconhecido",
        "notify.replySent": "Resposta enviada para o contato do WhatsApp",
        "notify.replyFailed": "Falha ao enviar resposta pelo WhatsApp",
        "command.whatsapp.description": "Gerenciar integração com WhatsApp",
    },
    es: {
        "tool.label": "Enviar mensaje de WhatsApp",
        "tool.description": "Envía un mensaje de WhatsApp a un contacto identificado por su JID (p. ej., 5511999998888@s.whatsapp.net). Devuelve un resultado JSON con estado de éxito y messageId o error.",
        "tool.promptSnippet": "send_wa_message(jid, message) - Enviar un mensaje de WhatsApp a un contacto por JID",
        "tool.param.jid": "JID de WhatsApp del destinatario, p. ej., 5511999998888@s.whatsapp.net",
        "tool.param.message": "Contenido del mensaje en texto plano para enviar",
        "tool.error.notConnected": "WhatsApp no conectado",
        "log.outgoing.title": "[WhatsApp-Pi] Mensaje saliente de WhatsApp",
        "log.outgoing.to": "  Para: {jid}",
        "log.outgoing.message": "  Mensaje:",
        "log.result.title": "[WhatsApp-Pi] Resultado del mensaje de WhatsApp",
        "log.result.status.sent": "  Estado: enviado",
        "log.result.status.failed": "  Estado: fallido",
        "log.result.messageId": "  MessageId: {messageId}",
        "log.result.error": "  Error: {error}",
        "log.unknownMessageId": "desconocido",
        "log.unknownError": "error desconocido",
        "notify.replySent": "Respuesta enviada al contacto de WhatsApp",
        "notify.replyFailed": "No se pudo enviar la respuesta de WhatsApp",
        "command.whatsapp.description": "Administrar integración de WhatsApp",
    },
    fr: {
        "tool.label": "Envoyer un message WhatsApp",
        "tool.description": "Envoie un message WhatsApp à un contact identifié par son JID (ex. 5511999998888@s.whatsapp.net). Retourne un résultat JSON avec le statut de réussite et le messageId ou l’erreur.",
        "tool.promptSnippet": "send_wa_message(jid, message) - Envoyer un message WhatsApp à un contact par JID",
        "tool.param.jid": "JID WhatsApp du destinataire, ex. 5511999998888@s.whatsapp.net",
        "tool.param.message": "Contenu du message en texte brut à envoyer",
        "tool.error.notConnected": "WhatsApp non connecté",
        "log.outgoing.title": "[WhatsApp-Pi] Message WhatsApp sortant",
        "log.outgoing.to": "  À : {jid}",
        "log.outgoing.message": "  Message :",
        "log.result.title": "[WhatsApp-Pi] Résultat du message WhatsApp",
        "log.result.status.sent": "  Statut : envoyé",
        "log.result.status.failed": "  Statut : échec",
        "log.result.messageId": "  MessageId : {messageId}",
        "log.result.error": "  Erreur : {error}",
        "log.unknownMessageId": "inconnu",
        "log.unknownError": "erreur inconnue",
        "notify.replySent": "Réponse envoyée au contact WhatsApp",
        "notify.replyFailed": "Échec de l’envoi de la réponse WhatsApp",
        "command.whatsapp.description": "Gérer l’intégration WhatsApp",
    },
};

let currentLocale: string | undefined;

function format(template: string, params: Params = {}): string {
    return template.replace(/\{(\w+)\}/g, (_match, key) => String(params[key] ?? `{${key}}`));
}

export function t(key: Key, params?: Params): string {
    const locale = currentLocale as Locale | undefined;
    const template = locale ? translations[locale]?.[key] : undefined;
    return format(template ?? fallback[key], params);
}

export function initI18n(pi: ExtensionAPI): void {
    pi.events?.emit?.("pi-core/i18n/registerBundle", {
        namespace,
        defaultLocale: "en",
        fallback,
        translations,
    });
    pi.events?.on?.("pi-core/i18n/localeChanged", (event: unknown) => {
        currentLocale = event && typeof event === "object" && "locale" in event
            ? String((event as { locale?: unknown }).locale ?? "")
            : undefined;
    });
    pi.events?.emit?.("pi-core/i18n/requestApi", {
        namespace,
        onApi(api: { getLocale?: () => string | undefined }) {
            currentLocale = api.getLocale?.();
        },
    });
}
