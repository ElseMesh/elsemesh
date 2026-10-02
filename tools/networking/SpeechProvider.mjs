import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Game-side adapter for the existing authenticated Voice Lab worker contract.
// The worker and accepted voice profile stay in the operator's private environment.
export class OmniVoiceSpeechProvider {
	constructor({ endpoint, token, representation, version, profileId }) {
		const url = new URL(endpoint);
		if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.search || url.hash) throw new Error('Speech worker must be loopback only');
		if (token.length < 32 || !representation.length) throw new Error('Private speech configuration incomplete');
		this.endpoint = url.origin;
		this.token = token;
		this.representation = representation;
		this.version = version;
		this.profileId = profileId;
		this.id = 'omnivoice-voice-lab';
	}
	async synthesize(text, voiceProfile) {
		if (voiceProfile !== 'loz-omnivoice') return null;
		const started = performance.now();
		const response = await fetch(`${this.endpoint}/voice-lab/synthesize`, {
			method: 'POST', signal: AbortSignal.timeout(120_000),
			headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ representation: this.representation.toString('base64'), version: this.version, text }),
		});
		if (!response.ok) throw new Error(`OmniVoice worker returned ${response.status}`);
		const data = await response.json();
		const audio = Buffer.from(data.audio || '', 'base64');
		if (audio.length < 44 || audio.length > 1_800_000 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new Error('OmniVoice worker returned invalid WAV');
		return { audio, mime: 'audio/wav', provider: this.id, voiceProfile, profileId: this.profileId,
			synthesisMs: Math.round(performance.now() - started), durationSeconds: data.metrics?.duration_s ?? null };
	}
}

export async function loadPrivateSpeechProvider(configPath) {
	if (!configPath) return null;
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const profile = JSON.parse(await readFile(config.profilePath, 'utf8'));
	if (profile.display_name !== 'loz' || profile.qualification_status !== 'ACCEPTED' || profile.user_acceptance !== true) throw new Error('Voice profile is not accepted');
	const representation = await readFile(join(dirname(config.profilePath), 'representation.bin'));
	const hash = createHash('sha256').update(representation).digest('hex');
	if (hash !== profile.voice_representation_hash) throw new Error('Voice representation hash mismatch');
	const token = (await readFile(config.tokenPath, 'utf8')).trim();
	return new OmniVoiceSpeechProvider({ endpoint: config.endpoint, token, representation, version: profile.provider_version, profileId: profile.profile_id });
}
