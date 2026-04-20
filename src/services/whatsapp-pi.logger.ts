export class WhatsAppPiLogger {
    constructor(private verbose = false) {}

    setVerbose(verbose: boolean) {
        this.verbose = verbose;
    }

    info(message: string, ...args: unknown[]) {
        console.log(message, ...args);
    }

    log(message: string, ...args: unknown[]) {
        if (this.verbose) {
            console.log(message, ...args);
        }
    }

    warn(message: string, ...args: unknown[]) {
        if (this.verbose) {
            console.warn(message, ...args);
        }
    }

    error(message: string, ...args: unknown[]) {
        if (this.verbose) {
            console.error(message, ...args);
        }
    }
}
