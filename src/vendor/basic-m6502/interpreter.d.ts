/**
 * Microsoft BASIC 1.1 Interpreter - Main Entry Point
 *
 * A faithful TypeScript implementation targeting Apple II (REALIO=4)
 */
import { ConsoleIO } from './io/index.js';
export declare class Interpreter {
    private program;
    private memory;
    private memoryMap;
    private stack;
    private tokenizer;
    private evaluator;
    private console;
    private userFunctions;
    private state;
    constructor(console?: ConsoleIO);
    /**
     * Load a BASIC program from source text
     * Each line should be in format: lineNumber content
     */
    loadProgram(source: string): Promise<void>;
    /**
     * Run the loaded program
     */
    run(): Promise<void>;
    /**
     * Start the REPL (Read-Eval-Print Loop)
     */
    repl(): Promise<void>;
    /**
     * Process a line of input
     */
    processInput(line: string): Promise<void>;
    /**
     * Execute a direct mode command
     */
    private executeDirect;
    /**
     * Execute tokenized statement(s)
     * Returns ExecutionResult if control flow change, undefined for normal continuation
     */
    private executeTokens;
    /**
     * Execute a single statement
     * Returns ExecutionResult for control flow changes
     */
    private executeStatement;
    /**
     * RUN command
     */
    private executeRun;
    /**
     * Run program starting from a specific line
     */
    private runFromLine;
    /**
     * NEW command - clear program and variables
     */
    private executeNew;
    /**
     * LIST command
     */
    private executeList;
    /**
     * LOAD command - load a BASIC program from a file
     * Syntax: LOAD "filename"
     */
    private executeLoad;
    /**
     * SAVE command - save the current program to a file
     * Syntax: SAVE "filename"
     */
    private executeSave;
    /**
     * CLEAR/CLR command
     */
    private executeClear;
    /**
     * PRINT statement
     */
    private executePrint;
    /**
     * Extract tokens for an expression (up to separator or end)
     */
    private getExpressionTokens;
    /**
     * Variable assignment
     */
    private executeAssignment;
    /**
     * Parse array indices for assignment: (expr, expr, ...)
     */
    private parseArrayIndices;
    /**
     * END statement
     */
    private executeEnd;
    /**
     * STOP statement
     */
    private executeStop;
    /**
     * GOTO linenum - Jump to specified line
     */
    private executeGoto;
    /**
     * GOSUB linenum - Call subroutine
     */
    private executeGosub;
    /**
     * RETURN - Return from subroutine
     */
    private executeReturn;
    /**
     * FOR var = start TO end [STEP step]
     */
    private executeFor;
    /**
     * NEXT [var] - Continue or exit loop
     */
    private executeNext;
    /**
     * IF expr THEN stmt/linenum
     */
    private executeIf;
    /**
     * ON expr GOTO/GOSUB line1, line2, ...
     */
    private executeOn;
    /**
     * Parse a line number from tokens
     */
    private parseLineNumber;
    /**
     * Get expression tokens until a specific token type
     */
    private getExpressionTokensUntil;
    /**
     * CONT statement
     */
    private executeCont;
    /**
     * Format a number for output
     */
    private formatNumber;
    /**
     * Print READY prompt
     */
    private printReady;
    /**
     * Skip to end of statement (for DATA during execution)
     */
    private skipToEndOfStatement;
    /**
     * INPUT ["prompt";] var, var, ...
     */
    private executeInput;
    /**
     * Parse comma-separated input values
     */
    private parseInputValues;
    /**
     * READ var, var, ... - Read from DATA statements
     */
    private executeRead;
    /**
     * Read the next value from DATA statements
     * Note: DATA statement content is stored as a single STRING token that needs parsing
     */
    private readNextDataValue;
    /**
     * Parse a single value from DATA string starting at given index
     */
    private parseDataValue;
    /**
     * RESTORE [linenum] - Reset data pointer
     */
    private executeRestore;
    /**
     * DIM var(size), var(size, size), ...
     */
    private executeDim;
    /**
     * GET var - Read single character (Apple II specific)
     */
    private executeGet;
    /**
     * POKE address, value - Write byte to memory
     */
    private executePoke;
    /**
     * WAIT address, mask [, xor] - Wait for memory condition
     * Polls memory location until (PEEK(address) XOR xor) AND mask <> 0
     */
    private executeWait;
    /**
     * DEF FN name(var) = expression - Define user function
     */
    private executeDef;
}
