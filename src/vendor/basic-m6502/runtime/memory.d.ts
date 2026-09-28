/**
 * Variable storage matching VARTAB structure
 * (lines 285-290, 4575-4700 in m6502.asm)
 */
export type BasicValue = number | string;
/**
 * Variable types
 */
export type VariableType = 'number' | 'string' | 'integer';
/**
 * Determine variable type from name
 */
export declare function getVariableType(name: string): VariableType;
/**
 * Get the significant part of a variable name
 * Original BASIC only uses first 2 characters
 */
export declare function getSignificantName(name: string): string;
/**
 * Simple variable
 */
export interface Variable {
    name: string;
    type: VariableType;
    value: BasicValue;
}
/**
 * Array variable
 */
export interface ArrayVariable {
    name: string;
    type: VariableType;
    dimensions: number[];
    data: BasicValue[];
}
/**
 * Memory manager for variables and arrays
 */
export declare class MemoryManager {
    private variables;
    private arrays;
    /**
     * Get a variable value
     */
    getVariable(name: string): BasicValue;
    /**
     * Set a variable value
     */
    setVariable(name: string, value: BasicValue): void;
    /**
     * Check if a variable exists
     */
    hasVariable(name: string): boolean;
    /**
     * Dimension an array (DIM statement)
     */
    dimArray(name: string, dimensions: number[]): void;
    /**
     * Get an array element
     */
    getArrayElement(name: string, indices: number[]): BasicValue;
    /**
     * Set an array element
     */
    setArrayElement(name: string, indices: number[], value: BasicValue): void;
    /**
     * Calculate linear index from multi-dimensional indices
     */
    private calculateArrayIndex;
    /**
     * Clear all variables and arrays (CLR/NEW command)
     */
    clear(): void;
    /**
     * Get all variable names (for debugging)
     */
    getVariableNames(): string[];
    /**
     * Get all array names (for debugging)
     */
    getArrayNames(): string[];
}
