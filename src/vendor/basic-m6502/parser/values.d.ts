/**
 * BASIC Value Types
 *
 * Maps to VALTYP in m6502.asm - the value type indicator
 * VALTYP = 0 for numeric, -1 (0xFF) for string
 */
/**
 * A BASIC value can be either a number or a string
 */
export type BasicValue = number | string;
/**
 * Value type enumeration (matches VALTYP semantics)
 */
export declare enum ValueType {
    NUMBER = 0,
    STRING = 255
}
/**
 * Check if a value is numeric
 */
export declare function isNumeric(value: BasicValue): value is number;
/**
 * Check if a value is a string
 */
export declare function isString(value: BasicValue): value is string;
/**
 * Get the ValueType for a BasicValue
 */
export declare function getValueType(value: BasicValue): ValueType;
/**
 * Convert a BasicValue to a number, throwing if string
 */
export declare function asNumber(value: BasicValue): number;
/**
 * Convert a BasicValue to a string, throwing if number
 */
export declare function asString(value: BasicValue): string;
/**
 * BASIC true value (-1, all bits set)
 */
export declare const BASIC_TRUE = -1;
/**
 * BASIC false value (0)
 */
export declare const BASIC_FALSE = 0;
/**
 * Convert a JavaScript boolean to BASIC boolean
 */
export declare function toBasicBoolean(value: boolean): number;
/**
 * Check if a BASIC numeric value is truthy (non-zero)
 */
export declare function isBasicTrue(value: number): boolean;
