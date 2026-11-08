import { Logger } from "../utils/Logger.js";

/**
 * Thin wrapper over Unity's IMGUI (UnityEngine.GUI) reached through IL2CPP.
 * All calls must happen inside an OnGUI callback on the Unity main thread.
 */
export class Gui {
    private static GUI: Il2Cpp.Class | null = null;
    private static RectC: Il2Cpp.Class | null = null;
    private static GUIContentC: Il2Cpp.Class | null = null;
    private static ScreenC: Il2Cpp.Class | null = null;

    static ready = false;
    static fontSize = 28;
    private static stylesReady = false;

    static init(): void {
        if (this.ready) return;
        const imgui = Il2Cpp.domain.assembly("UnityEngine.IMGUIModule").image;
        const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
        this.GUI = imgui.class("UnityEngine.GUI");
        this.GUIContentC = imgui.class("UnityEngine.GUIContent");
        this.RectC = core.class("UnityEngine.Rect");
        this.ScreenC = core.class("UnityEngine.Screen");
        this.ready = true;
        Logger.info("[Gui] IMGUI resolved");
    }

    // ---- primitives -------------------------------------------------------
    static width(): number {
        return this.ScreenC!.method<number>("get_width").invoke();
    }

    static height(): number {
        return this.ScreenC!.method<number>("get_height").invoke();
    }

    private static rect(x: number, y: number, w: number, h: number): Il2Cpp.ValueType {
        const r = this.RectC!.alloc();
        r.method<void>(".ctor", 4).invoke(x, y, w, h);
        return r.unbox();
    }

    private static content(text: string): Il2Cpp.Object {
        const c = this.GUIContentC!.alloc();
        c.method<void>(".ctor", 1).invoke(Il2Cpp.string(text));
        return c;
    }

    private static style(name: string): Il2Cpp.Object {
        const skin = this.GUI!.method<Il2Cpp.Object>("get_skin").invoke();
        return skin.method<Il2Cpp.Object>(`get_${name}`).invoke();
    }

    /** Called once per frame; sizes the built-in skin so text is legible on a phone. */
    static tune(): void {
        if (this.stylesReady) return;
        try {
            for (const name of ["label", "button", "box", "toggle"]) {
                const s = this.style(name);
                s.method<void>("set_fontSize", 1).invoke(this.fontSize);
            }
            const skin = this.GUI!.method<Il2Cpp.Object>("get_skin").invoke();
            const font = skin.method<Il2Cpp.Object>("get_font").invoke();
            if (!font.isNull()) {
                font.method<void>("set_fontSize", 1).invoke(this.fontSize);
            }
            this.stylesReady = true;
        } catch (e) {
            // Skin may be null on the very first GUI event; retry next frame.
        }
    }

    // ---- widgets ----------------------------------------------------------
    static label(x: number, y: number, w: number, h: number, text: string): void {
        this.GUI!.method<void>("Label", 2).invoke(this.rect(x, y, w, h), Il2Cpp.string(text));
    }

    static box(x: number, y: number, w: number, h: number, text: string): void {
        this.GUI!.method<void>("Box", 2).invoke(this.rect(x, y, w, h), Il2Cpp.string(text));
    }

    static button(x: number, y: number, w: number, h: number, text: string): boolean {
        return !!this.GUI!.method<boolean>("Button", 3).invoke(this.rect(x, y, w, h), this.content(text), this.style("button"));
    }

    static toggle(x: number, y: number, w: number, h: number, text: string, value: boolean): boolean {
        return !!this.GUI!.method<boolean>("Toggle", 4).invoke(
            this.rect(x, y, w, h),
            value,
            this.content(text),
            this.style("toggle")
        );
    }
}
