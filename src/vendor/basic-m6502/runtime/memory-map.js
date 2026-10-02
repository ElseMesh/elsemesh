/**
 * Emulated memory map for PEEK/POKE operations
 * (See Appendix B in REFACTORING-PLAN.md for design rationale)
 *
 * Since TypeScript has no direct hardware memory access,
 * this provides an emulation layer for Apple II memory.
 */
/**
 * Apple II memory map regions
 */
const APPLE_II_REGIONS = {
    SCREEN_START: 0x0400, // Text screen starts at $0400
    SCREEN_END: 0x07ff, // Text screen ends at $07FF
    KEYBOARD: 0xc000, // Keyboard data
    KEYBOARD_STROBE: 0xc010, // Clear keyboard strobe
};
/**
 * Emulated memory map for PEEK/POKE
 */
export class MemoryMap {
    memory;
    handlers = new Map();
    // Keyboard state for GET/PEEK simulation
    keyboardBuffer = 0;
    keyboardReady = false;
    constructor(size = 65536) {
        this.memory = new Uint8Array(size);
        // Register Apple II specific handlers
        this.registerAppleIIHandlers();
    }
    /**
     * Register Apple II specific memory handlers
     */
    registerAppleIIHandlers() {
        // Keyboard data register at $C000
        this.handlers.set(APPLE_II_REGIONS.KEYBOARD, {
            read: () => {
                // High bit set when key ready, low 7 bits are ASCII
                return this.keyboardReady ? this.keyboardBuffer | 0x80 : 0;
            },
            write: () => {
                // Writing to $C000 has no effect
            },
        });
        // Keyboard strobe at $C010 - clear keyboard
        this.handlers.set(APPLE_II_REGIONS.KEYBOARD_STROBE, {
            read: () => {
                this.keyboardReady = false;
                return 0;
            },
            write: () => {
                this.keyboardReady = false;
            },
        });
    }
    /**
     * Simulate a keypress (for testing and integration)
     */
    pressKey(asciiCode) {
        this.keyboardBuffer = asciiCode & 0x7f;
        this.keyboardReady = true;
    }
    /**
     * Check if keyboard has data
     */
    hasKeyboardData() {
        return this.keyboardReady;
    }
    /**
     * PEEK implementation - read byte from address
     */
    peek(address) {
        // Normalize address to 16-bit range
        address = (address & 0xffff) >>> 0;
        // Check for special handlers
        const handler = this.handlers.get(address);
        if (handler) {
            return handler.read(address);
        }
        return this.memory[address];
    }
    /**
     * POKE implementation - write byte to address
     */
    poke(address, value) {
        // Normalize address and value
        address = (address & 0xffff) >>> 0;
        value = (value & 0xff) >>> 0;
        // Check for special handlers
        const handler = this.handlers.get(address);
        if (handler) {
            handler.write(address, value);
            return;
        }
        this.memory[address] = value;
    }
    /**
     * Register a custom memory handler
     */
    registerHandler(address, handler) {
        this.handlers.set(address, handler);
    }
    /**
     * Get screen memory region (for display emulation)
     */
    getScreenMemory() {
        return this.memory.slice(APPLE_II_REGIONS.SCREEN_START, APPLE_II_REGIONS.SCREEN_END + 1);
    }
    /**
     * Clear all memory
     */
    clear() {
        this.memory.fill(0);
        this.keyboardBuffer = 0;
        this.keyboardReady = false;
    }
}
//# sourceMappingURL=memory-map.js.map