const SAVE_KEY = 'burning-horizons.survival.v1';

export class SurvivalNeeds {
	constructor(game) {
		this.game = game;
		// Agent Control: retained survival system is opt-in while exploration is the default.
		this.enabled = false;
		this.hunger = 100;
		try {
			const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
			if (saved && Number.isFinite(saved.hunger)) this.hunger = Math.max(0, Math.min(100, saved.hunger));
		} catch { /* storage is optional */ }
		this.saveTimer = 0;
		const el = document.createElement('div');
		el.setAttribute('role', 'status');
		el.setAttribute('aria-label', 'Survival hunger');
		el.style.cssText = 'position:fixed;top:152px;left:20px;z-index:45;color:#e4f3e9;background:#071721c9;border:1px solid #7bb69b77;border-radius:9px;padding:6px 10px;font:13px system-ui;pointer-events:none';
		document.body.appendChild(el);
		this.el = el;
		this.refresh();
	}

	refresh() {
		this.el.hidden = !this.enabled;
		this.el.textContent = `Hunger ${Math.ceil(this.hunger)}% · B eat fish`;
	}

	save() {
		try { localStorage.setItem(SAVE_KEY, JSON.stringify({ hunger: this.hunger })); } catch { /* optional */ }
	}

	update(dt, input, toast) {
		if (!this.enabled) { this.refresh(); return; }
		this.hunger = Math.max(0, this.hunger - dt / 36);
		this.saveTimer += dt;
		if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
		if (input.hit('KeyB')) {
			const inventory = this.game.state.inventory;
			if (!inventory.length) toast('No fish in the cooler to prepare');
			else if (this.hunger > 90) toast('You are not hungry yet');
			else {
				const fish = inventory[0];
				if(this.game.items)this.game.items.act('releaseFish',{fishId:fish.id});
				else this.game.state.release(fish.id);
				this.hunger = Math.min(100, this.hunger + 28 + Math.min(22, fish.kg * 3));
				this.save();
				toast(`Prepared and ate ${fish.species} · hunger ${Math.ceil(this.hunger)}%`);
			}
		}
		this.refresh();
	}
}
