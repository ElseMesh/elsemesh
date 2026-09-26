import { MAX_SPEECH_LENGTH, cleanSpeechText } from './SpeechProtocol.js';

export class TalkUI {
	constructor(input, send) {
		this.input = input;
		this.send = send;
		this.open = false;
		this.el = document.createElement('form');
		this.el.className = 'bh-talk';
		this.el.style.cssText = 'display:none;position:fixed;z-index:1400;left:50%;bottom:10%;transform:translateX(-50%);width:min(92vw,510px);padding:15px;background:rgba(5,22,32,.96);border:1px solid #70d8db;border-radius:12px;box-shadow:0 12px 35px #0009;color:#f0ffff;font:14px system-ui;';
		const label = document.createElement('label');
		label.textContent = 'Talk:';
		label.htmlFor = 'bh-talk-text';
		label.style.cssText = 'display:block;font-weight:700;margin-bottom:8px';
		this.field = document.createElement('input');
		this.field.id = 'bh-talk-text';
		this.field.type = 'text';
		this.field.maxLength = MAX_SPEECH_LENGTH;
		this.field.autocomplete = 'off';
		this.field.placeholder = 'Type a line for your friend, then press Enter';
		this.field.style.cssText = 'display:block;width:100%;padding:10px;border-radius:7px;border:1px solid #9cd7d8;background:#102d39;color:white;font:16px system-ui';
		this.hint = document.createElement('div');
		this.hint.textContent = 'Enter to send · Esc to cancel';
		this.hint.style.cssText = 'margin-top:7px;color:#aad3d2;font-size:12px';
		this.el.append(label, this.field, this.hint);
		document.body.append(this.el);
		this.el.addEventListener('submit', (event) => {
			event.preventDefault();
			const text = cleanSpeechText(this.field.value);
			if (!text) { this.hint.textContent = 'Type a message first · Esc to cancel'; return; }
			if (!this.send(text)) { this.hint.textContent = 'Friend is not connected yet'; return; }
			this.close();
		});
		this.field.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
		});
	}
	show() {
		if (this.open) return false;
		const focused = document.activeElement;
		if (focused?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused?.tagName)) return false;
		this.open = true;
		this.input.suspend();
		if (document.pointerLockElement) document.exitPointerLock();
		this.field.value = '';
		this.hint.textContent = 'Enter to send · Esc to cancel';
		this.el.style.display = 'block';
		this.field.focus();
		return true;
	}
	close() {
		if (!this.open) return;
		this.open = false;
		this.el.style.display = 'none';
		this.field.blur();
		this.input.resume();
		this.input.requestLock();
	}
}
