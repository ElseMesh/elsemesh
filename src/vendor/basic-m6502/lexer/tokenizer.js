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
import { TokenType, RESERVED_WORDS } from './tokens.js';
import { BasicError, ErrorCode } from '../errors/errors.js';
export class Tokenizer {
    input = '';
    position = 0;
    /**
     * Tokenize a line of BASIC source
     */
    tokenize(line) {
        this.input = line;
        this.position = 0;
        const tokens = [];
        while (this.position < this.input.length) {
            const token = this.nextToken();
            if (token) {
                tokens.push(token);
                // Special case: REM - rest of line is comment
                if (token.type === TokenType.REM) {
                    const comment = this.input.slice(this.position);
                    if (comment.length > 0) {
                        tokens.push({
                            type: TokenType.STRING,
                            value: comment,
                            position: this.position,
                        });
                    }
                    break;
                }
                // Special case: DATA - pass through until colon
                if (token.type === TokenType.DATA) {
                    const dataContent = this.readDataContent();
                    if (dataContent.length > 0) {
                        tokens.push({
                            type: TokenType.STRING,
                            value: dataContent,
                            position: this.position - dataContent.length,
                        });
                    }
                    continue;
                }
            }
        }
        tokens.push({
            type: TokenType.EOL,
            value: '',
            position: this.position,
        });
        return tokens;
    }
    /**
     * Get the next token from the input
     */
    nextToken() {
        this.skipSpaces();
        if (this.position >= this.input.length) {
            return null;
        }
        const startPos = this.position;
        const char = this.input[this.position];
        // String literal
        if (char === '"') {
            return this.readString();
        }
        // Number
        if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)))) {
            return this.readNumber();
        }
        // ? is shorthand for PRINT
        if (char === '?') {
            this.position++;
            return { type: TokenType.PRINT, value: '?', position: startPos };
        }
        // Check for reserved word (must come before identifier check)
        const reserved = this.matchReservedWord();
        if (reserved) {
            return reserved;
        }
        // Operators and punctuation
        const punct = this.matchPunctuation();
        if (punct) {
            return punct;
        }
        // Identifier (variable name)
        if (this.isAlpha(char)) {
            return this.readIdentifier();
        }
        // Unknown character - syntax error
        throw new BasicError(ErrorCode.SN);
    }
    /**
     * Match a reserved word at current position
     */
    matchReservedWord() {
        const remaining = this.input.slice(this.position).toUpperCase();
        // Try to match reserved words (sorted by length in RESERVED_WORDS)
        for (const [word, type] of RESERVED_WORDS) {
            if (remaining.startsWith(word)) {
                // Special handling for TAB( and SPC( - they include the paren
                if (word === 'TAB(' || word === 'SPC(') {
                    const token = {
                        type,
                        value: word,
                        position: this.position,
                    };
                    this.position += word.length;
                    return token;
                }
                // For other words, check that it's not followed by alphanumeric
                // (to avoid matching "TOTAL" as "TO" + "TAL")
                // Exception: Function names can be followed by (
                const nextChar = remaining[word.length];
                if (nextChar && this.isAlphanumeric(nextChar)) {
                    // This word is part of a larger identifier
                    // Exception: Some statement keywords are valid before numbers
                    // e.g., "GOTO100" should tokenize as GOTO + 100
                    if (!this.isDigit(nextChar)) {
                        continue;
                    }
                }
                const token = {
                    type,
                    value: word,
                    position: this.position,
                };
                this.position += word.length;
                return token;
            }
        }
        return null;
    }
    /**
     * Match punctuation and operators
     */
    matchPunctuation() {
        const startPos = this.position;
        const char = this.input[this.position];
        const punctMap = {
            '+': TokenType.PLUS,
            '-': TokenType.MINUS,
            '*': TokenType.TIMES,
            '/': TokenType.DIVIDE,
            '^': TokenType.POWER,
            '=': TokenType.EQ,
            '<': TokenType.LT,
            '>': TokenType.GT,
            '(': TokenType.LPAREN,
            ')': TokenType.RPAREN,
            ',': TokenType.COMMA,
            ';': TokenType.SEMICOLON,
            ':': TokenType.COLON,
        };
        if (char in punctMap) {
            this.position++;
            return {
                type: punctMap[char],
                value: char,
                position: startPos,
            };
        }
        return null;
    }
    /**
     * Read a string literal
     */
    readString() {
        const startPos = this.position;
        this.position++; // Skip opening quote
        let value = '';
        while (this.position < this.input.length) {
            const char = this.input[this.position];
            if (char === '"') {
                this.position++; // Skip closing quote
                break;
            }
            value += char;
            this.position++;
        }
        // Note: Unclosed strings are allowed in original BASIC
        return {
            type: TokenType.STRING,
            value,
            position: startPos,
        };
    }
    /**
     * Read a numeric literal
     */
    readNumber() {
        const startPos = this.position;
        let value = '';
        // Integer part
        while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
            value += this.input[this.position];
            this.position++;
        }
        // Decimal part
        if (this.position < this.input.length && this.input[this.position] === '.') {
            value += '.';
            this.position++;
            while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
                value += this.input[this.position];
                this.position++;
            }
        }
        // Exponent part
        if (this.position < this.input.length) {
            const expChar = this.input[this.position].toUpperCase();
            if (expChar === 'E') {
                value += 'E';
                this.position++;
                // Optional sign
                if (this.position < this.input.length) {
                    const signChar = this.input[this.position];
                    if (signChar === '+' || signChar === '-') {
                        value += signChar;
                        this.position++;
                    }
                }
                // Exponent digits
                while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
                    value += this.input[this.position];
                    this.position++;
                }
            }
        }
        return {
            type: TokenType.NUMBER,
            value: parseFloat(value),
            position: startPos,
        };
    }
    /**
     * Read an identifier (variable name)
     */
    readIdentifier() {
        const startPos = this.position;
        let value = '';
        // First character must be alpha
        if (this.isAlpha(this.input[this.position])) {
            value += this.input[this.position].toUpperCase();
            this.position++;
        }
        // Rest can be alphanumeric
        while (this.position < this.input.length && this.isAlphanumeric(this.input[this.position])) {
            value += this.input[this.position].toUpperCase();
            this.position++;
        }
        // Check for type suffix ($ for string, % for integer)
        if (this.position < this.input.length) {
            const suffix = this.input[this.position];
            if (suffix === '$' || suffix === '%') {
                value += suffix;
                this.position++;
            }
        }
        return {
            type: TokenType.IDENTIFIER,
            value,
            position: startPos,
        };
    }
    /**
     * Read DATA content (until colon or end of line)
     */
    readDataContent() {
        let content = '';
        let inQuotes = false;
        while (this.position < this.input.length) {
            const char = this.input[this.position];
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            if (!inQuotes && char === ':') {
                break;
            }
            content += char;
            this.position++;
        }
        return content;
    }
    /**
     * Skip whitespace (but not in strings or after REM)
     */
    skipSpaces() {
        while (this.position < this.input.length && this.input[this.position] === ' ') {
            this.position++;
        }
    }
    /**
     * Peek ahead in the input
     */
    peek(offset = 0) {
        const pos = this.position + offset;
        return pos < this.input.length ? this.input[pos] : '';
    }
    isDigit(char) {
        return char >= '0' && char <= '9';
    }
    isAlpha(char) {
        const upper = char.toUpperCase();
        return upper >= 'A' && upper <= 'Z';
    }
    isAlphanumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }
}
//# sourceMappingURL=tokenizer.js.map