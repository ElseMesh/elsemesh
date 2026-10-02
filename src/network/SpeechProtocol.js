import { ONLINE_ROLES, PLAYER_IDS } from './PlayerProtocol.js';

export const SPEECH_PROTOCOL = 'elsemesh.character-speech/1';
export const MAX_SPEECH_LENGTH = 180;
export const VOICE_PROFILES = Object.freeze(Object.fromEntries(ONLINE_ROLES.map((role) => [role, role === 'loz' ? 'loz-omnivoice' : 'guest-text'])));

export function cleanSpeechText(value) {
	if (typeof value !== 'string') return '';
	return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function makeSpeechEvent({ role, nodeId, text, messageId = crypto.randomUUID(), timestamp = Date.now() }) {
	if (!Object.hasOwn(VOICE_PROFILES, role)) throw new Error('Invalid speech role');
	const event = {
		protocol: SPEECH_PROTOCOL,
		sourceType: 'PLAYER_TYPED',
		speakerPlayerId: PLAYER_IDS[role],
		speakerCharacterId: `character:${role}`,
		nodeId,
		messageId,
		text: cleanSpeechText(text),
		timestamp,
		voiceProfile: VOICE_PROFILES[role],
	};
	return validateSpeechEvent(event);
}

export function validateSpeechEvent(event) {
	if (!event || event.protocol !== SPEECH_PROTOCOL || event.sourceType !== 'PLAYER_TYPED') throw new Error('Invalid speech protocol');
	const role = Object.keys(PLAYER_IDS).find((key) => PLAYER_IDS[key] === event.speakerPlayerId);
	if (!role || event.speakerCharacterId !== `character:${role}` || event.voiceProfile !== VOICE_PROFILES[role]) throw new Error('Invalid speaker or voice');
	if (!/^elsemesh-node:[0-9a-f]{64}$/.test(event.nodeId || '') || !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/.test(event.messageId || '')) throw new Error('Invalid speech identity');
	if (typeof event.text !== 'string' || !event.text || event.text.length > MAX_SPEECH_LENGTH || cleanSpeechText(event.text) !== event.text) throw new Error('Invalid speech text');
	if (!Number.isFinite(event.timestamp) || Math.abs(Date.now() - event.timestamp) > 60_000) throw new Error('Stale speech');
	if (JSON.stringify(event).length > 1024) throw new Error('Oversized speech event');
	return event;
}

export class SpeechInbox {
	constructor(limit = 128) { this.ids = new Set(); this.limit = limit; }
	accept(event) {
		validateSpeechEvent(event);
		if (this.ids.has(event.messageId)) return false;
		this.ids.add(event.messageId);
		if (this.ids.size > this.limit) this.ids.delete(this.ids.values().next().value);
		return true;
	}
}
