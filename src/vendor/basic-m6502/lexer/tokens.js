/**
 * Token types matching original RESLST order (lines 1112-1243 in m6502.asm)
 *
 * The order matters for tokenization - longer words must be checked first
 * to handle overlapping reserved words (e.g., "GOTO" before "GO")
 */
export var TokenType;
(function (TokenType) {
    // === Statements (ordered as in original STMDSP/RESLST) ===
    TokenType["END"] = "END";
    TokenType["FOR"] = "FOR";
    TokenType["NEXT"] = "NEXT";
    TokenType["DATA"] = "DATA";
    TokenType["INPUT"] = "INPUT";
    TokenType["DIM"] = "DIM";
    TokenType["READ"] = "READ";
    TokenType["LET"] = "LET";
    TokenType["GOTO"] = "GOTO";
    TokenType["RUN"] = "RUN";
    TokenType["IF"] = "IF";
    TokenType["RESTORE"] = "RESTORE";
    TokenType["GOSUB"] = "GOSUB";
    TokenType["RETURN"] = "RETURN";
    TokenType["REM"] = "REM";
    TokenType["STOP"] = "STOP";
    TokenType["ON"] = "ON";
    TokenType["WAIT"] = "WAIT";
    TokenType["DEF"] = "DEF";
    TokenType["POKE"] = "POKE";
    TokenType["PRINT"] = "PRINT";
    TokenType["CONT"] = "CONT";
    TokenType["LIST"] = "LIST";
    TokenType["CLEAR"] = "CLEAR";
    TokenType["GET"] = "GET";
    TokenType["NEW"] = "NEW";
    TokenType["LOAD"] = "LOAD";
    TokenType["SAVE"] = "SAVE";
    // === Keywords (not statements) ===
    TokenType["TAB"] = "TAB(";
    TokenType["TO"] = "TO";
    TokenType["FN"] = "FN";
    TokenType["SPC"] = "SPC(";
    TokenType["THEN"] = "THEN";
    TokenType["NOT"] = "NOT";
    TokenType["STEP"] = "STEP";
    TokenType["GO"] = "GO";
    // === Operators (ordered as in OPTAB, lines 1084-1103) ===
    TokenType["PLUS"] = "+";
    TokenType["MINUS"] = "-";
    TokenType["TIMES"] = "*";
    TokenType["DIVIDE"] = "/";
    TokenType["POWER"] = "^";
    TokenType["AND"] = "AND";
    TokenType["OR"] = "OR";
    TokenType["GT"] = ">";
    TokenType["EQ"] = "=";
    TokenType["LT"] = "<";
    // === Functions (ordered as in FUNDSP, lines 1054-1082) ===
    TokenType["SGN"] = "SGN";
    TokenType["INT"] = "INT";
    TokenType["ABS"] = "ABS";
    TokenType["USR"] = "USR";
    TokenType["FRE"] = "FRE";
    TokenType["POS"] = "POS";
    TokenType["SQR"] = "SQR";
    TokenType["RND"] = "RND";
    TokenType["LOG"] = "LOG";
    TokenType["EXP"] = "EXP";
    TokenType["COS"] = "COS";
    TokenType["SIN"] = "SIN";
    TokenType["TAN"] = "TAN";
    TokenType["ATN"] = "ATN";
    TokenType["PEEK"] = "PEEK";
    TokenType["LEN"] = "LEN";
    TokenType["STR"] = "STR$";
    TokenType["VAL"] = "VAL";
    TokenType["ASC"] = "ASC";
    TokenType["CHR"] = "CHR$";
    TokenType["LEFT"] = "LEFT$";
    TokenType["RIGHT"] = "RIGHT$";
    TokenType["MID"] = "MID$";
    // === Literals & identifiers ===
    TokenType["NUMBER"] = "NUMBER";
    TokenType["STRING"] = "STRING";
    TokenType["IDENTIFIER"] = "IDENTIFIER";
    // === Punctuation ===
    TokenType["LPAREN"] = "(";
    TokenType["RPAREN"] = ")";
    TokenType["COMMA"] = ",";
    TokenType["SEMICOLON"] = ";";
    TokenType["COLON"] = ":";
    TokenType["DOLLAR"] = "$";
    TokenType["PERCENT"] = "%";
    TokenType["QUESTION"] = "?";
    // === Special ===
    TokenType["EOL"] = "EOL";
    TokenType["EOF"] = "EOF";
})(TokenType || (TokenType = {}));
/**
 * Reserved words list - order matters for tokenization
 * Longer words first to handle overlaps (e.g., "GOTO" before "GO")
 *
 * Based on RESLST in m6502.asm (lines 1112-1243)
 */
