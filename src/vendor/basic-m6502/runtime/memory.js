/**
 * Variable storage matching VARTAB structure
 * (lines 285-290, 4575-4700 in m6502.asm)
 */
import { BasicError, ErrorCode } from '../errors/index.js';
import { MEMORY_LIMITS, CONFIG } from '../config.js';
/**
 * Determine variable type from name
 */
export function getVariableType(name) {
    if (name.endsWith('$')) {
        return 'string';
    }
    if (name.endsWith('%') && CONFIG.integerArrays) {
        return 'integer';
    }
    return 'number';
}
/**
 * Get the significant part of a variable name
 * Original BASIC only uses first 2 characters
 */
export function getSignificantName(name) {
    // Keep the type suffix
    let suffix = '';
    let baseName = name;
    if (name.endsWith('$') || name.endsWith('%')) {
        suffix = name.slice(-1);
        baseName = name.slice(0, -1);
    }
    // Only first 2 characters are significant
    const significant = baseName.slice(0, MEMORY_LIMITS.significantNameChars);
    return significant + suffix;
}
/**
 * Memory manager for variables and arrays
 */
export class MemoryManager {
    variables = new Map();
    arrays = new Map();
    /**
     * Get a variable value
     */
    getVariable(name) {
        const sigName = getSignificantName(name);
        const variable = this.variables.get(sigName);
        if (variable) {
            return variable.value;
        }
        // Auto-create with default value
        const type = getVariableType(name);
        const defaultValue = type === 'string' ? '' : 0;
        this.setVariable(name, defaultValue);
        return defaultValue;
    }
    /**
     * Set a variable value
     */
    setVariable(name, value) {
        const sigName = getSignificantName(name);
        const type = getVariableType(name);
        // Type checking
        if (type === 'string' && typeof value !== 'string') {
            throw new BasicError(ErrorCode.TM);
        }
        if (type !== 'string' && typeof value !== 'number') {
            throw new BasicError(ErrorCode.TM);
        }
        // Integer truncation
        let storedValue = value;
        if (type === 'integer' && typeof value === 'number') {
            storedValue = Math.trunc(value);
        }
        this.variables.set(sigName, {
            name: sigName,
            type,
            value: storedValue,
        });
    }
    /**
     * Check if a variable exists
     */
    hasVariable(name) {
        const sigName = getSignificantName(name);
        return this.variables.has(sigName);
    }
    /**
     * Dimension an array (DIM statement)
     */
    dimArray(name, dimensions) {
        const sigName = getSignificantName(name);
        const type = getVariableType(name);
        // Check if already dimensioned
        if (this.arrays.has(sigName)) {
            throw new BasicError(ErrorCode.DD); // Redimensioned array
        }
        // Validate dimensions
        for (const dim of dimensions) {
            if (dim < 0 || dim > MEMORY_LIMITS.maxDimensions) {
                throw new BasicError(ErrorCode.BS); // Bad subscript
            }
        }
        // Calculate total size (dimensions are 0-based, so add 1 to each)
        const sizes = dimensions.map((d) => d + 1);
        const totalSize = sizes.reduce((a, b) => a * b, 1);
        // Initialize array with default values
        const defaultValue = type === 'string' ? '' : 0;
        const data = new Array(totalSize).fill(defaultValue);
        this.arrays.set(sigName, {
            name: sigName,
            type,
            dimensions: sizes,
            data,
        });
    }
    /**
     * Get an array element
     */
    getArrayElement(name, indices) {
        const sigName = getSignificantName(name);
        let array = this.arrays.get(sigName);
        // Auto-dimension with default size 10 if not exists
        if (!array) {
            const defaultDimensions = indices.map(() => 10);
            this.dimArray(name, defaultDimensions);
            array = this.arrays.get(sigName);
        }
        const index = this.calculateArrayIndex(array, indices);
        return array.data[index];
    }
    /**
     * Set an array element
     */
    setArrayElement(name, indices, value) {
        const sigName = getSignificantName(name);
        let array = this.arrays.get(sigName);
        // Auto-dimension with default size 10 if not exists
        if (!array) {
            const defaultDimensions = indices.map(() => 10);
            this.dimArray(name, defaultDimensions);
            array = this.arrays.get(sigName);
        }
        // Type checking
        if (array.type === 'string' && typeof value !== 'string') {
            throw new BasicError(ErrorCode.TM);
        }
        if (array.type !== 'string' && typeof value !== 'number') {
            throw new BasicError(ErrorCode.TM);
        }
        const index = this.calculateArrayIndex(array, indices);
        // Integer truncation
        let storedValue = value;
        if (array.type === 'integer' && typeof value === 'number') {
            storedValue = Math.trunc(value);
        }
        array.data[index] = storedValue;
    }
    /**
     * Calculate linear index from multi-dimensional indices
     */
    calculateArrayIndex(array, indices) {
        // Validate number of dimensions
        if (indices.length !== array.dimensions.length) {
            throw new BasicError(ErrorCode.BS);
        }
        // Validate each index is within bounds
        for (let i = 0; i < indices.length; i++) {
            if (indices[i] < 0 || indices[i] >= array.dimensions[i]) {
                throw new BasicError(ErrorCode.BS);
            }
        }
        // Calculate linear index (row-major order)
        let index = 0;
        let multiplier = 1;
        for (let i = indices.length - 1; i >= 0; i--) {
            index += indices[i] * multiplier;
            multiplier *= array.dimensions[i];
        }
        return index;
    }
    /**
     * Clear all variables and arrays (CLR/NEW command)
     */
    clear() {
        this.variables.clear();
        this.arrays.clear();
    }
    /**
     * Get all variable names (for debugging)
     */
    getVariableNames() {
        return [...this.variables.keys()];
    }
    /**
     * Get all array names (for debugging)
     */
    getArrayNames() {
        return [...this.arrays.keys()];
    }
}
//# sourceMappingURL=memory.js.map