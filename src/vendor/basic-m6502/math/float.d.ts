/**
 * Floating Accumulator (FAC) - The heart of BASIC expression evaluation
 *
 * Maps to FAC, FACEXP, FACSGN in m6502.asm (lines ~600-650)
 * The original used 5-byte packed floating point representation.
 * We use JavaScript's native 64-bit double precision instead.
 *
 * The FAC holds the current value during expression evaluation.
 * ARG holds the second operand during binary operations.
 */
import { BasicValue, ValueType } from '../parser/values.js';
/**
 * Floating Accumulator - holds current evaluation result
 */
export declare class FloatingAccumulator {
    private _value;
    private _valueType;
    /**
     * Get current value
     */
    get value(): BasicValue;
    /**
     * Get current value type
     */
    get valueType(): ValueType;
    /**
     * Check if FAC holds a numeric value
     */
    get isNumeric(): boolean;
    /**
     * Check if FAC holds a string value
     */
    get isString(): boolean;
    /**
     * Load a numeric value into FAC
     */
    loadNumber(value: number): void;
    /**
     * Load a string value into FAC
     */
    loadString(value: string): void;
    /**
     * Load any BasicValue into FAC
     */
    load(value: BasicValue): void;
    /**
     * Get numeric value, throwing if string
     */
    asNumber(): number;
    /**
     * Get string value, throwing if numeric
     */
    asString(): string;
    /**
     * Clear FAC to zero
     */
    clear(): void;
    /**
     * Negate numeric value in FAC
     * Maps to NEGOP in m6502.asm
     */
    negate(): void;
    /**
     * Check if FAC is zero (for conditional evaluation)
     */
    isZero(): boolean;
    /**
     * Check if FAC is truthy (non-zero for BASIC IF/THEN)
     */
    isTruthy(): boolean;
}
/**
 * Argument Register - holds second operand in binary operations
 * Maps to ARG, ARGEXP, ARGSGN in m6502.asm
 */
export declare class ArgumentRegister extends FloatingAccumulator {
}
/**
 * Singleton instances for expression evaluation
 */
export declare const FAC: FloatingAccumulator;
export declare const ARG: ArgumentRegister;
