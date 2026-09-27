const INTERACTIVE = 'button,input,select,textarea,a,[contenteditable],label,[role=button]';

export class WindowManager {
	constructor({ root = document.body, releasePointerLock = () => document.exitPointerLock?.() } = {}) {
		this.root = root;
		this.releasePointerLock = releasePointerLock;
		this.windows = new Map();
		this.z = 1200;
		if (!document.getElementById('tw-window-styles')) {
			const style = document.createElement('style');
			style.id = 'tw-window-styles';
			style.textContent = `
.tw-window{position:fixed;left:clamp(8px,8vw,96px);top:clamp(8px,10vh,80px);z-index:1200;width:min(560px,calc(100vw - 16px));max-width:calc(100vw - 16px);box-sizing:border-box;border:1px solid rgba(126,224,235,.72);border-radius:10px;background:rgba(5,18,28,.96);box-shadow:0 14px 48px rgba(0,0,0,.5);color:#efffff;overflow:hidden;pointer-events:auto}
.tw-window[hidden],.tw-window-tray[hidden],.tw-window-tray button[hidden]{display:none!important}
.tw-window-titlebar{display:flex;align-items:center;justify-content:space-between;min-height:44px;padding:0 4px 0 13px;box-sizing:border-box;cursor:move;touch-action:none;user-select:none;background:rgba(23,62,75,.98);border-bottom:1px solid rgba(126,224,235,.35)}
.tw-window-title{font:700 13px/1.2 system-ui;letter-spacing:.04em}.tw-window-actions{display:flex;gap:4px;flex:none}.tw-window-actions button,.tw-window-tray button{min-width:44px;min-height:44px;padding:6px 10px;border:1px solid rgba(126,224,235,.45);border-radius:6px;background:#102f3b;color:#efffff;cursor:pointer}
.tw-window-body{max-height:calc(100vh - 60px);overflow:auto;overscroll-behavior:contain}.tw-window-body>.tw-panel,.tw-window-body>.gm-panel,.tw-window-body>.tw-help{position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-width:none!important;max-height:none!important;box-sizing:border-box;opacity:1!important;visibility:visible!important;pointer-events:auto!important}
.tw-window-body>.tw-help{display:block!important;background:transparent!important}.tw-window-body>.tw-help>.tw-help-card{width:100%!important;max-width:none!important;max-height:none!important;margin:0!important}
.tw-window[data-window=help]{width:min(860px,calc(100vw - 16px))}.tw-window[data-window=help] .tw-help-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.tw-window-tray{position:fixed;z-index:1900;left:8px;bottom:calc(80px + env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;gap:6px;max-width:calc(100vw - 16px);pointer-events:auto}
@media(max-width:640px){.tw-window[data-window=help] .tw-help-grid{grid-template-columns:minmax(0,1fr)!important}}
`;
			document.head.append(style);
		}
		this.tray = document.createElement('div');
		this.tray.className = 'tw-window-tray tw-interactive';
		this.tray.setAttribute('aria-label', 'Minimized windows');
		root.append(this.tray);
		this._key = event => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			// Native modal flows (avatar customization/onboarding) own Escape while open.
			if ([...document.querySelectorAll('dialog[open]')].some(dialog => !dialog.closest('.tw-window'))) return;
			const top = [...this.windows.values()].filter(w => w.open && !w.minimized && w.closeOnEscape).sort((a, b) => b.z - a.z)[0];
			if (!top) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			top.close();
		};
		this._resize = () => this.windows.forEach(w => w.clamp());
		window.addEventListener('keydown', this._key, true);
		window.addEventListener('resize', this._resize);
	}

	register({ id, element, title, body = element, onClose, onOpen, closeOnEscape = true, keepLauncher = false }) {
		if (this.windows.has(id)) return this.windows.get(id);
		const originalParent = element.parentNode;
		const shell = document.createElement('section');
		shell.className = 'tw-window tw-interactive';
		shell.dataset.window = id;
		shell.hidden = true;
		shell.setAttribute('role', 'dialog');
		shell.setAttribute('aria-label', title);
		const offset = (this.windows.size % 7) * 24;
		shell.style.left = `${Math.min(96, 16 + offset)}px`;
		shell.style.top = `${Math.min(104, 16 + offset)}px`;
		const bar = document.createElement('div');
		bar.className = 'tw-window-titlebar';
		bar.innerHTML = `<span class="tw-window-title"></span><span class="tw-window-actions"><button type="button" aria-label="Minimize ${title}">&minus;</button><button type="button" aria-label="Close ${title}">&times;</button></span>`;
		bar.querySelector('.tw-window-title').textContent = title;
		const content = document.createElement('div');
		content.className = 'tw-window-body';
		shell.append(bar, content);
		content.append(element);
		this.root.append(shell);

		const state = { id, element, body, shell, bar, open: false, minimized: false, z: 0, closeOnEscape, onClose, onOpen };
		state.focus = () => { state.z = ++this.z; shell.style.zIndex = state.z; };
		state.clamp = () => {
			if (shell.hidden) return;
			shell.style.maxWidth = 'calc(100vw - 16px)';
			const r = shell.getBoundingClientRect();
			const header = Math.min(bar.offsetHeight || 44, innerHeight);
			const x = Math.max(8, Math.min(Math.max(8, innerWidth - r.width - 8), r.left));
			const y = Math.max(8, Math.min(Math.max(8, innerHeight - header - 8), r.top));
			shell.style.left = `${x}px`; shell.style.top = `${y}px`; shell.style.right = 'auto'; shell.style.bottom = 'auto';
			content.style.maxHeight = `${Math.max(0, innerHeight - y - header - 8)}px`;
		};
		state.show = () => {
			state.open = true; state.minimized = false; shell.hidden = false; shell.classList.remove('is-minimized');
			state.trayButton.hidden = true; state.focus(); state.clamp(); this.releasePointerLock(); onOpen?.();
		};
		state.close = () => {
			if (!state.open) return;
			state.open = false; state.minimized = false; shell.hidden = true; state.trayButton.hidden = !keepLauncher; onClose?.();
		};
		state.minimize = () => {
			if (!state.open) return;
			state.minimized = true; shell.hidden = true; state.trayButton.hidden = false; onClose?.('minimize');
		};
		state.restore = () => { state.open = true; state.minimized = false; shell.hidden = false; state.trayButton.hidden = true; state.focus(); state.clamp(); this.releasePointerLock(); onOpen?.('restore'); };
		state.trayButton = document.createElement('button');
		state.trayButton.type = 'button'; state.trayButton.textContent = title; state.trayButton.hidden = true; state.trayButton.setAttribute('aria-label', `Open ${title}`);
		state.trayButton.addEventListener('click', state.restore); this.tray.append(state.trayButton);
		bar.querySelector('[aria-label^="Minimize"]').addEventListener('click', state.minimize);
		bar.querySelector('[aria-label^="Close"]').addEventListener('click', state.close);
		shell.addEventListener('pointerdown', () => { state.focus(); this.releasePointerLock(); });
		// Let controls retain native keyboard behavior, while preventing game input handlers from seeing it.
		shell.addEventListener('keydown', event => event.stopPropagation());
		bar.addEventListener('pointerdown', event => {
			if (event.button !== 0 || event.target.closest(INTERACTIVE)) return;
			event.preventDefault(); state.focus(); this.releasePointerLock();
			const r = shell.getBoundingClientRect(), dx = event.clientX - r.left, dy = event.clientY - r.top, pointer = event.pointerId;
			bar.setPointerCapture(pointer);
			const move = e => { if (e.pointerId !== pointer) return; shell.style.left = `${e.clientX - dx}px`; shell.style.top = `${e.clientY - dy}px`; shell.style.right = 'auto'; shell.style.bottom = 'auto'; state.clamp(); };
			const end = e => { if (e.pointerId !== pointer) return; bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', end); if (bar.hasPointerCapture(pointer)) bar.releasePointerCapture(pointer); state.clamp(); };
			bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
		});
		this.windows.set(id, state);
		return state;
	}

	destroy() {
		window.removeEventListener('keydown', this._key, true);
		window.removeEventListener('resize', this._resize);
		this.tray.remove();
	}
}
