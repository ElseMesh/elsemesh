/**
 * Node.js console implementation
 */
import { ConsoleIO } from './console.js';
export declare class NodeConsole implements ConsoleIO {
    private rl;
    private currentColumn;
    readonly lineLength: number;
    readonly columnWidth: number;
    private rawModeEnabled;
    constructor();
    private initReadline;
    print(text: string): void;
    printLine(text: string): void;
    readLine(prompt?: string): Promise<string>;
    readChar(): Promise<string>;
    getPosition(): number;
    setPosition(col: number): void;
    clearScreen(): void;
    /**
     * Close the readline interface
     */
    close(): void;
}
