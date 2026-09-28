/**
 * Program storage - line number management and program text
 * Maps to TXTTAB structure in original (lines 284-320 in m6502.asm)
 */
import { Token } from '../lexer/index.js';
/**
 * Program line storage
 */
export interface ProgramLine {
    lineNumber: number;
    tokens: Token[];
    raw: string;
}
/**
 * Program storage and management
 */
export declare class Program {
    private lines;
    private sortedLineNumbers;
    private tokenizer;
    /**
     * Add or replace a program line
     */
    addLine(lineNumber: number, text: string): void;
    /**
     * Delete a program line
     */
    deleteLine(lineNumber: number): boolean;
    /**
     * Get a line by number
     */
    getLine(lineNumber: number): ProgramLine | undefined;
    /**
     * Get the first line of the program
     */
    getFirstLine(): ProgramLine | undefined;
    /**
     * Get the next line after the given line number
     */
    getNextLine(afterLineNumber: number): ProgramLine | undefined;
    /**
     * Find a line by number (for GOTO)
     */
    findLine(lineNumber: number): ProgramLine | null;
    /**
     * Get all line numbers in sorted order
     */
    getLineNumbers(): number[];
    /**
     * List program lines (for LIST command)
     */
    list(start?: number, end?: number): string[];
    /**
     * Clear all program lines (NEW command)
     */
    clear(): void;
    /**
     * Check if program is empty
     */
    isEmpty(): boolean;
    /**
     * Get the number of lines
     */
    get lineCount(): number;
    /**
     * Update sorted line numbers array
     */
    private updateSortedLineNumbers;
}
