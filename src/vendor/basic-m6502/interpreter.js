/**
 * Microsoft BASIC 1.1 Interpreter - Main Entry Point
 *
 * A faithful TypeScript implementation targeting Apple II (REALIO=4)
 */
import { Tokenizer, TokenType } from './lexer/index.js';
import { BasicError, BreakError, ErrorCode } from './errors/index.js';
import { Program, MemoryManager, RuntimeStack, MemoryMap } from './runtime/index.js';
import { CONFIG } from './config.js';
import { ExpressionEvaluator, isNumeric } from './parser/index.js';
const readFileSync = (filename) => {
    const value = globalThis.localStorage?.getItem(`burning-horizons:c64:${filename}`);
    if (value == null) {
        const error = new Error(`File not found: ${filename}`);
        error.code = 'ENOENT';
        throw error;
    }
    return value;
};
const writeFileSync = (filename, content) => {
    if (!globalThis.localStorage)
        throw new Error('Browser storage unavailable');
    globalThis.localStorage.setItem(`burning-horizons:c64:${filename}`, content);
};
export class Interpreter {
    program = new Program();
    memory = new MemoryManager();
    memoryMap = new MemoryMap();
    stack = new RuntimeStack();
    tokenizer = new Tokenizer();
    evaluator;
    console;
    userFunctions = new Map();
    state = {
        running: false,
        interrupted: false,
        currentLine: null,
        tokenIndex: 0,
        continueState: {
            canContinue: false,
            lineNumber: 0,
            tokenIndex: 0,
        },
        dataPointer: {
            lineNumber: 0,
            tokenIndex: 0,
        },
    };
    constructor(console) {
        if (!console)
            throw new Error('A browser ConsoleIO adapter is required');
        this.console = console;
        this.evaluator = new ExpressionEvaluator(this.memory, this.memoryMap);
        // Wire up user function lookup
        this.evaluator.setUserFunctionLookup((name) => {
            return this.userFunctions.get(name);
        });
    }
    /**
     * Load a BASIC program from source text
     * Each line should be in format: lineNumber content
     */
    async loadProgram(source) {
        const lines = source.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '')
                continue;
            // Skip comment lines (some .bas files use ' for comments)
            if (trimmed.startsWith("'"))
                continue;
            await this.processInput(trimmed);
        }
    }
    /**
     * Run the loaded program
     */
    async run() {
        try {
            await this.executeRun();
        }
        catch (error) {
            if (error instanceof BasicError) {
                this.console.printLine(error.toString());
            }
            else if (error instanceof BreakError) {
                this.console.printLine(error.message);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Start the REPL (Read-Eval-Print Loop)
     */
    async repl() {
        // Set up SIGINT (Ctrl+C) handler (Node.js only)
        let sigintHandler;
        const cleanup = () => {
            if (sigintHandler && typeof process !== 'undefined' && process.off) {
                process.off('SIGINT', sigintHandler);
            }
        };
        if (typeof process !== 'undefined' && process.on) {
            sigintHandler = () => {
                if (this.state.running) {
                    // If program is running, interrupt it
                    this.state.interrupted = true;
                    this.state.running = false;
                }
                else {
                    // At prompt - exit on second Ctrl+C
                    this.console.printLine('');
                    this.console.printLine('(Press Ctrl+C again to exit)');
                    // Set up one-time handler for second Ctrl+C
                    process.once('SIGINT', () => {
                        cleanup();
                        this.console.printLine('');
                        process.exit(0);
                    });
                }
            };
            process.on('SIGINT', sigintHandler);
        }
        // Print banner
        this.console.printLine('MICROSOFT BASIC 1.1');
        this.console.printLine('FOR THE 6502 MICROPROCESSOR');
        this.console.printLine('');
        this.printReady();
        while (true) {
            try {
                const line = await this.console.readLine(']');
                await this.processInput(line);
            }
            catch (error) {
                if (error instanceof BasicError) {
                    this.console.printLine(error.toString());
                    this.printReady();
                }
                else if (error instanceof BreakError) {
                    this.console.printLine(error.message);
                    this.printReady();
                }
                else {
                    throw error;
                }
            }
        }
    }
    /**
     * Process a line of input
     */
    async processInput(line) {
        const trimmed = line.trim();
        if (trimmed === '') {
            return;
        }
        // Check if line starts with a line number
        const lineNumberMatch = trimmed.match(/^(\d+)\s*(.*)/);
        if (lineNumberMatch) {
            // Program line - store it
            const lineNumber = parseInt(lineNumberMatch[1], 10);
            const content = lineNumberMatch[2];
            // Invalidate CONT state when program is edited
            this.state.continueState.canContinue = false;
            this.program.addLine(lineNumber, content);
        }
        else {
            // Direct mode - execute immediately
            await this.executeDirect(trimmed);
        }
    }
    /**
     * Execute a direct mode command
     */
    async executeDirect(line) {
        const tokens = this.tokenizer.tokenize(line);
        this.state.currentLine = null;
        this.state.tokenIndex = 0;
        await this.executeTokens(tokens);
        this.printReady();
    }
    /**
     * Execute tokenized statement(s)
     * Returns ExecutionResult if control flow change, undefined for normal continuation
     */
    async executeTokens(tokens) {
        this.state.tokenIndex = 0;
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            // End of line
            if (token.type === TokenType.EOL || token.type === TokenType.EOF) {
                break;
            }
            // Statement separator
            if (token.type === TokenType.COLON) {
                this.state.tokenIndex++;
                continue;
            }
            // Execute statement
            const result = await this.executeStatement(tokens);
            if (result && result.type !== 'continue') {
                return result;
            }
        }
        return undefined;
    }
    /**
     * Execute a single statement
     * Returns ExecutionResult for control flow changes
     */
    async executeStatement(tokens) {
        const token = tokens[this.state.tokenIndex];
        switch (token.type) {
            case TokenType.RUN:
                await this.executeRun();
                return { type: 'end' };
            case TokenType.NEW:
                this.executeNew();
                return { type: 'continue' };
            case TokenType.LOAD:
                await this.executeLoad(tokens);
                return { type: 'continue' };
            case TokenType.SAVE:
                this.executeSave(tokens);
                return { type: 'continue' };
            case TokenType.LIST:
                this.executeList(tokens);
                return { type: 'continue' };
            case TokenType.CLEAR:
                this.executeClear();
                return { type: 'continue' };
            case TokenType.PRINT:
            case TokenType.QUESTION:
                await this.executePrint(tokens);
                return { type: 'continue' };
            case TokenType.LET:
                this.state.tokenIndex++; // Skip LET keyword
                await this.executeAssignment(tokens);
                return { type: 'continue' };
            case TokenType.IDENTIFIER:
                // Implicit LET
                await this.executeAssignment(tokens);
                return { type: 'continue' };
            case TokenType.REM:
                // Skip to end of line
                while (this.state.tokenIndex < tokens.length &&
                    tokens[this.state.tokenIndex].type !== TokenType.EOL) {
                    this.state.tokenIndex++;
                }
                return { type: 'continue' };
            case TokenType.GOTO:
                return this.executeGoto(tokens);
            case TokenType.GOSUB:
                return this.executeGosub(tokens);
            case TokenType.RETURN:
                return this.executeReturn();
            case TokenType.FOR:
                return this.executeFor(tokens);
            case TokenType.NEXT:
                return this.executeNext(tokens);
            case TokenType.IF:
                return await this.executeIf(tokens);
            case TokenType.ON:
                return this.executeOn(tokens);
            case TokenType.END:
                return this.executeEnd();
            case TokenType.STOP:
                return this.executeStop();
            case TokenType.CONT:
                await this.executeCont();
                return { type: 'continue' };
            case TokenType.INPUT:
                await this.executeInput(tokens);
                return { type: 'continue' };
            case TokenType.READ:
                await this.executeRead(tokens);
                return { type: 'continue' };
            case TokenType.DATA:
                // Skip DATA statement during execution (processed by READ)
                this.skipToEndOfStatement(tokens);
                return { type: 'continue' };
            case TokenType.RESTORE:
                this.executeRestore(tokens);
                return { type: 'continue' };
            case TokenType.DIM:
                this.executeDim(tokens);
                return { type: 'continue' };
            case TokenType.GET:
                await this.executeGet(tokens);
                return { type: 'continue' };
            case TokenType.POKE:
                this.executePoke(tokens);
                return { type: 'continue' };
            case TokenType.WAIT:
                this.executeWait(tokens);
                return { type: 'continue' };
            case TokenType.DEF:
                this.executeDef(tokens);
                return { type: 'continue' };
            default:
                throw new BasicError(ErrorCode.SN);
        }
    }
    /**
     * RUN command
     */
    async executeRun() {
        this.state.tokenIndex++;
        // Clear variables and stack
        this.memory.clear();
        this.stack.clear();
        this.state.continueState.canContinue = false;
        if (this.program.isEmpty()) {
            return;
        }
        // Start execution from first line
        this.state.running = true;
        const firstLine = this.program.getFirstLine();
        if (firstLine) {
            await this.runFromLine(firstLine.lineNumber);
        }
    }
    /**
     * Run program starting from a specific line
     */
    async runFromLine(startLine) {
        let currentLineNum = startLine;
        this.state.interrupted = false;
        while (currentLineNum !== undefined && this.state.running) {
            // Check for Ctrl+C interrupt
            if (this.state.interrupted) {
                this.state.interrupted = false;
                // Save state for CONT
                this.state.continueState.canContinue = true;
                this.state.continueState.lineNumber = currentLineNum;
                this.state.continueState.tokenIndex = 0;
                this.console.printLine('');
                this.console.printLine(`BREAK IN ${currentLineNum}`);
                return;
            }
            const line = this.program.getLine(currentLineNum);
            if (!line) {
                break;
            }
            this.state.currentLine = currentLineNum;
            this.state.tokenIndex = 0;
            try {
                const result = await this.executeTokens(line.tokens);
                // Handle control flow results
                if (result) {
                    switch (result.type) {
                        case 'jump':
                            currentLineNum = result.targetLine;
                            continue;
                        case 'end':
                        case 'stop':
                            this.state.running = false;
                            return;
                    }
                }
            }
            catch (error) {
                if (error instanceof BasicError) {
                    error.lineNumber = currentLineNum;
                    throw error;
                }
                throw error;
            }
            // Move to next line
            const nextLine = this.program.getNextLine(currentLineNum);
            currentLineNum = nextLine?.lineNumber;
        }
        this.state.running = false;
    }
    /**
     * NEW command - clear program and variables
     */
    executeNew() {
        this.state.tokenIndex++;
        this.program.clear();
        this.memory.clear();
        this.stack.clear();
        this.state.continueState.canContinue = false;
    }
    /**
     * LIST command
     */
    executeList(tokens) {
        this.state.tokenIndex++;
        let start;
        let end;
        // Parse optional line range
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.NUMBER) {
            start = tokens[this.state.tokenIndex].value;
            this.state.tokenIndex++;
        }
        // Check for dash indicating range
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.MINUS) {
            this.state.tokenIndex++;
            if (this.state.tokenIndex < tokens.length &&
                tokens[this.state.tokenIndex].type === TokenType.NUMBER) {
                end = tokens[this.state.tokenIndex].value;
                this.state.tokenIndex++;
            }
        }
        else if (start !== undefined) {
            // Single line number
            end = start;
        }
        const lines = this.program.list(start, end);
        for (const line of lines) {
            this.console.printLine(line);
        }
    }
    /**
     * LOAD command - load a BASIC program from a file
     * Syntax: LOAD "filename"
     */
    async executeLoad(tokens) {
        this.state.tokenIndex++; // Skip LOAD
        // Get filename
        const token = tokens[this.state.tokenIndex];
        if (!token || token.type !== TokenType.STRING) {
            throw new BasicError(ErrorCode.SN, this.state.currentLine ?? undefined);
        }
        const filename = token.value;
        this.state.tokenIndex++;
        try {
            const content = readFileSync(filename, 'utf-8');
            // Clear current program before loading
            this.executeNew();
            // Load the new program
            await this.loadProgram(content);
            this.console.printLine(`LOADED: ${filename}`);
        }
        catch (error) {
            const nodeError = error;
            if (nodeError.code === 'ENOENT') {
                this.console.printLine(`?FILE NOT FOUND: ${filename}`);
            }
            else if (nodeError.code === 'EACCES') {
                this.console.printLine(`?ACCESS DENIED: ${filename}`);
            }
            else if (nodeError.code === 'EISDIR') {
                this.console.printLine(`?IS A DIRECTORY: ${filename}`);
            }
            else {
                this.console.printLine(`?LOAD ERROR: ${nodeError.message || 'Unknown error'}`);
            }
        }
    }
    /**
     * SAVE command - save the current program to a file
     * Syntax: SAVE "filename"
     */
    executeSave(tokens) {
        this.state.tokenIndex++; // Skip SAVE
        // Get filename
        const token = tokens[this.state.tokenIndex];
        if (!token || token.type !== TokenType.STRING) {
            throw new BasicError(ErrorCode.SN, this.state.currentLine ?? undefined);
        }
        const filename = token.value;
        this.state.tokenIndex++;
        // Get all program lines
        const lines = this.program.list();
        const content = lines.join('\n') + '\n';
        try {
            writeFileSync(filename, content, 'utf-8');
            this.console.printLine(`SAVED: ${filename}`);
        }
        catch (error) {
            this.console.printLine(`?CANNOT WRITE: ${filename}`);
        }
    }
    /**
     * CLEAR/CLR command
     */
    executeClear() {
        this.state.tokenIndex++;
        this.memory.clear();
        this.stack.clear();
    }
    /**
     * PRINT statement
     */
    async executePrint(tokens) {
        this.state.tokenIndex++; // Skip PRINT
        let suppressNewline = false;
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.EOL ||
                token.type === TokenType.COLON ||
                token.type === TokenType.EOF) {
                break;
            }
            suppressNewline = false;
            if (token.type === TokenType.SEMICOLON) {
                suppressNewline = true;
                this.state.tokenIndex++;
                continue;
            }
            if (token.type === TokenType.COMMA) {
                // Advance to next tab zone
                const pos = this.console.getPosition();
                const nextZone = Math.ceil((pos + 1) / CONFIG.columnWidth) * CONFIG.columnWidth;
                if (nextZone >= CONFIG.lineLength) {
                    this.console.printLine('');
                }
                else {
                    this.console.setPosition(nextZone);
                }
                suppressNewline = true;
                this.state.tokenIndex++;
                continue;
            }
            // Evaluate expression
            const exprTokens = this.getExpressionTokens(tokens);
            const value = this.evaluator.evaluate(exprTokens);
            if (isNumeric(value)) {
                this.console.print(this.formatNumber(value));
            }
            else {
                this.console.print(value);
            }
        }
        if (!suppressNewline) {
            this.console.printLine('');
        }
    }
    /**
     * Extract tokens for an expression (up to separator or end)
     */
    getExpressionTokens(tokens) {
        const exprTokens = [];
        let parenDepth = 0;
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            // Track parentheses
            if (token.type === TokenType.LPAREN)
                parenDepth++;
            if (token.type === TokenType.RPAREN)
                parenDepth--;
            // Stop at statement separators (unless in parens)
            if (parenDepth === 0) {
                if (token.type === TokenType.EOL ||
                    token.type === TokenType.COLON ||
                    token.type === TokenType.EOF ||
                    token.type === TokenType.SEMICOLON ||
                    token.type === TokenType.COMMA) {
                    break;
                }
            }
            exprTokens.push(token);
            this.state.tokenIndex++;
        }
        return exprTokens;
    }
    /**
     * Variable assignment
     */
    async executeAssignment(tokens) {
        const varToken = tokens[this.state.tokenIndex];
        if (varToken.type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        const varName = varToken.value;
        this.state.tokenIndex++;
        // Check for array subscript
        let indices;
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.LPAREN) {
            indices = this.parseArrayIndices(tokens);
        }
        // Expect =
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.EQ) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Evaluate expression
        const exprTokens = this.getExpressionTokens(tokens);
        const value = this.evaluator.evaluate(exprTokens);
        // Assign to variable or array element
        if (indices) {
            this.memory.setArrayElement(varName, indices, value);
        }
        else {
            this.memory.setVariable(varName, value);
        }
    }
    /**
     * Parse array indices for assignment: (expr, expr, ...)
     */
    parseArrayIndices(tokens) {
        this.state.tokenIndex++; // Skip (
        const indices = [];
        while (this.state.tokenIndex < tokens.length) {
            // Get expression up to , or )
            const exprTokens = [];
            let parenDepth = 0;
            while (this.state.tokenIndex < tokens.length) {
                const token = tokens[this.state.tokenIndex];
                if (token.type === TokenType.LPAREN)
                    parenDepth++;
                if (token.type === TokenType.RPAREN) {
                    if (parenDepth === 0)
                        break;
                    parenDepth--;
                }
                if (token.type === TokenType.COMMA && parenDepth === 0)
                    break;
                exprTokens.push(token);
                this.state.tokenIndex++;
            }
            const value = this.evaluator.evaluateNumeric(exprTokens);
            indices.push(Math.trunc(value));
            // Check for , or )
            if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                this.state.tokenIndex++;
            }
            else if (tokens[this.state.tokenIndex]?.type === TokenType.RPAREN) {
                this.state.tokenIndex++;
                break;
            }
            else {
                throw new BasicError(ErrorCode.SN);
            }
        }
        return indices;
    }
    /**
     * END statement
     */
    executeEnd() {
        this.state.running = false;
        this.state.tokenIndex++;
        return { type: 'end' };
    }
    /**
     * STOP statement
     */
    executeStop() {
        // Save state for CONT
        this.state.continueState = {
            canContinue: true,
            lineNumber: this.state.currentLine ?? 0,
            tokenIndex: this.state.tokenIndex + 1,
        };
        this.state.running = false;
        this.state.tokenIndex++;
        throw new BreakError(this.state.currentLine ?? undefined);
    }
    /**
     * GOTO linenum - Jump to specified line
     */
    executeGoto(tokens) {
        this.state.tokenIndex++; // Skip GOTO
        const targetLine = this.parseLineNumber(tokens);
        if (!this.program.getLine(targetLine)) {
            throw new BasicError(ErrorCode.US); // Undefined statement
        }
        return { type: 'jump', targetLine };
    }
    /**
     * GOSUB linenum - Call subroutine
     */
    executeGosub(tokens) {
        this.state.tokenIndex++; // Skip GOSUB
        const targetLine = this.parseLineNumber(tokens);
        if (!this.program.getLine(targetLine)) {
            throw new BasicError(ErrorCode.US);
        }
        // Push return address onto stack
        this.stack.pushGosub({
            lineNumber: this.state.currentLine ?? 0,
            tokenIndex: this.state.tokenIndex,
        });
        return { type: 'jump', targetLine };
    }
    /**
     * RETURN - Return from subroutine
     */
    executeReturn() {
        this.state.tokenIndex++;
        const entry = this.stack.popGosub();
        if (!entry) {
            throw new BasicError(ErrorCode.RG); // Return without GOSUB
        }
        // Jump back to line after GOSUB
        // We need to continue from the next statement after GOSUB
        const nextLine = this.program.getNextLine(entry.lineNumber);
        if (nextLine) {
            return { type: 'jump', targetLine: nextLine.lineNumber };
        }
        return { type: 'end' };
    }
    /**
     * FOR var = start TO end [STEP step]
     */
    executeFor(tokens) {
        this.state.tokenIndex++; // Skip FOR
        // Get loop variable
        const varToken = tokens[this.state.tokenIndex];
        if (varToken.type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        const varName = varToken.value;
        this.state.tokenIndex++;
        // Expect =
        if (tokens[this.state.tokenIndex]?.type !== TokenType.EQ) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Parse initial value
        const startTokens = this.getExpressionTokensUntil(tokens, TokenType.TO);
        const startValue = this.evaluator.evaluateNumeric(startTokens);
        // Expect TO
        if (tokens[this.state.tokenIndex]?.type !== TokenType.TO) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Parse limit value (stop at STEP or end of statement)
        const limitTokens = this.getExpressionTokensUntil(tokens, TokenType.STEP);
        const limitValue = this.evaluator.evaluateNumeric(limitTokens);
        // Parse optional STEP
        let stepValue = 1;
        if (tokens[this.state.tokenIndex]?.type === TokenType.STEP) {
            this.state.tokenIndex++;
            const stepTokens = this.getExpressionTokens(tokens);
            stepValue = this.evaluator.evaluateNumeric(stepTokens);
        }
        // Set initial value
        this.memory.setVariable(varName, startValue);
        // Push FOR entry onto stack
        this.stack.pushFor({
            variable: varName,
            step: stepValue,
            stepSign: Math.sign(stepValue),
            limit: limitValue,
            lineNumber: this.state.currentLine ?? 0,
            tokenIndex: this.state.tokenIndex,
        });
        return { type: 'continue' };
    }
    /**
     * NEXT [var] - Continue or exit loop
     */
    executeNext(tokens) {
        this.state.tokenIndex++; // Skip NEXT
        // Get optional variable name
        let varName;
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.IDENTIFIER) {
            varName = tokens[this.state.tokenIndex].value;
            this.state.tokenIndex++;
        }
        // Find matching FOR entry
        const entry = varName ? this.stack.findFor(varName) : this.stack.peekFor();
        if (!entry) {
            throw new BasicError(ErrorCode.NF); // NEXT without FOR
        }
        // Increment loop variable
        const currentValue = this.memory.getVariable(entry.variable);
        if (typeof currentValue !== 'number') {
            throw new BasicError(ErrorCode.TM);
        }
        const newValue = currentValue + entry.step;
        this.memory.setVariable(entry.variable, newValue);
        // Check if loop is done
        const done = entry.stepSign >= 0
            ? newValue > entry.limit // Positive step: done when > limit
            : newValue < entry.limit; // Negative step: done when < limit
        if (done) {
            // Loop finished - pop FOR entry and continue
            this.stack.popFor(entry.variable);
            return { type: 'continue' };
        }
        // Loop continues - jump back to line after FOR
        const nextLine = this.program.getNextLine(entry.lineNumber);
        if (nextLine) {
            return { type: 'jump', targetLine: nextLine.lineNumber };
        }
        return { type: 'end' };
    }
    /**
     * IF expr THEN stmt/linenum
     */
    async executeIf(tokens) {
        this.state.tokenIndex++; // Skip IF
        // Parse condition expression (until THEN or GOTO)
        const condTokens = this.getExpressionTokensUntil(tokens, TokenType.THEN, TokenType.GOTO);
        const condValue = this.evaluator.evaluate(condTokens);
        // Check for THEN or GOTO
        const nextToken = tokens[this.state.tokenIndex];
        if (nextToken?.type === TokenType.THEN || nextToken?.type === TokenType.GOTO) {
            this.state.tokenIndex++;
        }
        else {
            throw new BasicError(ErrorCode.SN);
        }
        // Evaluate condition (0 = false, anything else = true)
        const isTrue = typeof condValue === 'number' ? condValue !== 0 : condValue.length > 0;
        if (!isTrue) {
            // Skip rest of line
            while (this.state.tokenIndex < tokens.length &&
                tokens[this.state.tokenIndex].type !== TokenType.EOL) {
                this.state.tokenIndex++;
            }
            return { type: 'continue' };
        }
        // Condition is true - check what follows
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.NUMBER) {
            // Line number - do GOTO
            const targetLine = tokens[this.state.tokenIndex].value;
            this.state.tokenIndex++;
            if (!this.program.getLine(targetLine)) {
                throw new BasicError(ErrorCode.US);
            }
            return { type: 'jump', targetLine };
        }
        // Statement(s) follow - continue executing them
        return { type: 'continue' };
    }
    /**
     * ON expr GOTO/GOSUB line1, line2, ...
     */
    executeOn(tokens) {
        this.state.tokenIndex++; // Skip ON
        // Parse index expression
        const exprTokens = this.getExpressionTokensUntil(tokens, TokenType.GOTO, TokenType.GOSUB);
        const indexValue = Math.trunc(this.evaluator.evaluateNumeric(exprTokens));
        // Check for GOTO or GOSUB
        const isGosub = tokens[this.state.tokenIndex]?.type === TokenType.GOSUB;
        if (tokens[this.state.tokenIndex]?.type !== TokenType.GOTO &&
            tokens[this.state.tokenIndex]?.type !== TokenType.GOSUB) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Parse line number list
        const lineNumbers = [];
        while (this.state.tokenIndex < tokens.length) {
            if (tokens[this.state.tokenIndex].type === TokenType.NUMBER) {
                lineNumbers.push(tokens[this.state.tokenIndex].value);
                this.state.tokenIndex++;
                if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                    this.state.tokenIndex++;
                }
                else {
                    break;
                }
            }
            else {
                break;
            }
        }
        // Check if index is valid (1-based)
        if (indexValue < 1 || indexValue > lineNumbers.length) {
            // Out of range - just continue to next statement
            return { type: 'continue' };
        }
        const targetLine = lineNumbers[indexValue - 1];
        if (!this.program.getLine(targetLine)) {
            throw new BasicError(ErrorCode.US);
        }
        if (isGosub) {
            // Push return address
            this.stack.pushGosub({
                lineNumber: this.state.currentLine ?? 0,
                tokenIndex: this.state.tokenIndex,
            });
        }
        return { type: 'jump', targetLine };
    }
    /**
     * Parse a line number from tokens
     */
    parseLineNumber(tokens) {
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.NUMBER) {
            throw new BasicError(ErrorCode.SN);
        }
        const lineNum = tokens[this.state.tokenIndex].value;
        this.state.tokenIndex++;
        return lineNum;
    }
    /**
     * Get expression tokens until a specific token type
     */
    getExpressionTokensUntil(tokens, ...stopTypes) {
        const exprTokens = [];
        let parenDepth = 0;
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.LPAREN)
                parenDepth++;
            if (token.type === TokenType.RPAREN)
                parenDepth--;
            // Stop at specified types (if not in parens)
            if (parenDepth === 0 && stopTypes.includes(token.type)) {
                break;
            }
            // Stop at statement terminators
            if (token.type === TokenType.EOL || token.type === TokenType.COLON || token.type === TokenType.EOF) {
                break;
            }
            exprTokens.push(token);
            this.state.tokenIndex++;
        }
        return exprTokens;
    }
    /**
     * CONT statement
     */
    async executeCont() {
        this.state.tokenIndex++;
        if (!this.state.continueState.canContinue) {
            throw new BasicError(ErrorCode.CN);
        }
        // Resume execution from saved position
        const { lineNumber } = this.state.continueState;
        this.state.running = true;
        this.state.continueState.canContinue = false; // Clear so we can't double-CONT
        // Execute from the saved line
        await this.runFromLine(lineNumber);
    }
    /**
     * Format a number for output
     */
    formatNumber(value) {
        if (value >= 0) {
            return ' ' + value.toString() + ' ';
        }
        else {
            return value.toString() + ' ';
        }
    }
    /**
     * Print READY prompt
     */
    printReady() {
        this.console.printLine('');
        this.console.printLine('READY.');
    }
    /**
     * Skip to end of statement (for DATA during execution)
     */
    skipToEndOfStatement(tokens) {
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.EOL ||
                token.type === TokenType.COLON ||
                token.type === TokenType.EOF) {
                break;
            }
            this.state.tokenIndex++;
        }
    }
    /**
     * INPUT ["prompt";] var, var, ...
     */
    async executeInput(tokens) {
        this.state.tokenIndex++; // Skip INPUT
        // Check for optional prompt string
        let prompt = '? ';
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.STRING) {
            prompt = tokens[this.state.tokenIndex].value;
            this.state.tokenIndex++;
            // Expect semicolon after prompt
            if (tokens[this.state.tokenIndex]?.type === TokenType.SEMICOLON) {
                this.state.tokenIndex++;
            }
        }
        // Collect variable names
        const variables = [];
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.EOL ||
                token.type === TokenType.COLON ||
                token.type === TokenType.EOF) {
                break;
            }
            if (token.type === TokenType.IDENTIFIER) {
                const varName = token.value;
                this.state.tokenIndex++;
                // Check for array subscript
                let indices;
                if (tokens[this.state.tokenIndex]?.type === TokenType.LPAREN) {
                    indices = this.parseArrayIndices(tokens);
                }
                variables.push({ name: varName, indices });
                // Skip comma
                if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                    this.state.tokenIndex++;
                }
            }
            else {
                throw new BasicError(ErrorCode.SN);
            }
        }
        // Read input line
        const input = await this.console.readLine(prompt);
        const values = this.parseInputValues(input);
        // Assign values to variables
        for (let i = 0; i < variables.length; i++) {
            const v = variables[i];
            const rawValue = values[i] ?? '';
            // Determine expected type from variable name
            const isString = v.name.endsWith('$');
            let value;
            if (isString) {
                value = rawValue;
            }
            else {
                value = parseFloat(rawValue) || 0;
            }
            if (v.indices) {
                this.memory.setArrayElement(v.name, v.indices, value);
            }
            else {
                this.memory.setVariable(v.name, value);
            }
        }
    }
    /**
     * Parse comma-separated input values
     */
    parseInputValues(input) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (const char of input) {
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        values.push(current.trim());
        return values;
    }
    /**
     * READ var, var, ... - Read from DATA statements
     */
    async executeRead(tokens) {
        this.state.tokenIndex++; // Skip READ
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.EOL ||
                token.type === TokenType.COLON ||
                token.type === TokenType.EOF) {
                break;
            }
            if (token.type === TokenType.IDENTIFIER) {
                const varName = token.value;
                this.state.tokenIndex++;
                // Check for array subscript
                let indices;
                if (tokens[this.state.tokenIndex]?.type === TokenType.LPAREN) {
                    indices = this.parseArrayIndices(tokens);
                }
                // Read next DATA value
                const value = this.readNextDataValue(varName.endsWith('$'));
                if (indices) {
                    this.memory.setArrayElement(varName, indices, value);
                }
                else {
                    this.memory.setVariable(varName, value);
                }
                // Skip comma
                if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                    this.state.tokenIndex++;
                }
            }
            else if (token.type === TokenType.COMMA) {
                this.state.tokenIndex++;
            }
            else {
                throw new BasicError(ErrorCode.SN);
            }
        }
    }
    /**
     * Read the next value from DATA statements
     * Note: DATA statement content is stored as a single STRING token that needs parsing
     */
    readNextDataValue(isString) {
        // Find next DATA value starting from current data pointer
        // dataPointer.lineNumber = current line
        // dataPointer.tokenIndex = position within the DATA string (character index)
        let lineNum = this.state.dataPointer.lineNumber;
        let charIdx = this.state.dataPointer.tokenIndex;
        // If we haven't started, find first line
        if (lineNum === 0) {
            const firstLine = this.program.getFirstLine();
            if (!firstLine) {
                throw new BasicError(ErrorCode.OD); // Out of data
            }
            lineNum = firstLine.lineNumber;
            charIdx = 0;
        }
        while (true) {
            const line = this.program.getLine(lineNum);
            if (!line) {
                throw new BasicError(ErrorCode.OD); // Out of data
            }
            // Find DATA statement in this line
            const dataTokens = line.tokens;
            for (let i = 0; i < dataTokens.length; i++) {
                if (dataTokens[i].type === TokenType.DATA) {
                    // The next token should be the STRING containing all DATA values
                    const dataContent = dataTokens[i + 1];
                    if (dataContent && dataContent.type === TokenType.STRING) {
                        const dataStr = dataContent.value;
                        // Parse value at charIdx
                        const result = this.parseDataValue(dataStr, charIdx, isString);
                        if (result) {
                            // Update pointer for next read
                            this.state.dataPointer.lineNumber = lineNum;
                            this.state.dataPointer.tokenIndex = result.nextIndex;
                            return result.value;
                        }
                        // No more values in this DATA, continue to next line
                    }
                }
            }
            // Move to next line
            const nextLine = this.program.getNextLine(lineNum);
            if (!nextLine) {
                throw new BasicError(ErrorCode.OD); // Out of data
            }
            lineNum = nextLine.lineNumber;
            charIdx = 0; // Reset for new line
        }
    }
    /**
     * Parse a single value from DATA string starting at given index
     */
    parseDataValue(dataStr, startIdx, isString) {
        let idx = startIdx;
        // Skip leading whitespace and commas
        while (idx < dataStr.length) {
            const ch = dataStr[idx];
            if (ch === ' ' || ch === '\t' || ch === ',') {
                idx++;
            }
            else {
                break;
            }
        }
        if (idx >= dataStr.length) {
            return null; // No more values
        }
        // Check for quoted string
        if (dataStr[idx] === '"') {
            idx++; // Skip opening quote
            let str = '';
            while (idx < dataStr.length && dataStr[idx] !== '"') {
                str += dataStr[idx];
                idx++;
            }
            if (idx < dataStr.length) {
                idx++; // Skip closing quote
            }
            // Skip trailing whitespace/comma
            while (idx < dataStr.length && (dataStr[idx] === ' ' || dataStr[idx] === '\t')) {
                idx++;
            }
            if (idx < dataStr.length && dataStr[idx] === ',') {
                idx++;
            }
            return {
                value: isString ? str : (parseFloat(str) || 0),
                nextIndex: idx,
            };
        }
        // Parse unquoted value (number or unquoted string)
        let valueStr = '';
        while (idx < dataStr.length && dataStr[idx] !== ',') {
            valueStr += dataStr[idx];
            idx++;
        }
        valueStr = valueStr.trim();
        // Skip comma
        if (idx < dataStr.length && dataStr[idx] === ',') {
            idx++;
        }
        if (valueStr === '') {
            return null;
        }
        // Try to parse as number
        const num = parseFloat(valueStr);
        if (!isNaN(num)) {
            return {
                value: isString ? valueStr : num,
                nextIndex: idx,
            };
        }
        // Return as string
        return {
            value: isString ? valueStr : 0,
            nextIndex: idx,
        };
    }
    /**
     * RESTORE [linenum] - Reset data pointer
     */
    executeRestore(tokens) {
        this.state.tokenIndex++; // Skip RESTORE
        // Check for optional line number
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.NUMBER) {
            const targetLine = tokens[this.state.tokenIndex].value;
            this.state.tokenIndex++;
            if (!this.program.getLine(targetLine)) {
                throw new BasicError(ErrorCode.US);
            }
            this.state.dataPointer.lineNumber = targetLine;
            this.state.dataPointer.tokenIndex = 0;
        }
        else {
            // Reset to beginning
            this.state.dataPointer.lineNumber = 0;
            this.state.dataPointer.tokenIndex = 0;
        }
    }
    /**
     * DIM var(size), var(size, size), ...
     */
    executeDim(tokens) {
        this.state.tokenIndex++; // Skip DIM
        while (this.state.tokenIndex < tokens.length) {
            const token = tokens[this.state.tokenIndex];
            if (token.type === TokenType.EOL ||
                token.type === TokenType.COLON ||
                token.type === TokenType.EOF) {
                break;
            }
            if (token.type === TokenType.IDENTIFIER) {
                const varName = token.value;
                this.state.tokenIndex++;
                // Expect (
                if (tokens[this.state.tokenIndex]?.type !== TokenType.LPAREN) {
                    throw new BasicError(ErrorCode.SN);
                }
                this.state.tokenIndex++;
                // Parse dimensions
                const dimensions = [];
                while (this.state.tokenIndex < tokens.length) {
                    // Get dimension expression
                    const exprTokens = [];
                    let parenDepth = 0;
                    while (this.state.tokenIndex < tokens.length) {
                        const t = tokens[this.state.tokenIndex];
                        if (t.type === TokenType.LPAREN)
                            parenDepth++;
                        if (t.type === TokenType.RPAREN) {
                            if (parenDepth === 0)
                                break;
                            parenDepth--;
                        }
                        if (t.type === TokenType.COMMA && parenDepth === 0)
                            break;
                        exprTokens.push(t);
                        this.state.tokenIndex++;
                    }
                    const size = Math.trunc(this.evaluator.evaluateNumeric(exprTokens));
                    if (size < 0) {
                        throw new BasicError(ErrorCode.BS);
                    }
                    dimensions.push(size);
                    // Check for , or )
                    if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                        this.state.tokenIndex++;
                    }
                    else if (tokens[this.state.tokenIndex]?.type === TokenType.RPAREN) {
                        this.state.tokenIndex++;
                        break;
                    }
                    else {
                        throw new BasicError(ErrorCode.SN);
                    }
                }
                // Dimension the array
                this.memory.dimArray(varName, dimensions);
                // Skip comma between array declarations
                if (tokens[this.state.tokenIndex]?.type === TokenType.COMMA) {
                    this.state.tokenIndex++;
                }
            }
            else if (token.type === TokenType.COMMA) {
                this.state.tokenIndex++;
            }
            else {
                throw new BasicError(ErrorCode.SN);
            }
        }
    }
    /**
     * GET var - Read single character (Apple II specific)
     */
    async executeGet(tokens) {
        this.state.tokenIndex++; // Skip GET
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        const varName = tokens[this.state.tokenIndex].value;
        this.state.tokenIndex++;
        // Read single character
        const char = await this.console.readChar();
        // Store in variable
        if (varName.endsWith('$')) {
            this.memory.setVariable(varName, char);
        }
        else {
            // Store ASCII value for numeric variable
            this.memory.setVariable(varName, char.charCodeAt(0) || 0);
        }
    }
    /**
     * POKE address, value - Write byte to memory
     */
    executePoke(tokens) {
        this.state.tokenIndex++; // Skip POKE
        // Get address expression
        const addrTokens = this.getExpressionTokensUntil(tokens, TokenType.COMMA);
        if (addrTokens.length === 0) {
            throw new BasicError(ErrorCode.SN);
        }
        const address = Math.trunc(this.evaluator.evaluateNumeric(addrTokens));
        // Skip comma
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.COMMA) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Get value expression
        const valueTokens = this.getExpressionTokensUntil(tokens, TokenType.EOL, TokenType.COLON);
        if (valueTokens.length === 0) {
            throw new BasicError(ErrorCode.SN);
        }
        const value = Math.trunc(this.evaluator.evaluateNumeric(valueTokens));
        // Validate value is 0-255
        if (value < 0 || value > 255) {
            throw new BasicError(ErrorCode.FC); // Illegal Quantity
        }
        this.memoryMap.poke(address, value);
    }
    /**
     * WAIT address, mask [, xor] - Wait for memory condition
     * Polls memory location until (PEEK(address) XOR xor) AND mask <> 0
     */
    executeWait(tokens) {
        this.state.tokenIndex++; // Skip WAIT
        // Get address expression
        const addrTokens = this.getExpressionTokensUntil(tokens, TokenType.COMMA);
        if (addrTokens.length === 0) {
            throw new BasicError(ErrorCode.SN);
        }
        const address = Math.trunc(this.evaluator.evaluateNumeric(addrTokens));
        // Skip comma
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.COMMA) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Get mask expression
        const maskTokens = this.getExpressionTokensUntil(tokens, TokenType.COMMA, TokenType.EOL, TokenType.COLON);
        if (maskTokens.length === 0) {
            throw new BasicError(ErrorCode.SN);
        }
        const mask = Math.trunc(this.evaluator.evaluateNumeric(maskTokens));
        // Optional XOR value
        let xorValue = 0;
        if (this.state.tokenIndex < tokens.length &&
            tokens[this.state.tokenIndex].type === TokenType.COMMA) {
            this.state.tokenIndex++;
            const xorTokens = this.getExpressionTokensUntil(tokens, TokenType.EOL, TokenType.COLON);
            if (xorTokens.length > 0) {
                xorValue = Math.trunc(this.evaluator.evaluateNumeric(xorTokens));
            }
        }
        // In emulation, just check once (no infinite loop for safety)
        // Real hardware would poll until condition is true
        const value = this.memoryMap.peek(address);
        const result = (value ^ xorValue) & mask;
        // If result is 0, we'd normally keep waiting
        // For emulation, we just continue
    }
    /**
     * DEF FN name(var) = expression - Define user function
     */
    executeDef(tokens) {
        this.state.tokenIndex++; // Skip DEF
        // Expect FN keyword
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.FN) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Get function name
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        const funcName = 'FN' + tokens[this.state.tokenIndex].value;
        this.state.tokenIndex++;
        // Expect (
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.LPAREN) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Get parameter variable name
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.IDENTIFIER) {
            throw new BasicError(ErrorCode.SN);
        }
        const paramName = tokens[this.state.tokenIndex].value;
        this.state.tokenIndex++;
        // Expect )
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.RPAREN) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Expect =
        if (this.state.tokenIndex >= tokens.length ||
            tokens[this.state.tokenIndex].type !== TokenType.EQ) {
            throw new BasicError(ErrorCode.SN);
        }
        this.state.tokenIndex++;
        // Get expression tokens (rest of statement)
        const exprTokens = this.getExpressionTokensUntil(tokens, TokenType.EOL, TokenType.COLON);
        // Store the function definition
        this.userFunctions.set(funcName, {
            paramName,
            exprTokens: [...exprTokens], // Clone the tokens
        });
    }
}
//# sourceMappingURL=interpreter.js.map
