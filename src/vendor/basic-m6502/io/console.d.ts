/**
 * Abstract console interface for platform-independent I/O.
 * Implementations provided for Node.js terminal and browser DOM.
 */
export interface ConsoleIO {
    print(text: string): void;
    printLine(text: string): void;
    readLine(prompt?: string): Promise<string>;
    readChar(): Promise<string>;
    clearScreen(): void;
    getPosition(): number;
    setPosition(col: number): void;
    readonly lineLength: number;
    readonly columnWidth: number;
}
