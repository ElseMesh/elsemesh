/**
 * Apple II configuration based on original assembly flags
 * (REALIO=4, lines 10-30, 99-109 in m6502.asm)
 */
export interface BasicConfig {
    integerArrays: boolean;
    additionalPrecision: boolean;
    longErrorMessages: boolean;
    timeSupport: boolean;
    diskCommands: boolean;
    extendedIO: boolean;
    nullCommand: boolean;
    getCommand: boolean;
    lineLength: number;
    bufferLength: number;
    columnWidth: number;
    numStringTemps: number;
    stringDescSize: number;
    forEntrySize: number;
    numStackLevels: number;
    platform: 'apple2' | 'pet' | 'osi' | 'kim' | 'simulator';
}
/**
 * Apple II configuration (REALIO=4)
 * All values verified against m6502.asm source
 */
export declare const APPLE2_CONFIG: Readonly<BasicConfig>;
/**
 * Default configuration (Apple II)
 */
export declare const CONFIG: Readonly<BasicConfig>;
/**
 * Floating-point constants
 */
export declare const FLOAT_CONFIG: {
    mantissaBytes: number;
    maxDigits: number;
    minExponent: number;
    maxExponent: number;
};
/**
 * Memory limits
 */
export declare const MEMORY_LIMITS: {
    maxLineNumber: number;
    maxStringLength: number;
    maxDimensions: number;
    significantNameChars: number;
};
/**
 * True/False values for relational operators
 * Original BASIC uses -1 for TRUE, 0 for FALSE
 */
export declare const BASIC_TRUE = -1;
export declare const BASIC_FALSE = 0;
