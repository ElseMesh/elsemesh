// Shared by the browser and relay: no arbitrary asset URLs or shader text from peers.
export const AVATAR_STYLES = Object.freeze({
	male: { asset: 'stock-player', label: 'Man · short hair', image: 'avatar-male.png' },
	female: { asset: 'stock-female', label: 'Woman · ponytail', image: 'avatar-female.png' },
});
export const DEFAULT_APPEARANCE = Object.freeze({ style: 'male', shirt: '#7194aa', trousers: '#27313d', skin: '#c68c67', hair: '#33251c' });
const fields = Object.keys(DEFAULT_APPEARANCE);
export function validateAppearance(value) {
	if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== fields.length || !fields.every(k => Object.hasOwn(value,k))) throw new Error('Invalid avatar appearance');
	if (!Object.hasOwn(AVATAR_STYLES,value.style) || !fields.slice(1).every(k => typeof value[k] === 'string' && /^#[0-9a-f]{6}$/.test(value[k]))) throw new Error('Invalid avatar appearance');
	return value;
}
export function loadAppearance(storage) {
	try { return { ...validateAppearance(JSON.parse((storage || globalThis.localStorage).getItem('bh.avatar.v1'))) }; }
	catch { return { ...DEFAULT_APPEARANCE }; }
}
export function saveAppearance(value, storage) {
	validateAppearance(value);
	try { (storage || globalThis.localStorage).setItem('bh.avatar.v1',JSON.stringify(value)); return true; } catch { return false; }
}
export function appearanceKey(value) { return fields.map(k => value[k]).join('|'); }
