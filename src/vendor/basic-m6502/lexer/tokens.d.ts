/**
 * Token types matching original RESLST order (lines 1112-1243 in m6502.asm)
 *
 * The order matters for tokenization - longer words must be checked first
 * to handle overlapping reserved words (e.g., "GOTO" before "GO")
 */
export declare enum TokenType {
    END = "END",
    FOR = "FOR",
    NEXT = "NEXT",
    DATA = "DATA",
    INPUT = "INPUT",
    DIM = "DIM",
    READ = "READ",
    LET = "LET",
    GOTO = "GOTO",
    RUN = "RUN",
    IF = "IF",
    RESTORE = "RESTORE",
    GOSUB = "GOSUB",
    RETURN = "RETURN",
    REM = "REM",
    STOP = "STOP",
    ON = "ON",
    WAIT = "WAIT",
    DEF = "DEF",
    POKE = "POKE",
    PRINT = "PRINT",
    CONT = "CONT",
    LIST = "LIST",
    CLEAR = "CLEAR",
    GET = "GET",// Apple II specific (GETCMD=1)
    NEW = "NEW",
    LOAD = "LOAD",// File I/O
    SAVE = "SAVE",// File I/O
    TAB = "TAB(",// TAB( - special token
    TO = "TO",
    FN = "FN",
    SPC = "SPC(",// SPC( - special token
    THEN = "THEN",
    NOT = "NOT",
    STEP = "STEP",
    GO = "GO",// Separate from GOTO for "GO TO" parsing
    PLUS = "+",
    MINUS = "-",
    TIMES = "*",
    DIVIDE = "/",
    POWER = "^",
    AND = "AND",
    OR = "OR",
    GT = ">",
    EQ = "=",
    LT = "<",
    SGN = "SGN",
    INT = "INT",
    ABS = "ABS",
    USR = "USR",
    FRE = "FRE",
    POS = "POS",
    SQR = "SQR",
    RND = "RND",
    LOG = "LOG",
    EXP = "EXP",
    COS = "COS",
    SIN = "SIN",
    TAN = "TAN",
    ATN = "ATN",
    PEEK = "PEEK",
    LEN = "LEN",
    STR = "STR$",
    VAL = "VAL",
    ASC = "ASC",
    CHR = "CHR$",
    LEFT = "LEFT$",
    RIGHT = "RIGHT$",
    MID = "MID$",
    NUMBER = "NUMBER",
    STRING = "STRING",
    IDENTIFIER = "IDENTIFIER",
    LPAREN = "(",
    RPAREN = ")",
    COMMA = ",",
    SEMICOLON = ";",
    COLON = ":",
    DOLLAR = "$",
    PERCENT = "%",
    QUESTION = "?",// Shorthand for PRINT
    EOL = "EOL",
    EOF = "EOF"
}
/**
 * Token representation
 */
export interface Token {
    type: TokenType;
    value: string | number;
    position: number;
}
/**
 * Reserved words list - order matters for tokenization
 * Longer words first to handle overlaps (e.g., "GOTO" before "GO")
 *
 * Based on RESLST in m6502.asm (lines 1112-1243)
 */
export declare const RESERVED_WORDS: ReadonlyMap<string, TokenType>;
/**
 * Operator precedence table (OPTAB equivalent, lines 1084-1103)
 * Higher number = higher precedence
 */
export declare const PRECEDENCE: Readonly<Record<string, number>>;
/**
 * Unary negation precedence (between * and ^)
 */
export declare const NEGATION_PRECEDENCE = 125;
/**
 * Check if a token type is a statement keyword
 */
export declare function isStatement(type: TokenType): boolean;
/**
 * Check if a token type is a function
 */
export declare function isFunction(type: TokenType): boolean;
/**
 * Check if a token type is a binary operator
 */
export declare function isBinaryOperator(type: TokenType): boolean;
/**
 * Check if a token type is a relational operator
 */
export declare function isRelationalOperator(type: TokenType): boolean;
