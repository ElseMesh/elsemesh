import { Group, Mesh, Vector3 } from '../engine/index.js';
import { box, cylinder, mat4, mergePrepared, prepare } from '../world/boat/GeoKit.js';
import { createPropMaterial } from './GameMaterials.js';
import { sonarContacts } from './SalvageAuthority.js';
import { GrabberCamera } from './GrabberCamera.js';

const BOOM = new Vector3(2.8, 2.4, -2);
const ZERO = { x: 0, z: 0, depth: 0 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class BoatSalvage {
	constructor(app, game) {
		this.app = app; this.game = game; this.items = game.items;
		this.group = new Group(); this.group.name = 'boat-salvage-equipment';
		this.world = new Group(); this.world.name = 'salvage-hook';
		this.axes = { ...ZERO }; this.sentAxes = { ...ZERO }; this.lastControl = 0;
		this.open = false; this.minimized = false; this.selected = null; this.registered = false;
		this.pointerButtons = new Map(); this.resumeInput = false; this.camera = null; this.lastSonar = -Infinity;
		this._a = new Vector3(); this._b = new Vector3(); this._dir = new Vector3();
		this._buildMeshes();
		app.boat?.group?.add(this.group); app.scene?.add(this.world);
		this._visibility = () => { if (document.hidden && this.window?.open) this.window.minimize(); };
		this._blur = () => this._cancelControls();
		this._key = e => {
			const tag=e.target?.tagName;
			if (e.code !== 'KeyO' || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable || !this._onBoat()) return;
			e.preventDefault(); this.window?.show?.();
		};
		document.addEventListener('visibilitychange', this._visibility);
		window.addEventListener('blur', this._blur); window.addEventListener('keydown', this._key);
	}

	_buildMeshes() {
		const material = createPropMaterial('boatSalvage');
		this.group.add(new Mesh(mergePrepared([
			prepare(box(.8,.72,.55),{color:0x173b47,rough:.35,metal:.65,matrix:mat4(1.15,1.22,-1.7)}),
			prepare(box(.62,.38,.12),{color:0x07191e,rough:.25,metal:.2,matrix:mat4(1.15,1.45,-1.39,-.18)}),
			prepare(box(1.15,.14,.18),{color:0x20282a,rough:.35,metal:.85,matrix:mat4(1.65,1.1,-1.85)}),
			prepare(cylinder(.34,.34,.58,16),{color:0x75858a,rough:.3,metal:.9,matrix:mat4(2.15,1.35,-1.85,0,0,Math.PI/2)}),
			prepare(box(.16,1.25,.16),{color:0x68777b,rough:.35,metal:.9,matrix:mat4(2.22,1.58,-1.9,0,0,-.42)}),
			prepare(box(1.15,.14,.14),{color:0x68777b,rough:.35,metal:.9,matrix:mat4(2.57,2.17,-1.96,0,0,-.12)})
		]), material));
		this.cable = new Mesh(prepare(cylinder(.018,.018,1,8),{color:0x171b1c,rough:.65,metal:.5}),material);
		this.grabber = new Mesh(mergePrepared([
			prepare(cylinder(.25,.32,.42,12),{color:0xe0a900,rough:.32,metal:.8}),
			prepare(box(.32,.18,.32),{color:0x20282a,rough:.25,metal:.75,matrix:mat4(0,.27,0)}),
			prepare(box(.07,.08,.07),{color:0x22e8ff,rough:.15,metal:.15,matrix:mat4(.2,.12,.2)}),
			prepare(box(.07,.08,.07),{color:0x22e8ff,rough:.15,metal:.15,matrix:mat4(-.2,.12,.2)})
		]),material);
		this.jaws = new Group();
		for (let i=0;i<3;i++) { const pivot=new Group(); pivot.rotation.y=i*Math.PI*2/3; pivot.add(new Mesh(prepare(box(.11,.58,.14),{color:0xe0a900,rough:.3,metal:.82,matrix:mat4(.31,-.27,0,0,0,-.42)}),material)); this.jaws.add(pivot); }
		this.grabber.add(this.jaws); this.world.add(this.cable,this.grabber);
	}

	_snapshot() { return this.items.data?.salvage || this.items.salvage || this.game.salvageState || null; }
	_boatPosition() { const p=this.app.boatCtl?.position || this.app.boat?.group?.position; return p ? [p.x,p.y,p.z] : [0,0,0]; }
	_onBoat() {
		const mode=this.app.mode || this.app.player?.mode || this.app.game?.mode;
		return mode === 'boat' || mode === 'deck' || !!this.app.boatCtl?.active || this.app.player?.vehicle === this.app.boat;
	}
	_hook(s) {
		if (s?.operator && Array.isArray(s.hook)) return [...s.hook];
		const boat=this.app.boat?.group; if (!boat) return s?.hook || [0,0,0];
		const depth=Number.isFinite(s?.depth) ? s.depth : -2.4;
		const local=new Vector3(2.8+(s?.offsetX||0),0,-2+(s?.offsetZ||0));
		boat.localToWorld(local);
		return [local.x,-depth,local.z];
	}
	_isOperator(s=this._snapshot()) { return !!s?.operator && s.operator === this.items.id; }

	_ensureUI() {
		if (this.registered || !this.app.ui?.windows) return; this.registered=true;
		const root=document.createElement('section'); root.className='salvage-panel';
		root.innerHTML=`<style>.salvage-panel{width:100%;font:13px system-ui;color:#d9fbff}.salvage-panel canvas{width:100%;aspect-ratio:16/9;background:#031519}.salvage-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.salvage-panel button{min-height:44px;padding:8px 10px;border:1px solid #38efff;border-radius:6px;background:#082b3f;color:#d9fbff}.salvage-panel button:focus-visible{outline:2px solid #fff36b;outline-offset:2px}.salvage-panel button:disabled{opacity:.45;cursor:not-allowed}.salvage-sonar{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px;height:170px;overflow:hidden;background:#06272d;padding:6px}.salvage-plot{display:block;width:120px;height:120px;border:1px solid #28727b;border-radius:50%}.salvage-contacts{min-width:0;overflow-y:auto}.salvage-contacts button{display:block;width:100%}@media(max-width:340px){.salvage-sonar{grid-template-columns:1fr;height:auto}.salvage-plot{width:100px;height:100px;margin:auto}.salvage-contacts{max-height:120px}}.salvage-status{min-height:38px}</style><canvas aria-label="Live underwater grabber camera"></canvas><div class="salvage-status"></div><div class="salvage-sonar"></div><div class="salvage-grid"></div>`;
		this.statusEl=root.querySelector('.salvage-status'); this.sonarEl=root.querySelector('.salvage-sonar'); const grid=root.querySelector('.salvage-grid');
		for (const [label,axis,value] of [['Lower','depth',1],['Raise','depth',-1],['Port','x',-1],['Starboard','x',1],['Forward','z',1],['Aft','z',-1]]) {
			const b=document.createElement('button'); b.textContent=label; b.setAttribute('aria-label',`${label} winch (hold)`);
			b.addEventListener('pointerdown',e=>{ if (!this._isOperator()) return; e.preventDefault(); b.setPointerCapture(e.pointerId); this.pointerButtons.set(e.pointerId,{button:b,axis}); this.axes[axis]=value; this.sendControl(true); });
			const up=e=>this._releasePointer(e.pointerId); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('lostpointercapture',up); grid.append(b);
		}
		for (const [label,command] of [['Claim','claim'],['Grab','grab'],['Release','release'],['Retrieve','retrieve']]) { const b=document.createElement('button'); b.textContent=label; b.onclick=()=>this.act(command); grid.append(b); }
		this.sonarEl.addEventListener('click',e=>{ const b=e.target.closest('[data-id]'); if (b) { this.selected=b.dataset.id; this.lastSonar=-Infinity; } });
		this.camera=new GrabberCamera(this.app,root.querySelector('canvas'));
		this.window=this.app.ui.windows.register({id:'boat-salvage',element:root,title:'Sonar & Grabber',onOpen:()=>this.activate(),onClose:reason=>{ this.minimized=reason==='minimize'; this.deactivate(); }});
		this.window.shell.style.width='min(440px, calc(100vw - 16px))'; this.root=root;
		this.launcher=document.createElement('button'); this.launcher.textContent='Sonar'; this.launcher.className='boat-salvage-launcher'; this.launcher.setAttribute('aria-label','Open boat sonar and grabber'); this.launcher.onclick=()=>this.window?.show?.();
		Object.assign(this.launcher.style,{position:'fixed',right:'12px',bottom:'76px',minWidth:'72px',minHeight:'44px',zIndex:'20'}); document.body.append(this.launcher);
	}

	act(command,fields={}) { return this.items.act('salvage',{command,...fields}); }
	sendControl(immediate=false,now=performance.now()) {
		const s=this._snapshot(); if (!this._isOperator(s) || s?.returning) return;
		const moving=this.axes.x!==0 || this.axes.z!==0 || this.axes.depth!==0;
		const changed=this.axes.x!==this.sentAxes.x || this.axes.z!==this.sentAxes.z || this.axes.depth!==this.sentAxes.depth;
		if (!immediate && now-this.lastControl<200) return; if (!changed && !moving) return;
		this.lastControl=now; this.sentAxes={...this.axes}; this.act('control',{axes:{...this.axes}});
	}
	_releasePointer(id) { const held=this.pointerButtons.get(id); if (!held) return; this.pointerButtons.delete(id); try { if (held.button.hasPointerCapture(id)) held.button.releasePointerCapture(id); } catch {} this.axes[held.axis]=0; this.sendControl(true); }
	_cancelControls() { for (const [id] of [...this.pointerButtons]) this._releasePointer(id); this.axes={...ZERO}; if (this._isOperator() && !this._snapshot()?.returning) this.sendControl(true); }
	activate() { if (this.open) return; this.open=true; this.minimized=false; this.camera?.setVisible(true); this.resumeInput=this.app.input?.enabled!==false; if (this.resumeInput) this.app.input?.suspend?.(); if (this._onBoat()) this.act('claim'); }
	deactivate() {
		if (!this.open) return; const owned=this._isOperator(); this._cancelControls(); this.open=false; this.camera?.setVisible(false); if (owned) this.act('stop');
		if (this.resumeInput) this.app.input?.resume?.(); this.resumeInput=false;
	}

	_renderSonar(contacts) {
		const dots=contacts.slice(0,24).map(c=>{ const r=Math.min(66,c.distance/80*66), x=75+Math.sin(c.bearing)*r, y=75-Math.cos(c.bearing)*r; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${c.itemId===this.selected?5:3}" fill="${c.itemId===this.selected?'#fff36b':'#38efff'}"/>`; }).join('');
		const list=contacts.slice(0,12).map(c=>`<button data-id="${esc(c.itemId)}" aria-pressed="${c.itemId===this.selected}">${c.itemId===this.selected?'▶ ':''}${esc(c.type)}: ${c.distance.toFixed(1)}m, ${(c.bearing*180/Math.PI).toFixed(0)}°, depth ${c.depth.toFixed(1)}m</button>`).join('');
		this.sonarEl.innerHTML=`<svg class="salvage-plot" width="150" height="150" viewBox="0 0 150 150" aria-label="80 metre polar sonar plot"><circle cx="75" cy="75" r="66" fill="#03191e" stroke="#28727b"/><circle cx="75" cy="75" r="33" fill="none" stroke="#174b52"/><path d="M75 9V141M9 75H141" stroke="#174b52"/>${dots}</svg><div class="salvage-contacts">${list || 'No salvage contacts within 80m / 50m depth.'}</div>`;
	}
	update(now=performance.now()) {
		this._ensureUI(); const s=this._snapshot(); const hook=this._hook(s); const aboard=this._onBoat();
		if (this.launcher) this.launcher.hidden=!aboard;
		this.grabber.position.set(...hook); this.jaws.children.forEach(j=>{j.rotation.z=s?.heldItemId?-.2:.32;});
		this.app.boat?.group?.localToWorld(this._a.copy(BOOM)); this._b.set(...hook); this._dir.subVectors(this._b,this._a); const length=this._dir.length(); this.cable.position.copy(this._a).add(this._b).multiplyScalar(.5); if (length>.001) this.cable.quaternion.setFromUnitVectors(this.cable.up,this._dir.normalize()); this.cable.scale.set(1,length,1);
		if (!this.open) return;
		const terrain=this.app.terrainData?.heightAt;
		if (this.axes.depth>0 && terrain && hook[1]<=terrain.call(this.app.terrainData,hook[0],hook[2])+.65) { this.axes.depth=0; this.sendControl(true,now); }
		this.sendControl(false,now); const contacts=sonarContacts(this.items.data?.items||[],this._boatPosition(),80,50);
		const target=contacts.find(c=>c.itemId===this.selected);
		let guidance='';
		if (target) {
			const item=(this.items.data?.items||[]).find(i=>(i.id||i.itemId)===target.itemId); const p=item?.position||item?.pos;
			if (p) { const dx=p[0]-hook[0], dz=p[2]-hook[2], dy=p[1]-hook[1], q=this.app.boat?.group?.quaternion; this._dir.set(dx,0,dz); if (q) this._dir.applyQuaternion(q.clone().invert()); const lr=this._dir.x<0?`${Math.abs(this._dir.x).toFixed(1)}m port`:`${this._dir.x.toFixed(1)}m starboard`; const fa=this._dir.z<0?`${Math.abs(this._dir.z).toFixed(1)}m aft`:`${this._dir.z.toFixed(1)}m forward`; guidance=` · ${lr}, ${fa}, ${Math.abs(dy).toFixed(1)}m ${dy<0?'below':'above'}`; }
		}
		if (this.root) this.root.querySelectorAll('.salvage-grid button').forEach(b=>{ if (b.textContent!=='Claim') b.disabled=!this._isOperator(s)||!!s?.returning; });
		if (this.statusEl) this.statusEl.textContent=`${this._isOperator(s)?'Controls active':s?.operator?`Busy: ${s.operator}`:'Winch unclaimed'} · cable ${Math.max(0,s?.depth||0).toFixed(1)}/50m · sonar 80m${guidance}${s?.returning?' · retrieving':''}${s?.error?` · ${s.error}`:''}${this.camera?.error?` · ${this.camera.error}`:''}`;
		if (now-this.lastSonar>=200) { this.lastSonar=now; this._renderSonar(contacts); }
	}
	renderCamera(now) { if (this.open&&!this.minimized) this.camera?.render(this.grabber.position.toArray(),now); }
	dispose() { this.deactivate(); document.removeEventListener('visibilitychange',this._visibility); window.removeEventListener('blur',this._blur); window.removeEventListener('keydown',this._key); this.launcher?.remove(); this.camera?.dispose(); this.group.removeFromParent(); this.world.removeFromParent(); }
}
