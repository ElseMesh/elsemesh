/**
 * Apple II configuration based on original assembly flags
 * (REALIO=4, lines 10-30, 99-109 in m6502.asm)
 */
/**
 * Apple II configuration (REALIO=4)
 * All values verified against m6502.asm source
 */
export const APPLE2_CONFIG = {
    // Feature flags (lines 99-109)
    integerArrays: true, // INTPRC==1 (line 16)
    additionalPrecision: true, // ADDPRC==1 (line 17)
    longErrorMessages: false, // LNGERR==0 (line 18)
    timeSupport: false, // TIME==0 (line 19)
    diskCommands: false, // DISKO==0 (not set for REALIO=4)
    extendedIO: false, // EXTIO==0 (line 20)
    nullCommand: false, // NULCMD==0 (line 100)
    getCommand: true, // GETCMD==1 (line 101)
    // Memory & display (lines 104-109)
    lineLength: 40, // LINLEN==40
    bufferLength: 240, // BUFLEN==240
    columnWidth: 14, // CLMWID==14 (line 26)
    numStringTemps: 3, // NUMTMP==3 (line 241)
    stringDescSize: 3, // STRSIZ==3 (line 240)
    forEntrySize: 18, // FORSIZ==2*ADDPRC+16 = 18 (line 1370)
    numStackLevels: 23, // NUMLEV==23 (line 238)
    platform: 'apple2',
};
/**
 * Default configuration (Apple II)
 */
export const CONFIG = APPLE2_CONFIG;
/**
 * Floating-point constants
 */
export const FLOAT_CONFIG = {
    // Mantissa bytes: 4 base + ADDPRC additional
    mantissaBytes: 4 + (APPLE2_CONFIG.additionalPrecision ? 1 : 0),
    // Maximum significant digits
    maxDigits: APPLE2_CONFIG.additionalPrecision ? 9 : 6,
    // Exponent range (approximate)
    minExponent: -38,
    maxExponent: 38,
};
/**
 * Memory limits
 */
export const MEMORY_LIMITS = {
    // Maximum line number
    maxLineNumber: 63999,
    // Maximum string length
    maxStringLength: 255,
    // Maximum array dimensions
    maxDimensions: 255,
    // Maximum variable name length (only first 2 chars significant in original)
    significantNameChars: 2,
};
/**
 * True/False values for relational operators
 * Original BASIC uses -1 for TRUE, 0 for FALSE
 */
export const BASIC_TRUE = -1;
export const BASIC_FALSE = 0;
//# sourceMappingURL=config.js.map