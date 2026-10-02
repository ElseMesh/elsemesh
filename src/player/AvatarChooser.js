import { AVATAR_STYLES, loadAppearance, saveAppearance } from './AvatarAppearance.js';

const palettes = {
	shirt: ['#7194aa','#c54343','#33785b','#e8c653','#f2eee3','#343642'],
	trousers: ['#27313d','#565b67','#99724c','#294e70','#e2d9c5','#292526'],
	skin: ['#f1c7a5','#dfae87','#c68c67','#a26946','#805136','#513323'],
	hair: ['#171512','#33251c','#754a2e','#a95732','#d8b779','#adadab'],
};
let styled = false;
export class AvatarChooser {
	constructor({ app = null, parent = document.body } = {}) {
		this.app = app; this.value = loadAppearance();
		try { this.name = localStorage.getItem('elsemesh.avatar.name') || 'Explorer'; } catch { this.name = 'Explorer'; }
		if(app) app.player.displayName = this.name;
		if (app) { app.player.avatarAppearance = { ...this.value }; app.avatar.setAppearance(this.value)?.catch(() => {}); }
		if (!styled) {
			styled = true;
			const style = document.createElement('style');
			style.textContent = `.elsemesh-avatar-open{position:fixed;bottom:22px;left:22px;z-index:1150;border:1px solid #87d9cf;border-radius:24px;padding:10px 18px;background:#09252de8;color:#efffff;cursor:pointer;font:600 14px system-ui}.elsemesh-avatar-dialog{background:#091f2b;color:#edfaf8;border:1px solid #6cabae;border-radius:18px;padding:24px;width:min(420px,94vw);max-height:90vh;overflow:auto;font:15px/1.5 system-ui}.elsemesh-avatar-dialog::backdrop{background:#06101680}.elsemesh-avatar-dialog h2{margin:0 0 8px}.elsemesh-avatar-dialog p{color:#b2cccf;font-size:13px}.elsemesh-avatar-dialog label{display:block;margin:12px 0 5px}.elsemesh-avatar-dialog select{width:100%;padding:10px;background:#153845;color:white;border:1px solid #62959a;border-radius:8px}.elsemesh-avatar-dialog img{float:right;width:90px;height:128px;object-fit:contain;background:#cbd2d5;border-radius:8px;margin:8px}.elsemesh-avatar-colours{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.elsemesh-avatar-colours button{width:30px;height:30px;padding:0;border:2px solid #86999d;border-radius:50%;cursor:pointer;margin:0}.elsemesh-avatar-colours button[aria-pressed=true]{outline:2px solid white;outline-offset:2px}.elsemesh-avatar-colours input{width:38px;height:32px;padding:2px;border:0;background:transparent}.elsemesh-avatar-actions{display:flex;gap:12px;margin-top:20px}.elsemesh-avatar-actions button{padding:10px 16px;border:0;border-radius:8px;background:#70dbcf;color:#09242b;font-weight:700;cursor:pointer}.elsemesh-avatar-dialog.game{margin-right:20px}.elsemesh-avatar-dialog.game::backdrop{background:transparent}@media(max-width:650px){.elsemesh-avatar-dialog.game{margin:auto}}`;
			document.head.append(style);
		}
		this.button = document.createElement('button'); this.button.textContent = app ? 'Avatar · K' : 'Choose your avatar';
		if (app) this.button.className = 'elsemesh-avatar-open';
		parent.append(this.button); this.button.onclick = () => this.show();
		this.dialog = document.createElement('dialog'); this.dialog.className = 'elsemesh-avatar-dialog' + (app ? ' game' : '');
		this.dialog.setAttribute('aria-label','Choose your avatar');
		this.dialog.innerHTML = `<h2>Your island explorer</h2><img alt="Character style reference"><p>Choose a character and make it yours. Your friends see the same appearance.</p><label for="elsemesh-avatar-style">Character & hairstyle</label><select id="elsemesh-avatar-style"></select><p>Style reference shown above. Colours apply to your character in the game. Skin tone is independent of gender.</p><div class="elsemesh-avatar-fields"></div><p class="elsemesh-avatar-status" role="status"></p><div class="elsemesh-avatar-actions"><button class="save">Save avatar</button><button class="cancel">Cancel</button></div>`;
		document.body.append(this.dialog);
		const nameLabel=document.createElement('label'); nameLabel.textContent='Character name'; nameLabel.htmlFor='elsemesh-avatar-name';
		this.nameInput=document.createElement('input'); this.nameInput.id=nameLabel.htmlFor; this.nameInput.maxLength=24; this.nameInput.autocomplete='off';
		this.nameInput.style.cssText='box-sizing:border-box;width:100%;padding:10px;border:1px solid #62959a;border-radius:8px;background:#153845;color:white;font:inherit';
		this.dialog.querySelector('.elsemesh-avatar-fields').prepend(nameLabel,this.nameInput);
		const select = this.dialog.querySelector('select');
		for (const [id,style] of Object.entries(AVATAR_STYLES)) select.add(new Option(style.label,id));
		select.onchange = () => { this.draft.style = select.value; this.refresh(); this.preview(); };
		for (const [key,colors] of Object.entries(palettes)) {
			const label = document.createElement('label'); label.textContent = {shirt:'Shirt colour',trousers:'Trouser colour',skin:'Skin tone',hair:'Hair colour'}[key];
			label.htmlFor = `elsemesh-avatar-${key}`;
			const row = document.createElement('div'); row.className = 'elsemesh-avatar-colours'; row.dataset.field = key;
			for (const color of colors) {
				const button = document.createElement('button'); button.style.background = color; button.dataset.color = color;
				button.setAttribute('aria-label',`${label.textContent} ${color}`);
				button.onclick = () => { this.draft[key]=color; this.refresh(); this.preview(); }; row.append(button);
			}
			const input = document.createElement('input'); input.type='color'; input.id=label.htmlFor; input.setAttribute('aria-label',`Custom ${label.textContent.toLowerCase()}`);
			input.oninput = () => { this.draft[key]=input.value; this.refresh(); this.preview(); }; row.append(input);
			this.dialog.querySelector('.elsemesh-avatar-fields').append(label,row);
		}
		this.dialog.querySelector('.save').onclick = async () => {
			const save=this.dialog.querySelector('.save'); save.disabled=true;
			try {
				if (app) await app.avatar.setAppearance(this.draft);
				this.value={...this.draft}; const saved=saveAppearance(this.value);
				this.name=this.nameInput.value.trim().replace(/[\x00-\x1f<>]/g,'').slice(0,24) || 'Explorer';
				try { localStorage.setItem('elsemesh.avatar.name',this.name); } catch { /* Session-only name. */ }
				if(app) app.player.displayName=this.name;
				if(app) app.player.avatarAppearance={...this.value};
				if (!saved) { this.status('Applied for this session. Browser storage is unavailable.'); return; }
				this.close(true);
			} catch { this.status('Could not load this character. Please try again.'); }
			finally { save.disabled=false; }
		};
		this.dialog.querySelector('.cancel').onclick = () => this.close(false);
		this.dialog.addEventListener('cancel',event => { event.preventDefault(); this.close(false); });
	}
	status(text) { this.dialog.querySelector('.elsemesh-avatar-status').textContent=text; }
	refresh() {
		this.dialog.querySelector('select').value=this.draft.style;
		this.dialog.querySelector('img').src=`${import.meta.env?.BASE_URL || '/'}models/characters/${AVATAR_STYLES[this.draft.style].image}`;
		for (const row of this.dialog.querySelectorAll('[data-field]')) {
			row.querySelector('input').value=this.draft[row.dataset.field];
			for(const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.color===this.draft[row.dataset.field]));
		}
	}
	preview() { this.app?.avatar.setAppearance(this.draft)?.catch(() => this.status('Character unavailable. Please try again.')); }
	show() {
		if(this.dialog.open || (this.app && (!this.app.input.enabled || !this.app.fly || !this.app.thirdIsland))) return;
		this.draft={...this.value}; this.refresh(); this.status('');
		this.nameInput.value=this.name;
		if(this.app) {
			const a=this.app; this.previous={freeCam:a.freeCam,position:a.camera.position.clone(),yaw:a.fly.yaw,pitch:a.fly.pitch};
			a.input.suspend(); document.exitPointerLock?.();
			// An external camera previews the actual local avatar; never relocate the player.
			if(a.player.mode==='walk' && !a.thirdIsland.active && a.monorail.state!=='riding') {
				a.setFreeCam(true); const p=a.player.position;
				a.fly.velocity.set(0,0,0);
				a.fly.setPose(a.camera.position.set(p.x-Math.sin(a.player.yaw)*3.4,p.y+1.05,p.z-Math.cos(a.player.yaw)*3.4),a.player.yaw+Math.PI,-.02);
			}
		}
		this.dialog.showModal();
	}
	close(accepted) {
		if(!accepted) this.app?.avatar.setAppearance(this.value)?.catch(()=>{});
		this.dialog.close();
		if(this.app) {
			const a=this.app,p=this.previous; a.setFreeCam(p.freeCam);
			if(p.freeCam) a.fly.setPose(p.position,p.yaw,p.pitch);
			a.input.resume(); a.input.requestLock();
		}
		this.button.focus();
	}
}
