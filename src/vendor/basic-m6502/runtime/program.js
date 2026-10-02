/**
 * Program storage - line number management and program text
 * Maps to TXTTAB structure in original (lines 284-320 in m6502.asm)
 */
import { Tokenizer } from '../lexer/index.js';
import { MEMORY_LIMITS } from '../config.js';
import { BasicError, ErrorCode } from '../errors/errors.js';
/**
 * Program storage and management
 */
export class Program {
    lines = new Map();
    sortedLineNumbers = [];
    tokenizer = new Tokenizer();
    /**
     * Add or replace a program line
     */
    addLine(lineNumber, text) {
        if (lineNumber < 0 || lineNumber > MEMORY_LIMITS.maxLineNumber) {
            throw new BasicError(ErrorCode.FC); // Illegal quantity (line number out of range)
        }
        // Empty text deletes the line
        if (text.trim() === '') {
            this.deleteLine(lineNumber);
            return;
        }
        // Tokenize the line
        const tokens = this.tokenizer.tokenize(text);
        const line = {
            lineNumber,
            tokens,
            raw: text,
        };
        this.lines.set(lineNumber, line);
        this.updateSortedLineNumbers();
    }
    /**
     * Delete a program line
     */
    deleteLine(lineNumber) {
        const deleted = this.lines.delete(lineNumber);
        if (deleted) {
            this.updateSortedLineNumbers();
        }
        return deleted;
    }
    /**
     * Get a line by number
     */
    getLine(lineNumber) {
        return this.lines.get(lineNumber);
    }
    /**
     * Get the first line of the program
     */
    getFirstLine() {
        if (this.sortedLineNumbers.length === 0) {
            return undefined;
        }
        return this.lines.get(this.sortedLineNumbers[0]);
    }
    /**
     * Get the next line after the given line number
     */
    getNextLine(afterLineNumber) {
        const index = this.sortedLineNumbers.findIndex((n) => n > afterLineNumber);
        if (index === -1) {
            return undefined;
        }
        return this.lines.get(this.sortedLineNumbers[index]);
    }
    /**
     * Find a line by number (for GOTO)
     */
    findLine(lineNumber) {
        return this.lines.get(lineNumber) ?? null;
    }
    /**
     * Get all line numbers in sorted order
     */
    getLineNumbers() {
        return [...this.sortedLineNumbers];
    }
    /**
     * List program lines (for LIST command)
     */
    list(start, end) {
        const result = [];
        for (const lineNum of this.sortedLineNumbers) {
            if (start !== undefined && lineNum < start)
                continue;
            if (end !== undefined && lineNum > end)
                break;
            const line = this.lines.get(lineNum);
            if (line) {
                result.push(`${line.lineNumber} ${line.raw}`);
            }
        }
        return result;
    }
    /**
     * Clear all program lines (NEW command)
     */
    clear() {
        this.lines.clear();
        this.sortedLineNumbers = [];
    }
    /**
     * Check if program is empty
     */
    isEmpty() {
        return this.lines.size === 0;
    }
    /**
     * Get the number of lines
     */
    get lineCount() {
        return this.lines.size;
    }
    /**
     * Update sorted line numbers array
     */
    updateSortedLineNumbers() {
        this.sortedLineNumbers = [...this.lines.keys()].sort((a, b) => a - b);
    }
}
//# sourceMappingURL=program.js.map