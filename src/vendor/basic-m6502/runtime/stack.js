/**
 * Stack management - FOR/GOSUB stack entries
 * Maps to stack structure in original (lines 1370-1391, 2060-2100 in m6502.asm)
 */
/**
 * Runtime stack for FOR/NEXT and GOSUB/RETURN
 */
export class RuntimeStack {
    stack = [];
    /**
     * Push a FOR entry onto the stack
     */
    pushFor(entry) {
        // First, remove any existing FOR with the same variable
        // This handles nested FOR loops with the same variable
        this.removeFor(entry.variable);
        this.stack.push({
            type: 'for',
            ...entry,
        });
    }
    /**
     * Push a GOSUB entry onto the stack
     */
    pushGosub(entry) {
        this.stack.push({
            type: 'gosub',
            ...entry,
        });
    }
    /**
     * Find a FOR entry by variable name (FNDFOR equivalent)
     *
     * This searches the stack from top to bottom for a matching FOR.
     * If found, it removes all entries above it (nested FORs and GOSUBs).
     *
     * Bug #1 fix: Uses full variable name comparison, not single-byte
     */
    findFor(variable) {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const entry = this.stack[i];
            if (entry.type === 'for' && entry.variable === variable) {
                // Found matching FOR - clean up stack above this entry
                // (This handles cases like: FOR I: FOR J: NEXT I which clears the J loop)
                this.stack.length = i + 1;
                return entry;
            }
        }
        return null;
    }
    /**
     * Pop a GOSUB entry (for RETURN)
     */
    popGosub() {
        // Search from top for a GOSUB entry
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const entry = this.stack[i];
            if (entry.type === 'gosub') {
                // Remove this entry and all above it
                this.stack.length = i;
                return entry;
            }
        }
        return null;
    }
    /**
     * Pop a FOR entry (when loop completes)
     */
    popFor(variable) {
        const entry = this.findFor(variable);
        if (entry) {
            // findFor already positioned stack correctly, just pop
            this.stack.pop();
        }
    }
    /**
     * Remove a FOR entry by variable name (used when reassigning loop variable)
     */
    removeFor(variable) {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const entry = this.stack[i];
            if (entry.type === 'for' && entry.variable === variable) {
                // Remove all entries from this point up
                this.stack.length = i;
                break;
            }
        }
    }
    /**
     * Get the topmost FOR entry (for NEXT without variable)
     */
    peekFor() {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const entry = this.stack[i];
            if (entry.type === 'for') {
                return entry;
            }
        }
        return null;
    }
    /**
     * Clear the stack (for NEW, RUN, CLEAR)
     */
    clear() {
        this.stack = [];
    }
    /**
     * Check if stack is empty
     */
    isEmpty() {
        return this.stack.length === 0;
    }
    /**
     * Get stack depth (for debugging)
     */
    get depth() {
        return this.stack.length;
    }
}
//# sourceMappingURL=stack.js.map