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
import { Token } from '../lexer/tokens.js';
import { BasicValue } from './values.js';
import { MemoryManager } from '../runtime/memory.js';
import { MemoryMap } from '../runtime/memory-map.js';
/**
 * User function definition for DEF FN
 */
export interface UserFunctionDef {
    paramName: string;
    exprTokens: Token[];
}
/**
 * Callback type for looking up user-defined functions
 */
export type UserFunctionLookup = (name: string) => UserFunctionDef | undefined;
/**
 * Expression evaluator - evaluates tokenized expressions
 */
export declare class ExpressionEvaluator {
    private tokens;
    private position;
    private memory;
    private memoryMap;
    private fac;
    private userFunctionLookup?;
    constructor(memory: MemoryManager, memoryMap: MemoryMap);
    /**
     * Set user function lookup callback
     */
    setUserFunctionLookup(lookup: UserFunctionLookup): void;
    /**
     * Evaluate a tokenized expression and return the result
     * Main entry point - equivalent to FRMEVL
     */
    evaluate(tokens: Token[]): BasicValue;
    /**
     * Evaluate and ensure result is numeric
     * Equivalent to FRMNUM in m6502.asm
     */
    evaluateNumeric(tokens: Token[]): number;
    /**
     * Evaluate and ensure result is a string
     * Equivalent to FRMSTR (implicit in original)
     */
    evaluateString(tokens: Token[]): string;
    /**
     * Get remaining tokens after evaluation (for statement parsing)
     */
    getRemainingTokens(): Token[];
    /**
     * Get current position in token stream
     */
    getPosition(): number;
    /**
     * Parse expression with precedence climbing
     * This is the core of FRMEVL
     */
    private parseExpression;
    /**
     * Parse primary expression (atoms, unary, parentheses, functions)
     * Maps to EVAL in m6502.asm (lines 3315+)
     */
    private parsePrimary;
    /**
     * Parse variable reference
     */
    private parseVariable;
    /**
     * Parse array access: A(index) or A(row, col)
     */
    private parseArrayAccess;
    /**
     * Parse user-defined function call: FN name(arg)
     */
    private parseUserFunction;
    /**
     * Evaluate an array index (must be numeric, converted to integer)
     */
    private evaluateIndex;
    /**
     * Parse built-in function call
     */
    private parseFunction;
    /**
     * Evaluate a specific built-in function
     * Maps to FUNDSP dispatch table in m6502.asm (lines 1054-1082)
     */
    private evaluateFunction;
    private evalLeft;
    private evalRight;
    private evalMid;
    private getNumericArg;
    private getStringArg;
    /**
     * Apply a binary operator to two operands
     */
    private applyBinaryOperator;
    /**
     * Compare two strings
     */
    private compareStrings;
    /**
     * Combine two relational operators into compound operator
     */
    private combineRelationalOps;
    /**
     * Check if token type is an operator
     */
    private isOperator;
    /**
     * Get precedence for an operator token
     */
    private getPrecedence;
    /**
     * Peek at current token without advancing
     */
    private peek;
    /**
     * Advance to next token and return current
     */
    private advance;
    /**
     * Expect a specific token type, throw if not found
     */
    private expect;
}
