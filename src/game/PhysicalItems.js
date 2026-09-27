import { Group, Mesh, Vector3 } from '../engine/index.js';
import { prepare, mergePrepared, box, cylinder, mat4 } from '../world/boat/GeoKit.js';
import { createPropMaterial } from './GameMaterials.js';
import { ItemEconomy } from './ItemEconomy.js';
import { ITEM_TYPES, SUPPLY_CRATE } from './ItemCatalog.js';

const SAVE = 'burning-horizons.items.v1';
// Agent Control: one shared geometry per type; held and dropped objects use the same model.
function geometry(type) {
	const parts = [], add = (g, color, x=0,y=0,z=0,rx=0,ry=0,rz=0) => parts.push(prepare(g,{color,matrix:mat4(x,y,z,rx,ry,rz)}));
	if (type === 'rod') {
		add(cylinder(.006,.014,1.65),0x303b44,0,.8,0); add(cylinder(.028,.028,.3),0x9b7340,0,.05,0);
		add(cylinder(.055,.055,.05),0x909a9d,.05,.17,0,0,0,Math.PI/2);
	} else if (type === 'knife') {
		add(box(.045,.14,.025),0x59442f,0,.07); add(box(.035,.16,.006),0xc1cad1,0,.22); add(box(.07,.012,.035),0x9eabb5,0,.145);
	} else if (type === 'watch') {
		add(box(.065,.25,.015),0x604831); add(cylinder(.046,.046,.018,24),0xc4ae6a,0,0,.02,Math.PI/2);
		add(cylinder(.037,.037,.02,24),0xe8e0c6,0,0,.025,Math.PI/2); add(box(.005,.027,.003),0x172a33,0,.013,.039); add(box(.022,.005,.003),0x172a33,.01,0,.04);
	} else {
		add(box(.085,.17,.014),0x23282c); add(box(.074,.14,.002),0x276b7b,0,.004,.009); add(box(.025,.003,.002),0xb4bec3,0,.078,.009);
		add(box(.002,.11,.003),0xbed3d5,.009,0,.011,0,0,.38);
	}
	return mergePrepared(parts);
}

