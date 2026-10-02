/**
 * BASIC Value Types
 *
 * Maps to VALTYP in m6502.asm - the value type indicator
 * VALTYP = 0 for numeric, -1 (0xFF) for string
 */
/**
 * Value type enumeration (matches VALTYP semantics)
 */
export var ValueType;
(function (ValueType) {
    ValueType[ValueType["NUMBER"] = 0] = "NUMBER";
    ValueType[ValueType["STRING"] = 255] = "STRING";
})(ValueType || (ValueType = {}));
/**
 * Check if a value is numeric
 */
export function isNumeric(value) {
    return typeof value === 'number';
}
/**
 * Check if a value is a string
 */
export function isString(value) {
    return typeof value === 'string';
}
/**
 * Get the ValueType for a BasicValue
 */
export function getValueType(value) {
    return isNumeric(value) ? ValueType.NUMBER : ValueType.STRING;
}
/**
 * Convert a BasicValue to a number, throwing if string
 */
export function asNumber(value) {
    if (isString(value)) {
        throw new Error('Type mismatch: expected number');
    }
    return value;
}
/**
 * Convert a BasicValue to a string, throwing if number
 */
export function asString(value) {
    if (isNumeric(value)) {
        throw new Error('Type mismatch: expected string');
    }
    return value;
}
/**
 * BASIC true value (-1, all bits set)
 */
export const BASIC_TRUE = -1;
/**
 * BASIC false value (0)
 */
export const BASIC_FALSE = 0;
/**
 * Convert a JavaScript boolean to BASIC boolean
 */
export function toBasicBoolean(value) {
    return value ? BASIC_TRUE : BASIC_FALSE;
}
/**
 * Check if a BASIC numeric value is truthy (non-zero)
 */
export function isBasicTrue(value) {
    return value !== 0;
}
//# sourceMappingURL=values.js.map