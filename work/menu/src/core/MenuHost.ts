import { AssemblyHelper } from "./AssemblyHelper.js";
import { InGameMenu } from "../ui/InGameMenu.js";
import { Logger } from "../utils/Logger.js";

declare const Interceptor: any;

/**
 * Owns the in-game IMGUI surface.
 *
 * Unity only calls OnGUI on MonoBehaviour instances, so we reuse the game's own
 * DebugAnalytics (an Among Us DestroyableSingleton that implements OnGUI and
 * does nothing unless playtest analytics is enabled). We replace its OnGUI with
 * our renderer, and create the singleton GameObject if it is not alive yet.
 */
export class MenuHost {
    /** True while the game's gear/settings menu is open. */
    static optionsOpen = false;

    static installed = false;
    private static klass: Il2Cpp.Class | null = null;
    private static instance: Il2Cpp.Object | null = null;
    private static attempts = 0;
    private static readonly MAX_ATTEMPTS = 60;

    static install(): void {
        const asm = AssemblyHelper.AssemblyCSharp;
        if (!asm) throw new Error("Assembly-CSharp image not available");

        this.klass = asm.class("DebugAnalytics");

        this.hookOptionsMenu(asm);

        const ongui = this.klass.tryMethod<void>("OnGUI");
        if (!ongui) throw new Error("DebugAnalytics.OnGUI not found");
        ongui.implementation = function () {
            InGameMenu.frame();
        } as any;
        Logger.info("[MenuHost] OnGUI hooked");

        // Do not let DebugAnalytics do its own analytics bootstrap / debug draw.
        const start = this.klass.tryMethod<void>("Start");
        if (start) start.implementation = function () {} as any;

        this.installed = true;
        this.ensureInstance();
    }

    // ---- gear menu state --------------------------------------------------
    private static hookOptionsMenu(asm: Il2Cpp.Image): void {
        try {
            const om = asm.class("OptionsMenuBehaviour");
            const open = om.tryMethod<void>("Open");
            const close = om.tryMethod<void>("Close");
            if (open) {
                Interceptor.attach(open.virtualAddress, {
                    onEnter() {
                        MenuHost.optionsOpen = true;
                    }
                });
                Logger.info("[MenuHost] OptionsMenuBehaviour.Open watched");
            }
            if (close) {
                Interceptor.attach(close.virtualAddress, {
                    onEnter() {
                        MenuHost.optionsOpen = false;
                    }
                });
                Logger.info("[MenuHost] OptionsMenuBehaviour.Close watched");
            }
        } catch (e) {
            Logger.warn(`[MenuHost] options menu hooks: ${e}`);
        }
    }

    // ---- singleton lifecycle ---------------------------------------------
    private static ensureInstance(): void {
        if (this.instance && !this.instance.isNull()) return;
        try {
            Il2Cpp.perform(() => {
                try {
                    this.createInstance();
                } catch (e) {
                    this.attempts++;
                    if (this.attempts <= this.MAX_ATTEMPTS) {
                        Logger.warn(`[MenuHost] instance attempt ${this.attempts} failed: ${e}`);
                        setTimeout(() => this.ensureInstance(), 1000);
                    } else {
                        Logger.error("[MenuHost] giving up creating the IMGUI host");
                    }
                }
            }, "main");
        } catch (e) {
            Logger.error(`[MenuHost] main-thread schedule: ${e}`);
        }
    }

    private static createInstance(): void {
        if (this.instance && !this.instance.isNull()) return;

        // 1) already alive?
        const getter = this.klass!.tryMethod<Il2Cpp.Object>("get_Instance");
        if (getter) {
            try {
                const inst = getter.invoke();
                if (inst && !inst.isNull()) {
                    this.instance = inst;
                    Logger.info("[MenuHost] existing DebugAnalytics instance reused");
                    return;
                }
            } catch (e) {}
        }

        // 2) inflate DestroyableSingleton<DebugAnalytics> and ask it
        try {
            const generic = AssemblyHelper.AssemblyCSharp!.class("DestroyableSingleton`1");
            const inflated = generic.inflate(this.klass!);
            const inst = inflated.method<Il2Cpp.Object>("get_Instance").invoke();
            if (inst && !inst.isNull()) {
                this.instance = inst;
                Logger.info("[MenuHost] singleton Instance created");
                return;
            }
        } catch (e) {
            Logger.warn(`[MenuHost] generic Instance path: ${e}`);
        }

        // 3) create the GameObject ourselves
        const core = Il2Cpp.domain.assembly("UnityEngine.CoreModule").image;
        const go = core.class("UnityEngine.GameObject").alloc();
        go.method<void>(".ctor", 1).invoke(Il2Cpp.string("ModMenuIMGUI"));
        const comp = go.method<Il2Cpp.Object>("AddComponent", 1).invoke(this.klass!.type.object);
        core.class("UnityEngine.Object").method<void>("DontDestroyOnLoad", 1).invoke(go);
        if (!comp || comp.isNull()) throw new Error("AddComponent returned null");
        this.instance = comp;
        Logger.info("[MenuHost] IMGUI host GameObject created");
    }
}
