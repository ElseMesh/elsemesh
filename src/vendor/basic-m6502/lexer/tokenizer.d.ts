/**
 * Tokenizer - CRUNCH equivalent (lines 2550-2700 in m6502.asm)
 *
 * Converts BASIC source text into tokens.
 *
 * Key behaviors from original:
 * 1. Reserved words are matched from RESLST
 * 2. Quoted strings are passed through unchanged
 * 3. REM passes everything to end of line unchanged
 * 4. DATA passes through until colon or end of line
 * 5. Reserved word matching is case-insensitive
 *
 * DANGER: Reserved word collision (documented in m6502.asm lines 1209-1215)
 * - "TO" inside variable names will be tokenized
 * - "FOR" inside "FORMULA" will be tokenized
 */
import { Token } from './tokens.js';
export declare class Tokenizer {
    private input;
    private position;
    /**
     * Tokenize a line of BASIC source
     */
    tokenize(line: string): Token[];
    /**
     * Get the next token from the input
     */
    private nextToken;
    /**
     * Match a reserved word at current position
     */
    private matchReservedWord;
    /**
     * Match punctuation and operators
     */
    private matchPunctuation;
    /**
     * Read a string literal
     */
    private readString;
    /**
     * Read a numeric literal
     */
    private readNumber;
    /**
     * Read an identifier (variable name)
     */
    private readIdentifier;
    /**
     * Read DATA content (until colon or end of line)
     */
    private readDataContent;
    /**
     * Skip whitespace (but not in strings or after REM)
     */
    private skipSpaces;
    /**
     * Peek ahead in the input
     */
    private peek;
    private isDigit;
    private isAlpha;
    private isAlphanumeric;
}
