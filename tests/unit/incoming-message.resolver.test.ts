import { beforeEach, describe, expect, it } from 'vitest';
import { resetI18n } from '../../src/i18n.ts';
import { extractIncomingText } from '../../src/services/incoming-message.resolver.ts';

describe('extractIncomingText', () => {
    beforeEach(() => {
        resetI18n();
    });

    it('extracts plain conversation text', () => {
        expect(extractIncomingText({ conversation: 'hello' })).toEqual({
            kind: 'text',
            text: 'hello'
        });
    });

    it('extracts extended text messages', () => {
        expect(extractIncomingText({ extendedTextMessage: { text: 'extended hello' } })).toEqual({
            kind: 'text',
            text: 'extended hello'
        });
    });

    it('resolves video messages with captions', () => {
        const videoMessage = { caption: 'watch this', mimetype: 'video/mp4' };

        expect(extractIncomingText({ videoMessage })).toEqual({
            kind: 'video',
            text: 'watch this',
            videoMessage
        });
    });

    it('resolves image messages with captions', () => {
        const imageMessage = { caption: 'look', mimetype: 'image/jpeg' };

        expect(extractIncomingText({ imageMessage })).toEqual({
            kind: 'image',
            text: 'look',
            imageMessage
        });
    });

    it('unwraps ephemeral message content', () => {
        expect(extractIncomingText({
            ephemeralMessage: {
                message: {
                    conversation: 'hidden'
                }
            }
        })).toEqual({
            kind: 'text',
            text: 'hidden'
        });
    });

    it('formats protocol messages as system messages', () => {
        expect(extractIncomingText({ protocolMessage: { type: 0 } })).toEqual({
            kind: 'system',
            text: '[Message Deleted]'
        });
    });

    it('extracts reaction messages with emoji', () => {
        const reactionMessage = { text: '👍', key: { remoteJid: '123@s.whatsapp.net', id: 'msg123', fromMe: false } };
        expect(extractIncomingText({ reactionMessage })).toEqual({
            kind: 'reaction',
            text: '👍 Reacted to message',
            reactionMessage
        });
    });

    it('handles removed reactions', () => {
        const reactionMessage = { text: '', key: { remoteJid: '123@s.whatsapp.net', id: 'msg123', fromMe: false } };
        expect(extractIncomingText({ reactionMessage })).toEqual({
            kind: 'reaction',
            text: 'Removed reaction',
            reactionMessage
        });
    });

    describe('location messages', () => {
        it('extracts location with coordinates only', () => {
            const result = extractIncomingText({
                locationMessage: {
                    degreesLatitude: -23.550520,
                    degreesLongitude: -46.633308
                }
            });

            expect(result.kind).toBe('location');
            expect(result.text).toContain('-23.55052');
            expect(result.text).toContain('-46.633308');
            expect(result.text).toContain('https://www.google.com/maps?q=-23.55052,-46.633308');
        });

        it('extracts location with name', () => {
            const result = extractIncomingText({
                locationMessage: {
                    degreesLatitude: -23.550520,
                    degreesLongitude: -46.633308,
                    name: 'Avenida Paulista'
                }
            });

            expect(result.text).toContain('Avenida Paulista');
            expect(result.text).toContain('-23.55052');
            expect(result.text).toContain('-46.633308');
        });

        it('extracts location with name and address', () => {
            const result = extractIncomingText({
                locationMessage: {
                    degreesLatitude: -23.550520,
                    degreesLongitude: -46.633308,
                    name: 'Avenida Paulista',
                    address: 'São Paulo, SP, Brazil'
                }
            });

            expect(result.text).toContain('Avenida Paulista');
            expect(result.text).toContain('São Paulo, SP, Brazil');
            expect(result.text).toContain('-23.55052');
        });

        it('handles location without coordinates gracefully', () => {
            const result = extractIncomingText({
                locationMessage: {
                    name: 'Some Place'
                }
            });

            expect(result.text).toBe('[Location]');
        });

        it('handles location with zero coordinates', () => {
            const result = extractIncomingText({
                locationMessage: {
                    degreesLatitude: 0,
                    degreesLongitude: 0
                }
            });

            expect(result.text).toContain('0');
            expect(result.text).toContain('https://www.google.com/maps?q=0,0');
        });

        it('handles quoted location with coordinates', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Thanks for the location',
                    contextInfo: {
                        quotedMessage: {
                            locationMessage: {
                                degreesLatitude: -23.550520,
                                degreesLongitude: -46.633308
                            }
                        }
                    }
                }
            });

            expect(result.kind).toBe('text');
            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toContain('-23.55052');
                expect(result.quotedMessage?.quotedText).toContain('-46.633308');
            }
        });

        it('handles quoted location with name', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Got it',
                    contextInfo: {
                        quotedMessage: {
                            locationMessage: {
                                degreesLatitude: -23.550520,
                                degreesLongitude: -46.633308,
                                name: 'Avenida Paulista'
                            }
                        }
                    }
                }
            });

            expect(result.kind).toBe('text');
            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toContain('Avenida Paulista');
                expect(result.quotedMessage?.quotedText).toContain('-23.55052');
            }
        });

        it('handles quoted location without coordinates', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Thanks',
                    contextInfo: {
                        quotedMessage: {
                            locationMessage: {}
                        }
                    }
                }
            });

            expect(result.kind).toBe('text');
            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Location]');
            }
        });
    });

    describe('quoted messages', () => {
        it('extracts quoted text message from extendedTextMessage', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'This is my reply',
                    contextInfo: {
                        quotedMessage: {
                            conversation: 'Original message'
                        },
                        stanzaId: 'msg123',
                        participant: '5511999998888@s.whatsapp.net'
                    }
                }
            });

            expect(result).toEqual({
                kind: 'text',
                text: 'This is my reply',
                quotedMessage: {
                    quotedText: 'Original message',
                    quotedMessageId: 'msg123',
                    quotedParticipant: '5511999998888@s.whatsapp.net'
                }
            });
        });

        it('extracts quoted extended text message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Reply',
                    contextInfo: {
                        quotedMessage: {
                            extendedTextMessage: {
                                text: 'Quoted extended text'
                            }
                        },
                        stanzaId: 'msg456'
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage).toEqual({
                    quotedText: 'Quoted extended text',
                    quotedMessageId: 'msg456',
                    quotedParticipant: undefined
                });
            }
        });

        it('extracts quoted image message with caption', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Nice photo!',
                    contextInfo: {
                        quotedMessage: {
                            imageMessage: {
                                caption: 'My vacation photo',
                                mimetype: 'image/jpeg'
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('My vacation photo');
            }
        });

        it('extracts quoted image message without caption', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Thanks for the image',
                    contextInfo: {
                        quotedMessage: {
                            imageMessage: {
                                mimetype: 'image/jpeg'
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Image]');
            }
        });

        it('extracts quoted video message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Great video',
                    contextInfo: {
                        quotedMessage: {
                            videoMessage: {
                                caption: 'My video',
                                mimetype: 'video/mp4'
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('My video');
            }
        });

        it('extracts quoted document message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Got the document',
                    contextInfo: {
                        quotedMessage: {
                            documentMessage: {
                                caption: 'Report.pdf',
                                mimetype: 'application/pdf'
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('Report.pdf');
            }
        });

        it('extracts quoted audio message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Listened to it',
                    contextInfo: {
                        quotedMessage: {
                            audioMessage: {
                                mimetype: 'audio/ogg'
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Audio]');
            }
        });

        it('extracts quoted contact message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Thanks for the contact',
                    contextInfo: {
                        quotedMessage: {
                            contactMessage: {}
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Contact]');
            }
        });

        it('extracts quoted location message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Got the location',
                    contextInfo: {
                        quotedMessage: {
                            locationMessage: {}
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Location]');
            }
        });

        it('handles quote in image message', () => {
            const imageMessage = {
                caption: 'My reply image',
                mimetype: 'image/jpeg',
                contextInfo: {
                    quotedMessage: {
                        conversation: 'Original text'
                    },
                    stanzaId: 'msg789'
                }
            };

            const result = extractIncomingText({ imageMessage });

            expect(result).toEqual({
                kind: 'image',
                text: 'My reply image',
                imageMessage,
                quotedMessage: {
                    quotedText: 'Original text',
                    quotedMessageId: 'msg789',
                    quotedParticipant: undefined
                }
            });
        });

        it('handles quote in video message', () => {
            const videoMessage = {
                caption: 'Reply video',
                mimetype: 'video/mp4',
                contextInfo: {
                    quotedMessage: {
                        conversation: 'Original'
                    }
                }
            };

            const result = extractIncomingText({ videoMessage });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('Original');
            }
        });

        it('handles quote in document message', () => {
            const documentMessage = {
                caption: 'Document reply',
                mimetype: 'application/pdf',
                contextInfo: {
                    quotedMessage: {
                        conversation: 'Original'
                    }
                }
            };

            const result = extractIncomingText({ documentMessage });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('Original');
            }
        });

        it('handles quote in audio message', () => {
            const audioMessage = {
                mimetype: 'audio/ogg',
                contextInfo: {
                    quotedMessage: {
                        conversation: 'Original'
                    }
                }
            };

            const result = extractIncomingText({ audioMessage });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('Original');
            }
        });

        it('returns undefined quotedMessage when no quote present', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'No quote here'
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage).toBeUndefined();
            }
        });

        it('handles LID participant in quoted message', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Reply',
                    contextInfo: {
                        quotedMessage: {
                            conversation: 'Original'
                        },
                        participant: '123456789@lid'
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedParticipant).toBe('123456789@lid');
            }
        });

        it('handles empty quoted message gracefully', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Reply',
                    contextInfo: {
                        quotedMessage: {}
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toBe('[Message]');
            }
        });
    });
});
