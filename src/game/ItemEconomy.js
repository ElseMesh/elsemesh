import { ITEM_TYPES, ITEM_SPAWNS, GENERAL_SHOP, SUPPLY_CRATE } from './ItemCatalog.js';
import { FISH, fishValue, fishLengthCm } from './FishTable.js';
import { defaultUpgrades, nextLevel, FUEL_PRICE, UPGRADES, gearStats } from './Gear.js';

// Agent Control: the same deterministic authority runs in solo saves and on the room server.
// All transfers are synchronous transactions. Clients send intents, never balances or ownership.
export class ItemEconomy {
	constructor() {
		this.items = ITEM_SPAWNS.map(([id, type, x, z]) => ({ id, type, x, z, owner: null }));
		this.accounts = {}; this.positions = {}; this.offers = []; this.serial = 0; this.revision = 0; this.crateOpened = false;
	}
	join(id) { this.accounts[id] ||= { credits: 0, equipped: null, fish: [], nextFish: 1, upgrades: defaultUpgrades(), lastCatch: 0 }; }
	position(id, pose) {
		if (Array.isArray(pose?.position) && pose.position.length === 3 && pose.position.every(Number.isFinite)) this.positions[id] = { x: pose.position[0], y: pose.position[1], z: pose.position[2], mode: pose.mode, at: Date.now() };
	}
	near(id, point, radius = 3) {
		const p = this.positions[id];
		return p && Date.now() - p.at < 5000 && p.mode === 'walk' && Math.hypot(p.x - point.x, p.z - point.z) <= radius;
	}
	owned(id) { return this.items.filter(i => i.owner === id); }
	act(id, a, now = Date.now()) {
		const account = this.accounts[id];
		if (!account || !a || typeof a !== 'object') return { ok: false, message: 'Not connected.' };
		this.offers = this.offers.filter(o => o.expires > now);
		const item = this.items.find(i => i.id === a.itemId);
		const owned = item?.owner === id;
		const fail = message => ({ ok: false, message });
		let message = 'Done';
		if (a.action === 'catch') {
			if (!this.owned(id).some(i => i.type === 'rod') || !Object.hasOwn(FISH,a.species) || !Number.isFinite(a.kg) || a.kg <= 0 || a.kg > 100 || now - account.lastCatch < 8000) return fail('Catch could not be registered.');
			if(account.fish.length>=200 || account.fish.reduce((n,f)=>n+f.kg,0)+a.kg>gearStats(account.upgrades).holdKg)return fail('Fish hold is full.');
			account.lastCatch = now;
			account.fish.push({id: account.nextFish++, species:a.species, kg:a.kg, cm:Math.round(fishLengthCm(a.species,a.kg)), value:fishValue(a.species,a.kg)});
			message = 'Catch stored';
		} else if (a.action === 'sellFish') {
			if (!this.near(id, GENERAL_SHOP, GENERAL_SHOP.radius)) return fail('Visit the general shop.');
			const sold = account.fish.filter(f => a.fishId == null || f.id === a.fishId);
			const value = sold.reduce((n,f) => n + f.value,0);
			account.fish = account.fish.filter(f => !sold.includes(f)); account.credits += value;
			message = `Sold fish for ${value} credits`;
		} else if (a.action === 'releaseFish') {
			account.fish = account.fish.filter(f => f.id !== a.fishId); message = 'Fish released';
		} else if (a.action === 'upgrade') {
			if(!Object.hasOwn(UPGRADES,a.key))return fail('Unknown upgrade.');
			if(!this.near(id,{x:85.5,z:-60.5},5))return fail('Visit Marta for upgrades.');
			const level = nextLevel(account.upgrades, a.key);
			const p = this.positions[id];
			if (!p || !level || account.credits < level.cost) return fail('Upgrade unavailable or insufficient credits.');
			account.credits -= level.cost; account.upgrades[a.key] = level.index; message = 'Upgrade purchased';
		} else if (a.action === 'fuel') {
			if(!this.near(id,{x:85.5,z:-60.5},5))return fail('Visit Marta for fuel.');
			if (!Number.isSafeInteger(a.litres) || a.litres < 1 || a.litres > 1000 || account.credits < Math.ceil(a.litres * FUEL_PRICE)) return fail('Not enough credits for fuel.');
			account.credits -= Math.ceil(a.litres * FUEL_PRICE); message = 'Fuel purchased';
		} else if (a.action === 'pickup') {
			if (!item || item.owner !== null || !this.near(id, item)) return fail('Move closer to the item.');
			if (this.owned(id).length >= 12) return fail('Your bag is full (12 items).');
			item.owner = id; message = `Picked up ${ITEM_TYPES[item.type].name}`;
		} else if (a.action === 'drop') {
			const p = this.positions[id];
			if (!owned || !p || !this.near(id, p)) return fail('Stand on land or in shallow water to drop items.');
			item.owner = null; item.x = p.x; item.z = p.z; item.y = p.y;
			if (account.equipped === item.id) account.equipped = null;
			message = 'Item dropped at your feet';
		} else if (a.action === 'use') {
			if (!owned) return fail('You do not own this item.');
			account.equipped = item.id;
			if (item.type === 'knife') {
				if (this.near(id, SUPPLY_CRATE) && !this.crateOpened) { this.crateOpened = true; account.credits += 35; message = 'Rope cut. You found 35 credits in the supply crate.'; }
				else message = this.crateOpened ? 'The supply crate is already open.' : 'Knife equipped. Find the rope-bound crate near the beach path.';
			} else if (item.type === 'phone') message = 'Recovered message: “The sea cave is the entrance. Follow the railway beneath the water.”';
			else if (item.type === 'watch') message = 'Watch equipped';
			else message = 'Rod equipped — press R to take it out';
		} else if (a.action === 'sell' || a.action === 'buy') {
			if (!this.near(id, GENERAL_SHOP, GENERAL_SHOP.radius)) return fail('Visit the general shop to trade.');
			if (a.action === 'sell') {
				if (!owned) return fail('You do not own this item.');
				account.credits += ITEM_TYPES[item.type].sell; item.owner = 'shop';
				if (account.equipped === item.id) account.equipped = null;
				message = `Sold for ${ITEM_TYPES[item.type].sell} credits`;
			} else {
				const type = Object.hasOwn(ITEM_TYPES,a.itemType) ? ITEM_TYPES[a.itemType] : null;
				if (!type || account.credits < type.buy) return fail('Not enough credits.');
				if (this.owned(id).length >= 12) return fail('Your bag is full.');
				account.credits -= type.buy;
				const stock=this.items.find(i=>i.owner==='shop' && i.type===a.itemType);
				if(stock)stock.owner=id;
				else this.items.push({ id: `purchase-${++this.serial}`, type: a.itemType, owner: id, x: GENERAL_SHOP.x, z: GENERAL_SHOP.z });
				message = `Bought ${type.name}`;
			}
		} else if (a.action === 'offer') {
			const target = this.accounts[a.to];
			const requested = a.requestItemId ? this.items.find(i => i.id === a.requestItemId) : null;
			if (!owned || !target || a.to === id || !this.near(id, this.positions[a.to] || {}, 5) || !this.near(a.to,this.positions[id]||{},5)) return fail('Trade with a nearby player who is on foot.');
			if (!Number.isSafeInteger(a.price) || a.price < 0 || a.price > 100000) return fail('Enter a whole credit price.');
			if (a.requestItemId && requested?.owner !== a.to) return fail('That player no longer owns the requested item.');
			this.offers = this.offers.filter(o => o.from !== id);
			this.offers.push({ id: `offer-${++this.serial}`, from: id, to: a.to, itemId: item.id, requestItemId: requested?.id || null, price: a.price, expires: now + 60000 });
			message = 'Offer sent — waiting for acceptance';
		} else if (a.action === 'accept' || a.action === 'reject') {
			const o = this.offers.find(o => o.id === a.offerId && o.to === id);
			if (!o) return fail('Offer expired or withdrawn.');
			if (a.action === 'accept') {
				const offered = this.items.find(i => i.id === o.itemId), requested = this.items.find(i => i.id === o.requestItemId);
				if (offered?.owner !== o.from || (o.requestItemId && requested?.owner !== id) || !this.accounts[o.from] || !this.near(id, this.positions[o.from] || {}, 5) || !this.near(o.from,this.positions[id]||{},5)) return fail('Offer changed or the other player moved away.');
				if (account.credits < o.price || (!requested && this.owned(id).length >= 12)) return fail('Insufficient credits or bag space.');
				// Validate everything before changing either side; a replay cannot transfer twice.
				account.credits -= o.price; this.accounts[o.from].credits += o.price; offered.owner = id;
				if (requested) requested.owner = o.from;
				if (this.accounts[o.from].equipped === offered.id) this.accounts[o.from].equipped = null;
				if (requested && account.equipped === requested.id) account.equipped = null;
				message = 'Trade completed';
			} else message = 'Offer declined';
			this.offers = this.offers.filter(x => x.id !== o.id);
		} else return fail('Unknown item action.');
		this.offers = this.offers.filter(o => this.items.find(i => i.id === o.itemId)?.owner === o.from && (!o.requestItemId || this.items.find(i => i.id === o.requestItemId)?.owner === o.to));
		this.revision++;
		return { ok: true, message };
	}
	disconnect(id) {
		const p = this.positions[id] || GENERAL_SHOP;
		for (const i of this.owned(id)) { i.owner = null; i.x = p.x; i.z = p.z; }
		this.offers = this.offers.filter(o => o.from !== id && o.to !== id);
		delete this.accounts[id]; delete this.positions[id]; this.revision++;
	}
	packet() { return { type: 'economy', v: 1, revision: this.revision, items: this.items, accounts: this.accounts, offers: this.offers, serial: this.serial, crateOpened: this.crateOpened }; }
	load(data) {
		if (data?.v !== 1 || !Array.isArray(data.items) || !data.accounts || data.items.length > 2000) return false;
		const ids = new Set();
		if (!data.items.every(i => i && typeof i.id === 'string' && !ids.has(i.id) && ids.add(i.id) && Object.hasOwn(ITEM_TYPES,i.type) && Number.isFinite(i.x) && Number.isFinite(i.z) && (i.owner === null || typeof i.owner === 'string'))) return false;
		if (!Object.values(data.accounts).every(a => a && Number.isSafeInteger(a.credits) && a.credits >= 0)) return false;
		this.items = data.items; this.accounts = data.accounts; this.serial = Number.isSafeInteger(data.serial) ? data.serial : 0; this.crateOpened = !!data.crateOpened; return true;
	}
}
