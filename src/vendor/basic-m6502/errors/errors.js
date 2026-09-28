/**
 * Error definitions matching original ERRTAB (lines 1251-1340 in m6502.asm)
 *
 * Short codes used when LNGERR=0 (Apple II configuration)
 * Long messages shown here for reference
 */
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["NF"] = "NF";
    ErrorCode["SN"] = "SN";
    ErrorCode["RG"] = "RG";
    ErrorCode["OD"] = "OD";
    ErrorCode["FC"] = "FC";
    ErrorCode["OV"] = "OV";
    ErrorCode["OM"] = "OM";
    ErrorCode["US"] = "US";
    ErrorCode["BS"] = "BS";
    ErrorCode["DD"] = "DD";
    ErrorCode["DZ"] = "DZ";
    ErrorCode["ID"] = "ID";
    ErrorCode["TM"] = "TM";
    ErrorCode["LS"] = "LS";
    ErrorCode["ST"] = "ST";
    ErrorCode["CN"] = "CN";
    ErrorCode["UF"] = "UF";
})(ErrorCode || (ErrorCode = {}));
/**
 * Long error messages (used when LNGERR=1, not for Apple II default)
 */
export const ERROR_MESSAGES = {
    [ErrorCode.NF]: 'NEXT WITHOUT FOR',
    [ErrorCode.SN]: 'SYNTAX ERROR',
    [ErrorCode.RG]: 'RETURN WITHOUT GOSUB',
    [ErrorCode.OD]: 'OUT OF DATA',
    [ErrorCode.FC]: 'ILLEGAL QUANTITY',
    [ErrorCode.OV]: 'OVERFLOW',
    [ErrorCode.OM]: 'OUT OF MEMORY',
    [ErrorCode.US]: 'UNDEFINED STATEMENT',
    [ErrorCode.BS]: 'BAD SUBSCRIPT',
    [ErrorCode.DD]: 'REDIMENSIONED ARRAY',
    [ErrorCode.DZ]: 'DIVISION BY ZERO',
    [ErrorCode.ID]: 'ILLEGAL DIRECT',
    [ErrorCode.TM]: 'TYPE MISMATCH',
    [ErrorCode.LS]: 'STRING TOO LONG',
    [ErrorCode.ST]: 'FORMULA TOO COMPLEX',
    [ErrorCode.CN]: "CAN'T CONTINUE",
    [ErrorCode.UF]: 'UNDEFINED FUNCTION',
};
/**
 * BASIC runtime error
 */
export class BasicError extends Error {
    code;
    lineNumber;
    constructor(code, lineNumber) {
        super(`?${code} ERROR`);
        this.code = code;
        this.name = 'BasicError';
        this.lineNumber = lineNumber;
    }
    /**
     * Format error for display (matches original output format)
     */
    toString() {
        if (this.lineNumber !== undefined) {
            return `?${this.code} ERROR IN ${this.lineNumber}`;
        }
        return `?${this.code} ERROR`;
    }
}
/**
 * Break/stop error (Ctrl-C or STOP statement)
 */
export class BreakError extends Error {
    lineNumber;
    constructor(lineNumber) {
        const message = lineNumber !== undefined
            ? `\nBREAK IN ${lineNumber}`
            : '\nBREAK';
        super(message);
        this.lineNumber = lineNumber;
        this.name = 'BreakError';
    }
}
//# sourceMappingURL=errors.js.map