const INTERACTIVE = 'button,input,select,textarea,a,[contenteditable],label,[role=button]';

export class WindowManager {
	constructor({ root = document.body, releasePointerLock = () => document.exitPointerLock?.() } = {}) {
		this.root = root;
		this.releasePointerLock = releasePointerLock;
		this.windows = new Map();
		this.z = 1200;
		this.tray = document.createElement('div');
		this.tray.className = 'tw-window-tray tw-interactive';
		this.tray.setAttribute('aria-label', 'Minimized windows');
		root.append(this.tray);
		this._key = event => {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
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

	register({ id, element, title, body = element, onClose, onOpen, closeOnEscape = true }) {
		if (this.windows.has(id)) return this.windows.get(id);
		const originalParent = element.parentNode;
		const originalNext = element.nextSibling;
		const shell = document.createElement('section');
		shell.className = 'tw-window tw-interactive';
		shell.dataset.window = id;
		shell.hidden = true;
		shell.setAttribute('role', 'dialog');
		shell.setAttribute('aria-label', title);
		const bar = document.createElement('div');
		bar.className = 'tw-window-titlebar';
		bar.innerHTML = `<span class="tw-window-title"></span><span class="tw-window-actions"><button type="button" aria-label="Minimize ${title}">&minus;</button><button type="button" aria-label="Close ${title}">&times;</button></span>`;
		bar.querySelector('.tw-window-title').textContent = title;
		const content = document.createElement('div');
		content.className = 'tw-window-body';
		shell.append(bar, content);
		content.append(element);
		(originalParent || this.root).insertBefore(shell, originalNext);

		const state = { id, element, body, shell, bar, open: false, minimized: false, z: 0, closeOnEscape, onClose, onOpen };
		state.focus = () => { state.z = ++this.z; shell.style.zIndex = state.z; };
		state.clamp = () => {
			if (shell.hidden) return;
			shell.style.maxWidth = 'calc(100vw - 16px)';
			const r = shell.getBoundingClientRect();
			const header = Math.min(bar.offsetHeight || 40, innerHeight);
			const x = Math.max(8, Math.min(Math.max(8, innerWidth - r.width - 8), r.left));
			const y = Math.max(8, Math.min(Math.max(8, innerHeight - header - 8), r.top));
			shell.style.left = `${x}px`; shell.style.top = `${y}px`; shell.style.right = 'auto'; shell.style.bottom = 'auto';
		};
		state.show = () => {
			state.open = true; state.minimized = false; shell.hidden = false; shell.classList.remove('is-minimized');
			state.trayButton.hidden = true; state.focus(); state.clamp(); this.releasePointerLock(); onOpen?.();
		};
		state.close = () => {
			if (!state.open) return;
			state.open = false; state.minimized = false; shell.hidden = true; state.trayButton.hidden = true; onClose?.();
		};
		state.minimize = () => {
			if (!state.open) return;
			state.minimized = true; shell.hidden = true; state.trayButton.hidden = false; onClose?.('minimize');
		};
		state.restore = () => { state.open = true; state.minimized = false; shell.hidden = false; state.trayButton.hidden = true; state.focus(); state.clamp(); this.releasePointerLock(); onOpen?.('restore'); };
		state.trayButton = document.createElement('button');
		state.trayButton.type = 'button'; state.trayButton.textContent = title; state.trayButton.hidden = true; state.trayButton.setAttribute('aria-label', `Restore ${title}`);
		state.trayButton.addEventListener('click', state.restore); this.tray.append(state.trayButton);
		bar.querySelector('[aria-label^="Minimize"]').addEventListener('click', state.minimize);
		bar.querySelector('[aria-label^="Close"]').addEventListener('click', state.close);
		shell.addEventListener('pointerdown', () => { state.focus(); this.releasePointerLock(); });
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
