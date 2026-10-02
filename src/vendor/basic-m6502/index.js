#!/usr/bin/env node
/**
 * Microsoft BASIC 1.1 for 6502 - TypeScript Port
 *
 * Entry point for the BASIC interpreter REPL.
 *
 * A faithful implementation targeting Apple II (REALIO=4)
 * Based on the original m6502.asm source code (1976-1978)
 */
import { readFileSync } from 'fs';
import { Interpreter } from './interpreter.js';
async function main() {
    const interpreter = new Interpreter();
    // Check for command line argument (file to load)
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const filename = args[0];
        try {
            const content = readFileSync(filename, 'utf-8');
            await interpreter.loadProgram(content);
            // If --run flag is passed, run immediately
            if (args.includes('--run') || args.includes('-r')) {
                await interpreter.run();
            }
            else {
                // Start REPL with program loaded
                await interpreter.repl();
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`?FILE NOT FOUND: ${filename}`);
                process.exit(1);
            }
            throw error;
        }
    }
    else {
        // No file specified - start interactive REPL
        await interpreter.repl();
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map