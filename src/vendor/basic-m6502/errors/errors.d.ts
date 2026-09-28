/**
 * Error definitions matching original ERRTAB (lines 1251-1340 in m6502.asm)
 *
 * Short codes used when LNGERR=0 (Apple II configuration)
 * Long messages shown here for reference
 */
export declare enum ErrorCode {
    NF = "NF",// NEXT WITHOUT FOR
    SN = "SN",// SYNTAX ERROR
    RG = "RG",// RETURN WITHOUT GOSUB
    OD = "OD",// OUT OF DATA
    FC = "FC",// ILLEGAL QUANTITY (Function Call error)
    OV = "OV",// OVERFLOW
    OM = "OM",// OUT OF MEMORY
    US = "US",// UNDEFINED STATEMENT
    BS = "BS",// BAD SUBSCRIPT
    DD = "DD",// REDIMENSIONED ARRAY
    DZ = "DZ",// DIVISION BY ZERO ("/0" in original)
    ID = "ID",// ILLEGAL DIRECT
    TM = "TM",// TYPE MISMATCH
    LS = "LS",// STRING TOO LONG
    ST = "ST",// FORMULA TOO COMPLEX (String temporaries exhausted)
    CN = "CN",// CAN'T CONTINUE
    UF = "UF"
}
/**
 * Long error messages (used when LNGERR=1, not for Apple II default)
 */
export declare const ERROR_MESSAGES: Record<ErrorCode, string>;
/**
 * BASIC runtime error
 */
export declare class BasicError extends Error {
    readonly code: ErrorCode;
    lineNumber?: number;
    constructor(code: ErrorCode, lineNumber?: number);
    /**
     * Format error for display (matches original output format)
     */
    toString(): string;
}
/**
 * Break/stop error (Ctrl-C or STOP statement)
 */
export declare class BreakError extends Error {
    readonly lineNumber?: number | undefined;
    constructor(lineNumber?: number | undefined);
}
