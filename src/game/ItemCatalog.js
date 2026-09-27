// Agent Control: original game objects and fixed credit prices; no purchased assets.
export const ITEM_TYPES = Object.freeze({
	rod: { name: 'Fishing rod', buy: 40, sell: 20, use: 'Equip to fish' },
	knife: { name: 'Utility knife', buy: 25, sell: 12, use: 'Open the rope-bound supply crate' },
	watch: { name: 'Wristwatch', buy: 30, sell: 15, use: 'Read island time' },
	phone: { name: 'Washed-up mobile phone', buy: 50, sell: 25, use: 'Read the recovered message' },
});
export const GENERAL_SHOP = { x: 49.9, z: -74.6, radius: 5 };
export const SUPPLY_CRATE = { x: 62, z: -70 };
export const ITEM_SPAWNS = [
	['beach-rod', 'rod', 56, -79], ['beach-knife', 'knife', 45, -70],
	['beach-watch', 'watch', 59, -61], ['beach-phone', 'phone', 64, -49],
	['cove-rod', 'rod', 70, -89], ['path-knife', 'knife', 54, -62],
];
