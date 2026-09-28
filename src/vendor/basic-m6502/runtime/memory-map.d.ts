/**
 * Emulated memory map for PEEK/POKE operations
 * (See Appendix B in REFACTORING-PLAN.md for design rationale)
 *
 * Since TypeScript has no direct hardware memory access,
 * this provides an emulation layer for Apple II memory.
 */
/**
 * Memory region handler for special addresses
 */
export interface MemoryHandler {
    read: (address: number) => number;
    write: (address: number, value: number) => void;
}
/**
 * Emulated memory map for PEEK/POKE
 */
export declare class MemoryMap {
    private memory;
    private handlers;
    private keyboardBuffer;
    private keyboardReady;
    constructor(size?: number);
    /**
     * Register Apple II specific memory handlers
     */
    private registerAppleIIHandlers;
    /**
     * Simulate a keypress (for testing and integration)
     */
    pressKey(asciiCode: number): void;
    /**
     * Check if keyboard has data
     */
    hasKeyboardData(): boolean;
    /**
     * PEEK implementation - read byte from address
     */
    peek(address: number): number;
    /**
     * POKE implementation - write byte to address
     */
    poke(address: number, value: number): void;
    /**
     * Register a custom memory handler
     */
    registerHandler(address: number, handler: MemoryHandler): void;
    /**
     * Get screen memory region (for display emulation)
     */
    getScreenMemory(): Uint8Array;
    /**
     * Clear all memory
     */
    clear(): void;
}
