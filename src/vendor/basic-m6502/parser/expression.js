/**
 * Expression Evaluator (FRMEVL equivalent)
 *
 * Maps to FRMEVL in m6502.asm (lines 3195-3290)
 * Uses precedence climbing algorithm to evaluate expressions.
 *
 * The original FRMEVL uses a recursive descent approach with:
 * - OPTAB for operator precedence and dispatch
 * - FAC for accumulating results
 * - ARG for holding second operands
 * - Stack for saving intermediate results during recursion
 */
import { TokenType, PRECEDENCE, NEGATION_PRECEDENCE, isFunction, isBinaryOperator, isRelationalOperator } from '../lexer/tokens.js';
import { isNumeric, isString, toBasicBoolean } from './values.js';
import { FloatingAccumulator } from '../math/float.js';
import { BasicError, ErrorCode } from '../errors/errors.js';
/**
 * Expression evaluator - evaluates tokenized expressions
 */
export class ExpressionEvaluator {
    tokens = [];
    position = 0;
    memory;
    memoryMap;
    fac;
    userFunctionLookup;
    constructor(memory, memoryMap) {
        this.memory = memory;
        this.memoryMap = memoryMap;
        this.fac = new FloatingAccumulator();
    }
    /**
     * Set user function lookup callback
     */
    setUserFunctionLookup(lookup) {
        this.userFunctionLookup = lookup;
    }
    /**
     * Evaluate a tokenized expression and return the result
     * Main entry point - equivalent to FRMEVL
     */
    evaluate(tokens) {
        this.tokens = tokens;
        this.position = 0;
        if (tokens.length === 0) {
            return 0;
        }
        const result = this.parseExpression(0);
        return result;
    }
    /**
     * Evaluate and ensure result is numeric
     * Equivalent to FRMNUM in m6502.asm
     */
    evaluateNumeric(tokens) {
        const result = this.evaluate(tokens);
        if (isString(result)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        return result;
    }
    /**
     * Evaluate and ensure result is a string
     * Equivalent to FRMSTR (implicit in original)
     */
    evaluateString(tokens) {
        const result = this.evaluate(tokens);
        if (isNumeric(result)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        return result;
    }
    /**
     * Get remaining tokens after evaluation (for statement parsing)
     */
    getRemainingTokens() {
        return this.tokens.slice(this.position);
    }
    /**
     * Get current position in token stream
     */
    getPosition() {
        return this.position;
    }
    // ============ Private parsing methods ============
    /**
     * Parse expression with precedence climbing
     * This is the core of FRMEVL
     */
    parseExpression(minPrecedence) {
        let left = this.parsePrimary();
        while (this.position < this.tokens.length) {
            const token = this.peek();
            if (!token || !this.isOperator(token.type)) {
                break;
            }
            const precedence = this.getPrecedence(token.type);
            if (precedence < minPrecedence) {
                break;
            }
            this.advance(); // consume operator
            const operator = token.type;
            // Handle compound relational operators (<>, <=, >=)
            let actualOp = operator;
            if (isRelationalOperator(operator)) {
                const nextToken = this.peek();
                if (nextToken && isRelationalOperator(nextToken.type)) {
                    actualOp = this.combineRelationalOps(operator, nextToken.type);
                    this.advance();
                }
            }
            // Right-associative for ^, left-associative for others
            const nextMinPrec = operator === TokenType.POWER ? precedence : precedence + 1;
            const right = this.parseExpression(nextMinPrec);
            left = this.applyBinaryOperator(actualOp, left, right);
        }
        return left;
    }
    /**
     * Parse primary expression (atoms, unary, parentheses, functions)
     * Maps to EVAL in m6502.asm (lines 3315+)
     */
    parsePrimary() {
        const token = this.peek();
        if (!token) {
            throw new BasicError(ErrorCode.SN); // Syntax Error
        }
        // Number literal
        if (token.type === TokenType.NUMBER) {
            this.advance();
            return token.value;
        }
        // String literal
        if (token.type === TokenType.STRING) {
            this.advance();
            return token.value;
        }
        // Unary minus (negation)
        if (token.type === TokenType.MINUS) {
            this.advance();
            const operand = this.parseExpression(NEGATION_PRECEDENCE);
            if (isString(operand)) {
                throw new BasicError(ErrorCode.TM); // Type Mismatch
            }
            return -operand;
        }
        // Unary plus (no-op)
        if (token.type === TokenType.PLUS) {
            this.advance();
            return this.parseExpression(NEGATION_PRECEDENCE);
        }
        // NOT operator (unary logical)
        if (token.type === TokenType.NOT) {
            this.advance();
            const operand = this.parseExpression(PRECEDENCE[TokenType.NOT]);
            if (isString(operand)) {
                throw new BasicError(ErrorCode.TM); // Type Mismatch
            }
            // NOT uses bitwise complement, then masks to 16-bit integer
            return ~Math.trunc(operand) & 0xffff;
        }
        // Parenthesized expression
        if (token.type === TokenType.LPAREN) {
            this.advance();
            const result = this.parseExpression(0);
            this.expect(TokenType.RPAREN);
            return result;
        }
        // Variable or function call
        if (token.type === TokenType.IDENTIFIER) {
            return this.parseVariable();
        }
        // User-defined function (FN)
        if (token.type === TokenType.FN) {
            return this.parseUserFunction();
        }
        // Built-in function
        if (isFunction(token.type)) {
            return this.parseFunction();
        }
        throw new BasicError(ErrorCode.SN); // Syntax Error
    }
    /**
     * Parse variable reference
     */
    parseVariable() {
        const token = this.advance();
        const name = token.value;
        // Check for array subscript
        if (this.peek()?.type === TokenType.LPAREN) {
            return this.parseArrayAccess(name);
        }
        // Simple variable
        return this.memory.getVariable(name);
    }
    /**
     * Parse array access: A(index) or A(row, col)
     */
    parseArrayAccess(name) {
        this.expect(TokenType.LPAREN);
        const indices = [];
        indices.push(this.evaluateIndex());
        while (this.peek()?.type === TokenType.COMMA) {
            this.advance();
            indices.push(this.evaluateIndex());
        }
        this.expect(TokenType.RPAREN);
        return this.memory.getArrayElement(name, indices);
    }
    /**
     * Parse user-defined function call: FN name(arg)
     */
    parseUserFunction() {
        this.advance(); // Skip FN token
        // Get function name
        const nameToken = this.peek();
        if (!nameToken || nameToken.type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        this.advance();
        const funcName = 'FN' + nameToken.value;
        // Look up the function
        if (!this.userFunctionLookup) {
            throw new BasicError(ErrorCode.UF); // Undefined Function
        }
        const funcDef = this.userFunctionLookup(funcName);
        if (!funcDef) {
            throw new BasicError(ErrorCode.UF); // Undefined Function
        }
        // Get the argument
        this.expect(TokenType.LPAREN);
        const argValue = this.parseExpression(0);
        this.expect(TokenType.RPAREN);
        // Save the current parameter value
        const oldValue = this.memory.getVariable(funcDef.paramName);
        // Set the parameter to the argument value
        this.memory.setVariable(funcDef.paramName, argValue);
        // Evaluate the function expression
        // Create a new evaluator instance to avoid state issues
        const savedTokens = this.tokens;
        const savedPosition = this.position;
        this.tokens = funcDef.exprTokens;
        this.position = 0;
        const result = this.parseExpression(0);
        this.tokens = savedTokens;
        this.position = savedPosition;
        // Restore the original parameter value
        this.memory.setVariable(funcDef.paramName, oldValue);
        return result;
    }
    /**
     * Evaluate an array index (must be numeric, converted to integer)
     */
    evaluateIndex() {
        const value = this.parseExpression(0);
        if (isString(value)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        return Math.trunc(value);
    }
    /**
     * Parse built-in function call
     */
    parseFunction() {
        const funcToken = this.advance();
        const funcType = funcToken.type;
        // Most functions require (args)
        // TAB( and SPC( already include the paren in the token
        const needsParen = funcType !== TokenType.TAB && funcType !== TokenType.SPC;
        if (needsParen) {
            this.expect(TokenType.LPAREN);
        }
        const result = this.evaluateFunction(funcType);
        if (needsParen || funcType === TokenType.TAB || funcType === TokenType.SPC) {
            this.expect(TokenType.RPAREN);
        }
        return result;
    }
    /**
     * Evaluate a specific built-in function
     * Maps to FUNDSP dispatch table in m6502.asm (lines 1054-1082)
     */
    evaluateFunction(funcType) {
        switch (funcType) {
            // Numeric functions (single argument)
            case TokenType.ABS:
                return Math.abs(this.getNumericArg());
            case TokenType.INT:
                return Math.floor(this.getNumericArg());
            case TokenType.SGN: {
                const n = this.getNumericArg();
                return n > 0 ? 1 : n < 0 ? -1 : 0;
            }
            case TokenType.SQR: {
                const n = this.getNumericArg();
                if (n < 0)
                    throw new BasicError(ErrorCode.FC); // Illegal Quantity
                return Math.sqrt(n);
            }
            case TokenType.RND: {
                const n = this.getNumericArg();
                // RND(0) repeats last, RND(negative) seeds, RND(positive) next random
                // For simplicity, always return random 0-1
                return Math.random();
            }
            case TokenType.LOG: {
                const n = this.getNumericArg();
                if (n <= 0)
                    throw new BasicError(ErrorCode.FC); // Illegal Quantity
                return Math.log(n);
            }
            case TokenType.EXP:
                return Math.exp(this.getNumericArg());
            case TokenType.SIN:
                return Math.sin(this.getNumericArg());
            case TokenType.COS:
                return Math.cos(this.getNumericArg());
            case TokenType.TAN:
                return Math.tan(this.getNumericArg());
            case TokenType.ATN:
                return Math.atan(this.getNumericArg());
            case TokenType.PEEK: {
                const addr = Math.trunc(this.getNumericArg());
                return this.memoryMap.peek(addr);
            }
            // String functions
            case TokenType.LEN:
                return this.getStringArg().length;
            case TokenType.ASC: {
                const s = this.getStringArg();
                if (s.length === 0)
                    throw new BasicError(ErrorCode.FC); // Illegal Quantity
                return s.charCodeAt(0);
            }
            case TokenType.VAL: {
                const s = this.getStringArg();
                const n = parseFloat(s);
                return isNaN(n) ? 0 : n;
            }
            case TokenType.CHR: {
                const n = Math.trunc(this.getNumericArg());
                if (n < 0 || n > 255)
                    throw new BasicError(ErrorCode.FC); // Illegal Quantity
                return String.fromCharCode(n);
            }
            case TokenType.STR: {
                const n = this.getNumericArg();
                // Leading space for positive numbers, no space for negative
                return n >= 0 ? ' ' + n.toString() : n.toString();
            }
            // Multi-argument string functions
            case TokenType.LEFT:
                return this.evalLeft();
            case TokenType.RIGHT:
                return this.evalRight();
            case TokenType.MID:
                return this.evalMid();
            // Special functions
            case TokenType.TAB:
            case TokenType.SPC:
                // These are handled specially in PRINT, return spaces for now
                return ' '.repeat(Math.max(0, Math.trunc(this.getNumericArg())));
            case TokenType.FRE:
                this.parseExpression(0); // Consume argument
                return 32768; // Fake available memory
            case TokenType.POS:
                this.parseExpression(0); // Consume dummy argument
                return 0; // Current cursor position - TODO: implement
            case TokenType.USR:
                throw new BasicError(ErrorCode.FC); // Illegal Quantity (USR not implemented)
            default:
                throw new BasicError(ErrorCode.SN); // Syntax Error
        }
    }
    // ============ Multi-argument string functions ============
    evalLeft() {
        const str = this.getStringArg();
        this.expect(TokenType.COMMA);
        const n = Math.trunc(this.getNumericArg());
        if (n < 0)
            throw new BasicError(ErrorCode.FC); // Illegal Quantity
        return str.substring(0, n);
    }
    evalRight() {
        const str = this.getStringArg();
        this.expect(TokenType.COMMA);
        const n = Math.trunc(this.getNumericArg());
        if (n < 0)
            throw new BasicError(ErrorCode.FC); // Illegal Quantity
        return str.substring(Math.max(0, str.length - n));
    }
    evalMid() {
        const str = this.getStringArg();
        this.expect(TokenType.COMMA);
        const start = Math.trunc(this.getNumericArg());
        if (start < 1)
            throw new BasicError(ErrorCode.FC); // Illegal Quantity
        let length = str.length;
        if (this.peek()?.type === TokenType.COMMA) {
            this.advance();
            length = Math.trunc(this.getNumericArg());
            if (length < 0)
                throw new BasicError(ErrorCode.FC); // Illegal Quantity
        }
        return str.substring(start - 1, start - 1 + length);
    }
    // ============ Helper methods ============
    getNumericArg() {
        const value = this.parseExpression(0);
        if (isString(value)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        return value;
    }
    getStringArg() {
        const value = this.parseExpression(0);
        if (isNumeric(value)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        return value;
    }
    /**
     * Apply a binary operator to two operands
     */
    applyBinaryOperator(op, left, right) {
        // String concatenation
        if (op === TokenType.PLUS && (isString(left) || isString(right))) {
            if (isString(left) && isString(right)) {
                return left + right;
            }
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        // String comparison (single or compound relational operators)
        if (isString(left) && isString(right)) {
            // Single relational operators
            if (op === TokenType.LT || op === TokenType.GT || op === TokenType.EQ) {
                const cmp = left.localeCompare(right);
                if (op === TokenType.LT)
                    return toBasicBoolean(cmp < 0);
                if (op === TokenType.GT)
                    return toBasicBoolean(cmp > 0);
                return toBasicBoolean(cmp === 0); // EQ
            }
            // Compound relational operators
            if (typeof op === 'string' && op.startsWith('REL_')) {
                return this.compareStrings(op, left, right);
            }
            throw new BasicError(ErrorCode.TM); // Type Mismatch - non-relational op on strings
        }
        // All other operators require numeric operands
        if (isString(left) || isString(right)) {
            throw new BasicError(ErrorCode.TM); // Type Mismatch
        }
        const l = left;
        const r = right;
        switch (op) {
            case TokenType.PLUS:
                return l + r;
            case TokenType.MINUS:
                return l - r;
            case TokenType.TIMES:
                return l * r;
            case TokenType.DIVIDE:
                if (r === 0)
                    throw new BasicError(ErrorCode.DZ); // Division by Zero
                return l / r;
            case TokenType.POWER:
                return Math.pow(l, r);
            // Logical operators (work on integers)
            case TokenType.AND:
                return (Math.trunc(l) & Math.trunc(r)) | 0;
            case TokenType.OR:
                return (Math.trunc(l) | Math.trunc(r)) | 0;
            // Relational operators
            case TokenType.LT:
                return toBasicBoolean(l < r);
            case TokenType.GT:
                return toBasicBoolean(l > r);
            case TokenType.EQ:
                return toBasicBoolean(l === r);
            // Compound relational operators
            case 'REL_LE': // <=
                return toBasicBoolean(l <= r);
            case 'REL_GE': // >=
                return toBasicBoolean(l >= r);
            case 'REL_NE': // <>
                return toBasicBoolean(l !== r);
            default:
                throw new BasicError(ErrorCode.SN); // Syntax Error
        }
    }
    /**
     * Compare two strings
     */
    compareStrings(op, left, right) {
        const cmp = left.localeCompare(right);
        switch (op) {
            case 'REL_LT':
                return toBasicBoolean(cmp < 0);
            case 'REL_GT':
                return toBasicBoolean(cmp > 0);
            case 'REL_EQ':
                return toBasicBoolean(cmp === 0);
            case 'REL_LE':
                return toBasicBoolean(cmp <= 0);
            case 'REL_GE':
                return toBasicBoolean(cmp >= 0);
            case 'REL_NE':
                return toBasicBoolean(cmp !== 0);
            default:
                throw new BasicError(ErrorCode.SN); // Syntax Error
        }
    }
    /**
     * Combine two relational operators into compound operator
     */
    combineRelationalOps(first, second) {
        if (first === TokenType.LT && second === TokenType.GT)
            return 'REL_NE'; // <>
        if (first === TokenType.GT && second === TokenType.LT)
            return 'REL_NE'; // ><
        if (first === TokenType.LT && second === TokenType.EQ)
            return 'REL_LE'; // <=
        if (first === TokenType.EQ && second === TokenType.LT)
            return 'REL_LE'; // =<
        if (first === TokenType.GT && second === TokenType.EQ)
            return 'REL_GE'; // >=
        if (first === TokenType.EQ && second === TokenType.GT)
            return 'REL_GE'; // =>
        throw new BasicError(ErrorCode.SN); // Syntax Error
    }
    /**
     * Check if token type is an operator
     */
    isOperator(type) {
        return isBinaryOperator(type);
    }
    /**
     * Get precedence for an operator token
     */
    getPrecedence(type) {
        return PRECEDENCE[type] || 0;
    }
    /**
     * Peek at current token without advancing
     */
    peek() {
        return this.tokens[this.position];
    }
    /**
     * Advance to next token and return current
     */
    advance() {
        return this.tokens[this.position++];
    }
    /**
     * Expect a specific token type, throw if not found
     */
    expect(type) {
        const token = this.peek();
        if (!token || token.type !== type) {
            throw new BasicError(ErrorCode.SN); // Syntax Error
        }
        return this.advance();
    }
}
//# sourceMappingURL=expression.js.map