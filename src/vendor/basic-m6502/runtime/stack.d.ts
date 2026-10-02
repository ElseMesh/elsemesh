/**
 * Stack management - FOR/GOSUB stack entries
 * Maps to stack structure in original (lines 1370-1391, 2060-2100 in m6502.asm)
 */
/**
 * FOR entry matching original 18-byte structure (FORSIZ = 16 + 2*ADDPRC)
 * Original stack layout:
 *   FORTK(1) + varPtr(2) + step(5) + sign(1) + limit(5) + lineNum(2) + txtPtr(2)
 */
export interface ForEntry {
    type: 'for';
    variable: string;
    step: number;
    stepSign: number;
    limit: number;
    lineNumber: number;
    tokenIndex: number;
}
/**
 * GOSUB entry matching original 5-byte structure
 */
export interface GosubEntry {
    type: 'gosub';
    lineNumber: number;
    tokenIndex: number;
}
export type StackEntry = ForEntry | GosubEntry;
/**
 * Runtime stack for FOR/NEXT and GOSUB/RETURN
 */
export declare class RuntimeStack {
    private stack;
    /**
     * Push a FOR entry onto the stack
     */
    pushFor(entry: Omit<ForEntry, 'type'>): void;
    /**
     * Push a GOSUB entry onto the stack
     */
    pushGosub(entry: Omit<GosubEntry, 'type'>): void;
    /**
     * Find a FOR entry by variable name (FNDFOR equivalent)
     *
     * This searches the stack from top to bottom for a matching FOR.
     * If found, it removes all entries above it (nested FORs and GOSUBs).
     *
     * Bug #1 fix: Uses full variable name comparison, not single-byte
     */
    findFor(variable: string): ForEntry | null;
    /**
     * Pop a GOSUB entry (for RETURN)
     */
    popGosub(): GosubEntry | null;
    /**
     * Pop a FOR entry (when loop completes)
     */
    popFor(variable: string): void;
    /**
     * Remove a FOR entry by variable name (used when reassigning loop variable)
     */
    private removeFor;
    /**
     * Get the topmost FOR entry (for NEXT without variable)
     */
    peekFor(): ForEntry | null;
    /**
     * Clear the stack (for NEW, RUN, CLEAR)
     */
    clear(): void;
    /**
     * Check if stack is empty
     */
    isEmpty(): boolean;
    /**
     * Get stack depth (for debugging)
     */
    get depth(): number;
}
