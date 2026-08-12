import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('extracts reaction with original message context when available', () => {
        const mockRecentsService = {
            findMessageById: vi.fn().mockReturnValue({
                messageId: 'msg123',
                text: 'Hello, how are you?',
                senderNumber: '+1234567890',
                direction: 'incoming',
                timestamp: Date.now()
            })
        };

        const reactionMessage = { text: '👍', key: { remoteJid: '123@s.whatsapp.net', id: 'msg123', fromMe: false } };
        const result = extractIncomingText({ reactionMessage }, mockRecentsService as any);

        expect(result).toEqual({
            kind: 'reaction',
            text: '👍 Reacted to: "Hello, how are you?"',
            reactionMessage,
            originalMessage: {
                originalText: 'Hello, how are you?',
                originalMessageId: 'msg123'
            }
        });
        expect(mockRecentsService.findMessageById).toHaveBeenCalledWith('msg123');
    });

    it('extracts removed reaction with original message context when available', () => {
        const mockRecentsService = {
            findMessageById: vi.fn().mockReturnValue({
                messageId: 'msg456',
                text: 'Great news!',
                senderNumber: '+1234567890',
                direction: 'outgoing',
                timestamp: Date.now()
            })
        };

        const reactionMessage = { text: '', key: { remoteJid: '123@s.whatsapp.net', id: 'msg456', fromMe: true } };
        const result = extractIncomingText({ reactionMessage }, mockRecentsService as any);

        expect(result).toEqual({
            kind: 'reaction',
            text: 'Removed reaction from: "Great news!"',
            reactionMessage,
            originalMessage: {
                originalText: 'Great news!',
                originalMessageId: 'msg456'
            }
        });
        expect(mockRecentsService.findMessageById).toHaveBeenCalledWith('msg456');
    });

    it('falls back to basic reaction text when original message not found', () => {
        const mockRecentsService = {
            findMessageById: vi.fn().mockReturnValue(undefined)
        };

        const reactionMessage = { text: '❤️', key: { remoteJid: '123@s.whatsapp.net', id: 'unknown-msg', fromMe: false } };
        const result = extractIncomingText({ reactionMessage }, mockRecentsService as any);

        expect(result).toEqual({
            kind: 'reaction',
            text: '❤️ Reacted to message',
            reactionMessage,
            originalMessage: undefined
        });
        expect(mockRecentsService.findMessageById).toHaveBeenCalledWith('unknown-msg');
    });

    it('handles reaction without recentsService gracefully', () => {
        const reactionMessage = { text: '😂', key: { remoteJid: '123@s.whatsapp.net', id: 'msg789', fromMe: false } };
        const result = extractIncomingText({ reactionMessage }, undefined);

        expect(result).toEqual({
            kind: 'reaction',
            text: '😂 Reacted to message',
            reactionMessage,
            originalMessage: undefined
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

    describe('contact messages', () => {
        it('extracts contact with displayName and vCard', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:John Doe',
                'TEL;type=CELL;waid=5511999998888:+55 11 99999-8888',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactMessage: {
                    displayName: 'John Doe',
                    vcard
                }
            });

            expect(result.kind).toBe('contact');
            expect(result.text).toContain('John Doe');
            expect(result.text).toContain('+55 11 99999-8888');
        });

        it('extracts contact with only displayName', () => {
            const result = extractIncomingText({
                contactMessage: {
                    displayName: 'Jane Smith'
                }
            });

            expect(result.kind).toBe('contact');
            expect(result.text).toContain('Jane Smith');
        });

        it('extracts contact from vCard with FN field', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Ada Lovelace',
                'TEL;TYPE=CELL:+15555550123',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactMessage: { vcard }
            });

            expect(result.text).toContain('Ada Lovelace');
            expect(result.text).toContain('+15555550123');
        });

        it('extracts contact from vCard with N field', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'N:Lovelace;Ada;;;',
                'TEL;TYPE=CELL:+15555550123',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactMessage: { vcard }
            });

            expect(result.text).toContain('Ada Lovelace');
        });

        it('prefers FN over N in vCard', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'N:Smith;John;;;',
                'FN:John Doe',
                'TEL;TYPE=CELL:+15555550123',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactMessage: { vcard }
            });

            expect(result.text).toContain('John Doe');
            expect(result.text).not.toContain('John Smith');
        });

        it('extracts multiple phone numbers', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Multi Phone',
                'TEL;TYPE=CELL:+5511999998888',
                'TEL;TYPE=HOME:+5511888887777',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactMessage: { vcard }
            });

            expect(result.text).toContain('+5511999998888');
            expect(result.text).toContain('+5511888887777');
        });

        it('handles contact without name or phone', () => {
            const result = extractIncomingText({
                contactMessage: {}
            });

            expect(result.kind).toBe('contact');
            expect(result.text).toBe('[Contact]');
        });

        it('extracts multiple contacts with phones', () => {
            const vcard1 = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Contact One',
                'TEL:+5511999998888',
                'END:VCARD'
            ].join('\n');

            const vcard2 = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Contact Two',
                'TEL:+5511888887777',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactsArrayMessage: {
                    contacts: [
                        { displayName: 'Contact One', vcard: vcard1 },
                        { displayName: 'Contact Two', vcard: vcard2 }
                    ]
                }
            });

            expect(result.kind).toBe('contact');
            expect(result.text).toContain('2 Contacts');
            expect(result.text).toContain('Contact One');
            expect(result.text).toContain('+5511999998888');
            expect(result.text).toContain('Contact Two');
            expect(result.text).toContain('+5511888887777');
        });

        it('handles single contact in contacts array', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Single Contact',
                'TEL:+5511999998888',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactsArrayMessage: {
                    contacts: [{ vcard }]
                }
            });

            expect(result.text).toContain('Single Contact');
            expect(result.text).toContain('+5511999998888');
        });

        it('handles quoted contact with name', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Quoted Person',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Thanks for the contact',
                    contextInfo: {
                        quotedMessage: {
                            contactMessage: {
                                displayName: 'Quoted Person',
                                vcard
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toContain('Quoted Person');
            }
        });

        it('handles quoted multiple contacts', () => {
            const result = extractIncomingText({
                extendedTextMessage: {
                    text: 'Got them',
                    contextInfo: {
                        quotedMessage: {
                            contactsArrayMessage: {
                                contacts: [{}, {}]
                            }
                        }
                    }
                }
            });

            if ('quotedMessage' in result) {
                expect(result.quotedMessage?.quotedText).toContain('2');
                expect(result.quotedMessage?.quotedText).toContain('Contacts');
            }
        });

        it('removes duplicate names in multiple contacts', () => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Dani Amor',
                'TEL:+5511999998888',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactsArrayMessage: {
                    contacts: [
                        { displayName: 'Dani Amor', vcard },
                        { displayName: 'Dani Amor', vcard }
                    ]
                }
            });

            expect(result.kind).toBe('contact');
            // Should show count as 1 since duplicates are removed
            expect(result.text).toContain('1 Contact');
            expect(result.text).toContain('Dani Amor');
            expect(result.text).toContain('+5511999998888');
        });

        it('shows unique names when contacts have different names', () => {
            const vcard1 = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Person A',
                'TEL:+5511111111111',
                'END:VCARD'
            ].join('\n');

            const vcard2 = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Person B',
                'TEL:+5522222222222',
                'END:VCARD'
            ].join('\n');

            const vcard3 = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:Person C',
                'TEL:+5533333333333',
                'END:VCARD'
            ].join('\n');

            const result = extractIncomingText({
                contactsArrayMessage: {
                    contacts: [
                        { displayName: 'Person A', vcard: vcard1 },
                        { displayName: 'Person B', vcard: vcard2 },
                        { displayName: 'Person C', vcard: vcard3 }
                    ]
                }
            });

            expect(result.text).toContain('Person A');
            expect(result.text).toContain('+5511111111111');
            expect(result.text).toContain('Person B');
            expect(result.text).toContain('+5522222222222');
            expect(result.text).toContain('Person C');
            expect(result.text).toContain('+5533333333333');
            expect(result.text).toContain('3 Contacts');
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