export const RESERVED_WORDS = new Map([
    // Multi-argument string functions (must come before single-char versions)
    ['LEFT$', TokenType.LEFT],
    ['RIGHT$', TokenType.RIGHT],
    ['MID$', TokenType.MID],
    ['CHR$', TokenType.CHR],
    ['STR$', TokenType.STR],
    // Statements - longer ones first
    ['RESTORE', TokenType.RESTORE],
    ['RETURN', TokenType.RETURN],
    ['GOSUB', TokenType.GOSUB],
    ['CLEAR', TokenType.CLEAR],
    ['PRINT', TokenType.PRINT],
    ['INPUT', TokenType.INPUT],
    ['GOTO', TokenType.GOTO],
    ['NEXT', TokenType.NEXT],
    ['DATA', TokenType.DATA],
    ['READ', TokenType.READ],
    ['STOP', TokenType.STOP],
    ['WAIT', TokenType.WAIT],
    ['POKE', TokenType.POKE],
    ['PEEK', TokenType.PEEK],
    ['CONT', TokenType.CONT],
    ['LIST', TokenType.LIST],
    ['STEP', TokenType.STEP],
    ['THEN', TokenType.THEN],
    ['END', TokenType.END],
    ['FOR', TokenType.FOR],
    ['DIM', TokenType.DIM],
    ['LET', TokenType.LET],
    ['RUN', TokenType.RUN],
    ['REM', TokenType.REM],
    ['DEF', TokenType.DEF],
    ['GET', TokenType.GET],
    ['NEW', TokenType.NEW],
    ['LOAD', TokenType.LOAD],
    ['SAVE', TokenType.SAVE],
    ['NOT', TokenType.NOT],
    ['AND', TokenType.AND],
    ['TAB(', TokenType.TAB],
    ['SPC(', TokenType.SPC],
    ['IF', TokenType.IF],
    ['ON', TokenType.ON],
    ['TO', TokenType.TO],
    ['FN', TokenType.FN],
    ['OR', TokenType.OR],
    ['GO', TokenType.GO], // Must come after GOTO and GOSUB
    // Functions
    ['SGN', TokenType.SGN],
    ['INT', TokenType.INT],
    ['ABS', TokenType.ABS],
    ['USR', TokenType.USR],
    ['FRE', TokenType.FRE],
    ['POS', TokenType.POS],
    ['SQR', TokenType.SQR],
    ['RND', TokenType.RND],
    ['LOG', TokenType.LOG],
    ['EXP', TokenType.EXP],
    ['COS', TokenType.COS],
    ['SIN', TokenType.SIN],
    ['TAN', TokenType.TAN],
    ['ATN', TokenType.ATN],
    ['LEN', TokenType.LEN],
    ['VAL', TokenType.VAL],
    ['ASC', TokenType.ASC],
]);
/**
 * Operator precedence table (OPTAB equivalent, lines 1084-1103)
 * Higher number = higher precedence
 */
export const PRECEDENCE = {
    [TokenType.OR]: 70, // Lowest precedence
    [TokenType.AND]: 80,
    [TokenType.NOT]: 90, // Unary NOT
    [TokenType.LT]: 100, // Relational operators (all same precedence)
    [TokenType.EQ]: 100,
    [TokenType.GT]: 100,
    [TokenType.PLUS]: 121,
    [TokenType.MINUS]: 121,
    [TokenType.TIMES]: 123,
    [TokenType.DIVIDE]: 123,
    [TokenType.POWER]: 127, // Highest precedence
};
/**
 * Unary negation precedence (between * and ^)
 */
export const NEGATION_PRECEDENCE = 125;
/**
 * Check if a token type is a statement keyword
 */
export function isStatement(type) {
    const statements = new Set([
        TokenType.END,
        TokenType.FOR,
        TokenType.NEXT,
        TokenType.DATA,
        TokenType.INPUT,
        TokenType.DIM,
        TokenType.READ,
        TokenType.LET,
        TokenType.GOTO,
        TokenType.RUN,
        TokenType.IF,
        TokenType.RESTORE,
        TokenType.GOSUB,
        TokenType.RETURN,
        TokenType.REM,
        TokenType.STOP,
        TokenType.ON,
        TokenType.WAIT,
        TokenType.DEF,
        TokenType.POKE,
        TokenType.PRINT,
        TokenType.CONT,
        TokenType.LIST,
        TokenType.CLEAR,
        TokenType.GET,
        TokenType.NEW,
    ]);
    return statements.has(type);
}
/**
 * Check if a token type is a function
 */
export function isFunction(type) {
    const functions = new Set([
        TokenType.SGN,
        TokenType.INT,
        TokenType.ABS,
        TokenType.USR,
        TokenType.FRE,
        TokenType.POS,
        TokenType.SQR,
        TokenType.RND,
        TokenType.LOG,
        TokenType.EXP,
        TokenType.COS,
        TokenType.SIN,
        TokenType.TAN,
        TokenType.ATN,
        TokenType.PEEK,
        TokenType.LEN,
        TokenType.STR,
        TokenType.VAL,
        TokenType.ASC,
        TokenType.CHR,
        TokenType.LEFT,
        TokenType.RIGHT,
        TokenType.MID,
    ]);
    return functions.has(type);
}
/**
 * Check if a token type is a binary operator
 */
export function isBinaryOperator(type) {
    const operators = new Set([
        TokenType.PLUS,
        TokenType.MINUS,
        TokenType.TIMES,
        TokenType.DIVIDE,
        TokenType.POWER,
        TokenType.AND,
        TokenType.OR,
        TokenType.GT,
        TokenType.EQ,
        TokenType.LT,
    ]);
    return operators.has(type);
}
/**
 * Check if a token type is a relational operator
 */
export function isRelationalOperator(type) {
    return type === TokenType.GT || type === TokenType.EQ || type === TokenType.LT;
}
//# sourceMappingURL=tokens.js.map