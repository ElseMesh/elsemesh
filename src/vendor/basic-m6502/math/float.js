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
import { ValueType, getValueType } from '../parser/values.js';
/**
 * Floating Accumulator - holds current evaluation result
 */
export class FloatingAccumulator {
    _value = 0;
    _valueType = ValueType.NUMBER;
    /**
     * Get current value
     */
    get value() {
        return this._value;
    }
    /**
     * Get current value type
     */
    get valueType() {
        return this._valueType;
    }
    /**
     * Check if FAC holds a numeric value
     */
    get isNumeric() {
        return this._valueType === ValueType.NUMBER;
    }
    /**
     * Check if FAC holds a string value
     */
    get isString() {
        return this._valueType === ValueType.STRING;
    }
    /**
     * Load a numeric value into FAC
     */
    loadNumber(value) {
        this._value = value;
        this._valueType = ValueType.NUMBER;
    }
    /**
     * Load a string value into FAC
     */
    loadString(value) {
        this._value = value;
        this._valueType = ValueType.STRING;
    }
    /**
     * Load any BasicValue into FAC
     */
    load(value) {
        this._value = value;
        this._valueType = getValueType(value);
    }
    /**
     * Get numeric value, throwing if string
     */
    asNumber() {
        if (this.isString) {
            throw new Error('Type mismatch: expected number');
        }
        return this._value;
    }
    /**
     * Get string value, throwing if numeric
     */
    asString() {
        if (this.isNumeric) {
            throw new Error('Type mismatch: expected string');
        }
        return this._value;
    }
    /**
     * Clear FAC to zero
     */
    clear() {
        this._value = 0;
        this._valueType = ValueType.NUMBER;
    }
    /**
     * Negate numeric value in FAC
     * Maps to NEGOP in m6502.asm
     */
    negate() {
        if (this.isString) {
            throw new Error('Type mismatch: cannot negate string');
        }
        this._value = -this._value;
    }
    /**
     * Check if FAC is zero (for conditional evaluation)
     */
    isZero() {
        if (this.isNumeric) {
            return this._value === 0;
        }
        return this._value.length === 0;
    }
    /**
     * Check if FAC is truthy (non-zero for BASIC IF/THEN)
     */
    isTruthy() {
        if (this.isNumeric) {
            return this._value !== 0;
        }
        // Strings in boolean context - non-empty is truthy
        return this._value.length > 0;
    }
}
/**
 * Argument Register - holds second operand in binary operations
 * Maps to ARG, ARGEXP, ARGSGN in m6502.asm
 */
export class ArgumentRegister extends FloatingAccumulator {
}
/**
 * Singleton instances for expression evaluation
 */
export const FAC = new FloatingAccumulator();
export const ARG = new ArgumentRegister();
//# sourceMappingURL=float.js.map