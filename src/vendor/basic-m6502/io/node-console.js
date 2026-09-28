/**
 * Node.js console implementation
 */
import * as readline from 'readline';
import { CONFIG } from '../config.js';
export class NodeConsole {
    rl = null;
    currentColumn = 0;
    lineLength = CONFIG.lineLength;
    columnWidth = CONFIG.columnWidth;
    rawModeEnabled = false;
    constructor() {
        this.initReadline();
    }
    initReadline() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }
    print(text) {
        process.stdout.write(text);
        // Update column position
        for (const char of text) {
            if (char === '\n') {
                this.currentColumn = 0;
            }
            else if (char === '\r') {
                this.currentColumn = 0;
            }
            else {
                this.currentColumn++;
                if (this.currentColumn >= this.lineLength) {
                    this.currentColumn = 0;
                }
            }
        }
    }
    printLine(text) {
        console.log(text);
        this.currentColumn = 0;
    }
    async readLine(prompt) {
        return new Promise((resolve) => {
            if (!this.rl) {
                this.initReadline();
            }
            this.rl.question(prompt ?? '', (answer) => {
                this.currentColumn = 0;
                resolve(answer);
            });
        });
    }
    async readChar() {
        // GET statement - single character, no echo, no wait for Enter
        return new Promise((resolve) => {
            if (process.stdin.isTTY && !this.rawModeEnabled) {
                process.stdin.setRawMode(true);
                this.rawModeEnabled = true;
            }
            const onData = (data) => {
                process.stdin.removeListener('data', onData);
                if (this.rawModeEnabled) {
                    process.stdin.setRawMode(false);
                    this.rawModeEnabled = false;
                }
                const char = data.toString()[0];
                // Handle Ctrl-C
                if (char === '\x03') {
                    process.exit();
                }
                resolve(char);
            };
            process.stdin.once('data', onData);
        });
    }
    getPosition() {
        return this.currentColumn;
    }
    setPosition(col) {
        while (this.currentColumn < col && this.currentColumn < this.lineLength) {
            this.print(' ');
        }
    }
    clearScreen() {
        console.clear();
        this.currentColumn = 0;
    }
    /**
     * Close the readline interface
     */
    close() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }
}
//# sourceMappingURL=node-console.js.map