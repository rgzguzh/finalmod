declare const File: any;

/**
 * File logger that uses Frida's own native File API (libc) instead of the Java
 * bridge. This is deliberate: if the Java bridge or an Android permission is the
 * thing that broke, logging must still work, otherwise the failure is invisible.
 */
export class Logger {
    private static readonly TAG = "AUMenu";
    private static readonly FILE = "modmenu.log";
    private static readonly DIRS = [
        "/storage/emulated/0/Android/data/com.innersloth.spacemafia.mod/files",
        "/data/data/com.innersloth.spacemafia.mod/files"
    ];

    private static filePath: string | null = null;
    private static dirChecked = false;
    private static disabled = false;
    private static lines: string[] = [];

    // ---- filesystem -------------------------------------------------------
    private static mkdirs(dir: string): void {
        try {
            const mkdir = new NativeFunction(Module.getExportByName("libc.so", "mkdir"), "int", ["pointer", "int"]);
            const parts = dir.split("/").filter(p => p.length > 0);
            let current = "";
            for (const part of parts) {
                current += `/${part}`;
                try {
                    mkdir(Memory.allocUtf8String(current), 0o700);
                } catch (e) {}
            }
        } catch (e) {}
    }

    private static open(): void {
        if (this.dirChecked || this.disabled) return;
        this.dirChecked = true;
        for (const dir of this.DIRS) {
            try {
                this.mkdirs(dir);
                const path = `${dir}/${this.FILE}`;
                const f = new File(path, "a");
                f.write("");
                f.flush();
                f.close();
                this.filePath = path;
                return;
            } catch (e) {}
        }
        this.disabled = true;
    }

    private static toFile(line: string): void {
        try {
            this.open();
            if (this.filePath === null) return;
            const f = new File(this.filePath, "a");
            f.write(`${line}\n`);
            f.flush();
            f.close();
        } catch (e) {
            this.disabled = true;
        }
    }

    // ---- formatting -------------------------------------------------------
    private static stamp(): string {
        try {
            return new Date().toISOString().substring(11, 23);
        } catch (e) {
            return "??:??:??";
        }
    }

    private static emit(level: string, msg: string): void {
        const line = `[${this.stamp()}] ${level} ${msg}`;
        console.log(`${this.TAG} ${level} ${msg}`);
        this.toFile(line);
        this.lines.push(line);
        if (this.lines.length > 80) this.lines.splice(0, this.lines.length - 80);
    }

    // ---- public api -------------------------------------------------------
    static info(msg: string): void {
        this.emit("I", msg);
        try {
            send({ t: "info", m: msg });
        } catch (e) {}
    }

    static warn(msg: string): void {
        this.emit("W", msg);
        try {
            send({ t: "warn", m: msg });
        } catch (e) {}
    }

    static error(msg: string): void {
        this.emit("E", msg);
        try {
            send({ t: "error", m: msg });
        } catch (e) {}
    }

    /** Runs a block, logging instead of throwing. */
    static safe<T>(label: string, fn: () => T): T | undefined {
        try {
            return fn();
        } catch (e) {
            this.error(`${label}: ${e}`);
            return undefined;
        }
    }

    static path(): string {
        this.open();
        return this.filePath ?? "log disabled (no writable dir)";
    }

    static tail(count = 8): string[] {
        return this.lines.slice(-count);
    }

    static clear(): void {
        try {
            this.open();
            if (this.filePath === null) return;
            const f = new File(this.filePath, "w");
            f.write(`[${this.stamp()}] I log cleared\n`);
            f.flush();
            f.close();
            this.lines.length = 0;
        } catch (e) {}
    }
}