export class PhysicalItems {
	constructor(game) {
		this.game=game; this.app=game.app; this.id='solo'; this.ledger=new ItemEconomy(); this.meshes=new Map();
		this.material=createPropMaterial('foundItems'); this.geometry=Object.fromEntries(Object.keys(ITEM_TYPES).map(t=>[t,geometry(t)]));
		try { const saved=localStorage.getItem(SAVE); if(saved)this.ledger.load(JSON.parse(saved)); } catch { /* Agent Control: storage unavailable. */ }
		this.ledger.join(this.id);
		if (!this.ledger.accounts.solo.migrated) {
			Object.assign(this.ledger.accounts.solo,{credits:Math.max(0,Math.floor(game.state.money)),fish:game.state.inventory.map(f=>({...f})),upgrades:{...game.state.upgrades},nextFish:game.state._nextId,migrated:true});
		}
		this.data=this.ledger.packet(); this.sync();
		this.crate=new Group();
		this.crate.add(new Mesh(prepare(box(.7,.45,.5),{color:0x84613d,matrix:mat4(0,.225,0)}),this.material));
		this.crateLid=new Mesh(prepare(box(.74,.055,.54),{color:0xa38155,matrix:mat4(0,0,.27)}),this.material);
		this.crateLid.position.set(0,.48,-.27);this.crate.add(this.crateLid);
		this.crateRope=new Mesh(prepare(box(.045,.008,.53),{color:0xd6c193,matrix:mat4(0,.516,0)}),this.material);this.crate.add(this.crateRope);
		this.crate.position.set(SUPPLY_CRATE.x,this.app.terrainData.heightAt(SUPPLY_CRATE.x,SUPPLY_CRATE.z),SUPPLY_CRATE.z); this.app.scene.add(this.crate);
	}
	connect(transport,id) {
		this.transport=transport; this.id=id; this.data=null;
		this.game.state.storage=null; // Agent Control: room state must not overwrite the solo save.
		transport.onEconomy(packet=>{
			if(packet.type==='economy'){this.data=packet;this.sync();}
			else {this.game.toast(packet.message,4500); if(packet.ok && packet.action==='fuel')this.game.state.fuel=Math.min(this.game.state.stats.fuelL,this.game.state.fuelL+packet.litres);}
		});
	}
	get account(){return this.data?.accounts[this.id];}
	get owned(){return this.data?.items.filter(i=>i.owner===this.id)||[];}
	get hasRod(){return this.owned.some(i=>i.type==='rod');}
	act(action,fields={}) {
		if(this.transport){return this.transport.economyAction({action,...fields});}
		const p=this.app.player; this.ledger.position(this.id,{position:[p.position.x,p.position.y,p.position.z],mode:p.mode});
		const result=this.ledger.act(this.id,{action,...fields}); this.sync();
		if(result.ok && action==='fuel')this.game.state.fuel=Math.min(this.game.state.stats.fuelL,this.game.state.fuelL+fields.litres);
		try{localStorage.setItem(SAVE,JSON.stringify(this.ledger.packet()));}catch{}
		this.game.toast(result.message,4500); return result.ok;
	}
	sync(){
		if(!this.transport)this.data=this.ledger.packet();
		if(!this.account)return;
		const s=this.game.state;
		s.money=this.account.credits; s.inventory=(this.account.fish || []).map(f=>({...f})); s.upgrades={...s.upgrades,...this.account.upgrades};
		s._nextId=this.account.nextFish||1; s.emit(); s.save();
		if(!this.hasRod){this.game.cancelLine?.(true);this.game.rod?.equip(false);}
		if(this.game.hud?.invOpen)this.game.hud.renderInventory();
		if(this.game.hud?.standOpen){if(this.game.hud.vendor.kind==='shop')this.game.hud.renderShop();else this.game.hud.renderStand();}
	}
	update(){
		const app=this.app,p=app.player;
		if(!this.pickupButton && this.game.hud){this.pickupButton=document.createElement('button');this.pickupButton.className='tw-interactive';this.pickupButton.style.cssText='position:fixed;bottom:18%;left:50%;transform:translateX(-50%);padding:12px 20px;border:1px solid #9ce5db;border-radius:24px;background:#10272ded;color:white;z-index:30;cursor:pointer';document.body.append(this.pickupButton);this.pickupButton.onclick=()=>{if(this.nearest)this.act('pickup',{itemId:this.nearest.id});};}
		if(!this.transport){
			const now=Date.now(),boat=this.game.boatCtl;
			this.ledger.position(this.id,{position:[p.position.x,p.position.y,p.position.z],mode:p.mode},now);
			if(boat?.position&&boat?.quaternion){
				const velocity=boat.velocity||boat.body?.velocity;
				this.ledger.boat({position:[boat.position.x,boat.position.y,boat.position.z],quaternion:[boat.quaternion.x,boat.quaternion.y,boat.quaternion.z,boat.quaternion.w],velocity:[velocity?.x||0,velocity?.y||0,velocity?.z||0]},now);
			}
			const heldBefore=this.ledger.salvage?.heldItemId;
			this.ledger.tick(now); this.data=this.ledger.packet();
			const recovered=heldBefore && !this.ledger.salvage?.heldItemId && this.data.items.some(item=>item.id===heldBefore&&item.owner===this.id);
			if(recovered){
				this.sync();
				try{localStorage.setItem(SAVE,JSON.stringify(this.data));}catch{}
			}
		}
		if(!this.data)return;
		let closest=null, distance=3;
		for(const item of this.data.items){
			let mesh=this.meshes.get(item.id);
			if(!mesh){mesh=new Mesh(this.geometry[item.type],this.material);mesh.name=`Found_${item.type}_${item.id}`;mesh.castShadow=true;app.scene.add(mesh);this.meshes.set(item.id,mesh);}
			mesh.visible=false;
			if(item.owner===null){
				const y=Number.isFinite(item.y)?item.y:app.terrainData.heightAt(item.x,item.z);
				mesh.position.set(item.x,y+.055,item.z); mesh.rotation.set(Math.PI/2,0,.4);mesh.visible=true;
				const d=Math.hypot(p.position.x-item.x,p.position.y-y,p.position.z-item.z);
				if(p.mode==='walk'&&!item.held&&d<distance){closest=item;distance=d;}
			} else if(item.owner===this.id && this.account?.equipped===item.id && item.type!=='rod'){
				// Visible in hand from first person; the world object remains the same owned instance.
				mesh.position.copy(app.camera.position).add(new Vector3(.28,-.25,-.6).applyQuaternion(app.camera.quaternion));
				mesh.quaternion.copy(app.camera.quaternion);mesh.visible=!app.freeCam && p.mode==='walk';
			} else if(item.owner!==this.id && this.data.accounts[item.owner]?.equipped===item.id){
				const entry=app.networkDemo?.remotes?.get(`player:${item.owner}`), pose=entry?.remote.state;
				if(pose && entry.avatar.group.visible){mesh.position.set(pose.position[0]+.3,pose.position[1]+.9,pose.position[2]);mesh.rotation.set(0,pose.yaw,0);mesh.visible=true;}
			}
		}
		this.nearest=closest && !this.game.hud?.invOpen && !this.game.hud?.standOpen && !app.freeCam ? closest : null;
		if(this.pickupButton){this.pickupButton.hidden=!this.nearest;if(this.nearest)this.pickupButton.textContent=`Pick up ${ITEM_TYPES[this.nearest.type].name} · J`;}
		if(this.nearest){p.prompt={key:'J',text:`Pick up ${ITEM_TYPES[closest.type].name}`};if(app.input.hit('KeyJ'))this.act('pickup',{itemId:closest.id});}
		this.crateLid.rotation.x=this.data.crateOpened?-1.2:0;this.crateRope.visible=!this.data.crateOpened;
	}
	controls(container,shop=false){
		const root=document.createElement('section');root.className='gm-items';root.style.cssText='padding:14px;border-top:1px solid #8ba7a744;min-height:120px;max-height:45vh;overflow:auto;flex:1 1 auto';
		const title=document.createElement('h3');title.textContent=`Bag · ${this.owned.length}/12 · ${this.account?.credits||0} credits`;root.append(title);
		const button=(parent,label,fn)=>{const b=document.createElement('button');b.className='gm-mini';b.style.cssText='min-height:44px;padding:7px 10px;margin:3px;white-space:normal';b.textContent=label;b.onclick=fn;parent.append(b);return b;};
		const text=(parent,value)=>{const el=document.createElement('p');el.textContent=value;parent.append(el);return el;};
		if(!this.owned.length)text(root,'Find objects on the beach. Stand close and press J, or tap Pick up.');
		for(const item of this.owned){
			const row=document.createElement('div');row.style.cssText='padding:8px 0;border-bottom:1px solid #8ba7a722';
			text(row,`${ITEM_TYPES[item.type].name}${this.account.equipped===item.id?' · equipped':''}`);
			button(row,'Use',()=>{this.act('use',{itemId:item.id});if(item.type==='watch')this.game.toast(`Island time ${String(Math.floor(this.app.settings.timeOfDay)).padStart(2,'0')}:${String(Math.floor(this.app.settings.timeOfDay%1*60)).padStart(2,'0')}`,5000);if(item.type==='rod')this.game.rod.equip(true);});
			button(row,'Drop',()=>this.act('drop',{itemId:item.id}));
			if(shop)button(row,`Sell · ${ITEM_TYPES[item.type].sell} credits`,()=>this.act('sell',{itemId:item.id}));
			if(this.transport){
				const select=document.createElement('select');select.setAttribute('aria-label','Trade recipient');
				for(const id of Object.keys(this.data?.accounts||{}).filter(id=>id!==this.id)){const o=document.createElement('option');o.value=id;o.textContent=id;select.append(o);}
				const price=document.createElement('input');price.type='number';price.min='0';price.max='100000';price.value='0';price.style.width='75px';price.setAttribute('aria-label','Requested credits');
				const exchange=document.createElement('select');exchange.setAttribute('aria-label','Requested item');
				const refresh=()=>{exchange.replaceChildren();const no=document.createElement('option');no.value='';no.textContent='No item requested';exchange.append(no);for(const i of this.data.items.filter(i=>i.owner===select.value)){const o=document.createElement('option');o.value=i.id;o.textContent=ITEM_TYPES[i.type].name;exchange.append(o);}};select.onchange=refresh;refresh();
				row.append(select,price,exchange);button(row,'Offer trade',()=>this.act('offer',{itemId:item.id,to:select.value,price:Number(price.value),requestItemId:exchange.value||null}));
			}
			root.append(row);
		}
		for(const o of this.data?.offers||[]){if(o.to!==this.id)continue;const i=this.data.items.find(i=>i.id===o.itemId),r=this.data.items.find(i=>i.id===o.requestItemId);const row=document.createElement('div');text(row,`${o.from} offers ${ITEM_TYPES[i.type].name} for ${o.price} credits${r?` and your ${ITEM_TYPES[r.type].name}`:''}. Expires in 60 seconds.`);button(row,'Accept',()=>this.act('accept',{offerId:o.id}));button(row,'Decline',()=>this.act('reject',{offerId:o.id}));root.append(row);}
		if(shop){text(root,'General shop stock');for(const [type,info] of Object.entries(ITEM_TYPES))button(root,`${info.name} · ${info.buy} credits`,()=>this.act('buy',{itemType:type}));}
		text(root,this.transport?'Room inventory: dropped items remain while the room is open. Leaving drops carried objects; credits reset when you leave.':'Solo inventory and credits are saved on this browser.');
		container.append(root);
	}
}
