import { AssemblyHelper } from "./AssemblyHelper.js";
import { Logger } from "../utils/Logger.js";

/**
 * Central accessor for game objects. Everything is resolved lazily by name and
 * wrapped so that a signature change in a future game build degrades to a
 * logged warning instead of a crash.
 */
export class Game {
    private static classes: Record<string, Il2Cpp.Class | null> = {};

    // ---- class resolution -------------------------------------------------
    static cls(name: string, imageName: "csharp" | "core" | "tmp" = "csharp"): Il2Cpp.Class | null {
        const key = `${imageName}:${name}`;
        if (key in this.classes) return this.classes[key];

        const image =
            imageName === "csharp" ? AssemblyHelper.AssemblyCSharp : imageName === "core" ? AssemblyHelper.CoreModule : AssemblyHelper.TextMeshPro;
        // The UI can be built before IL2CPP is initialised; do not cache a miss
        // in that case or every later lookup would stay null forever.
        if (!image) return null;

        const resolved = AssemblyHelper.cls(image, name);
        this.classes[key] = resolved;
        if (!resolved) Logger.warn(`[Game] class not found: ${name} (${imageName})`);
        return resolved;
    }

    // ---- singletons -------------------------------------------------------
    static get amongUsClient(): Il2Cpp.Object | null {
        return this.singleton("AmongUsClient");
    }

    static get shipStatus(): Il2Cpp.Object | null {
        return this.singleton("ShipStatus");
    }

    static get hudManager(): Il2Cpp.Object | null {
        return this.singleton("HudManager");
    }

    static get hatManager(): Il2Cpp.Object | null {
        return this.singleton("HatManager");
    }

    static get localPlayer(): Il2Cpp.Object | null {
        const pc = this.cls("PlayerControl");
        if (!pc) return null;
        try {
            const p = pc.field<Il2Cpp.Object>("LocalPlayer").value;
            return p && !p.isNull() ? p : null;
        } catch (e) {
            return null;
        }
    }

    private static singleton(className: string): Il2Cpp.Object | null {
        const k = this.cls(className);
        if (!k) return null;
        try {
            const m = k.tryMethod<Il2Cpp.Object>("get_Instance");
            if (!m) return null;
            const inst = m.invoke();
            return inst && !inst.isNull() ? inst : null;
        } catch (e) {
            return null;
        }
    }

    // ---- collections ------------------------------------------------------
    /** Reads a System.Collections.Generic.List<T> into a plain array. */
    static list(list: Il2Cpp.Object | null): Il2Cpp.Object[] {
        if (!list || list.isNull()) return [];
        const out: Il2Cpp.Object[] = [];
        try {
            const count = list.method<number>("get_Count").invoke();
            const getItem = list.method<Il2Cpp.Object>("get_Item");
            for (let i = 0; i < count; i++) {
                const item = getItem.invoke(i);
                if (item && !item.isNull()) out.push(item);
            }
        } catch (e) {
            Logger.warn(`[Game.list] ${e}`);
        }
        return out;
    }

    /** All PlayerControl instances currently in the game. */
    static allPlayers(): Il2Cpp.Object[] {
        const pc = this.cls("PlayerControl");
        if (!pc) return [];
        try {
            const list = pc.field<Il2Cpp.Object>("AllPlayerControls").value;
            return this.list(list);
        } catch (e) {
            return [];
        }
    }

    static playerName(pc: Il2Cpp.Object): string {
        try {
            const data = this.data(pc);
            if (!data) return "?";
            const n = data.field<Il2Cpp.String>("PlayerName").value;
            return n ? n.toString() : "?";
        } catch (e) {
            return "?";
        }
    }

    static data(pc: Il2Cpp.Object): Il2Cpp.Object | null {
        try {
            const d = pc.method<Il2Cpp.Object>("get_Data").invoke();
            return d && !d.isNull() ? d : null;
        } catch (e) {
            return null;
        }
    }

    // ---- host / state -----------------------------------------------------
    static isHost(): boolean {
        const client = this.amongUsClient;
        if (!client) return false;
        try {
            const m = client.class.tryMethod<boolean>("get_AmHost");
            if (m) return m.invoke();
            return client.method<boolean>("get_AmHost").invoke();
        } catch (e) {
            return false;
        }
    }

    static isDead(pc: Il2Cpp.Object): boolean {
        const d = this.data(pc);
        if (!d) return false;
        try {
            return d.field<boolean>("IsDead").value;
        } catch (e) {
            return false;
        }
    }

    static roleType(pc: Il2Cpp.Object): number {
        const d = this.data(pc);
        if (!d) return -1;
        try {
            // RoleType is a ushort-backed enum at 0x50 in 2026.11.3
            return d.field<number>("RoleType").value;
        } catch (e) {
            return -1;
        }
    }

    static colorId(pc: Il2Cpp.Object): number {
        const d = this.data(pc);
        if (!d) return -1;
        try {
            return d.field<number>("ColorId").value;
        } catch (e) {
            return -1;
        }
    }

    // ---- math / transforms ------------------------------------------------
    static worldPos(obj: Il2Cpp.Object): { x: number; y: number; z: number } {
        try {
            const tr = obj.method<Il2Cpp.Object>("get_transform").invoke();
            const pos = tr.method<Il2Cpp.Object>("get_position").invoke();
            return { x: pos.field<number>("x").value, y: pos.field<number>("y").value, z: pos.field<number>("z").value };
        } catch (e) {
            return { x: 0, y: 0, z: 0 };
        }
    }

    static vector2(x: number, y: number): Il2Cpp.ValueType | null {
        try {
            const k = this.cls("UnityEngine.Vector2", "core");
            if (!k) return null;
            const v = k.alloc();
            v.method(".ctor").invoke(x, y);
            return v.unbox();
        } catch (e) {
            return null;
        }
    }

    static vector3(x: number, y: number, z: number): Il2Cpp.ValueType | null {
        try {
            const k = this.cls("UnityEngine.Vector3", "core");
            if (!k) return null;
            const v = k.alloc();
            v.method(".ctor").invoke(x, y, z);
            return v.unbox();
        } catch (e) {
            return null;
        }
    }

    /** Builds a UnityEngine.Color (normalized 0..1 like the game expects). */
    static color(r: number, g: number, b: number, a = 255): Il2Cpp.ValueType | null {
        try {
            const k = this.cls("UnityEngine.Color", "core");
            if (!k) return null;
            const v = k.alloc();
            v.method(".ctor").invoke(r / 255, g / 255, b / 255, a / 255);
            return v.unbox();
        } catch (e) {
            return null;
        }
    }

    /** RpcSnapTo the given PlayerControl to a world position (client-authoritative on own body). */
    static snapTo(pc: Il2Cpp.Object, x: number, y: number): boolean {
        try {
            const nt = pc.field<Il2Cpp.Object>("NetTransform").value;
            if (!nt || nt.isNull()) return false;
            const v = this.vector2(x, y);
            if (!v) return false;
            nt.method<void>("RpcSnapTo").invoke(v);
            return true;
        } catch (e) {
            Logger.error(`[Game.snapTo] ${e}`);
            return false;
        }
    }

    static snapToPlayer(mover: Il2Cpp.Object, target: Il2Cpp.Object): boolean {
        const p = this.worldPos(target);
        return this.snapTo(mover, p.x, p.y);
    }

    // ---- messaging --------------------------------------------------------
    /** Sends a chat message as the given player (spoof). */
    static sendChatAs(sender: Il2Cpp.Object, text: string): boolean {
        try {
            const str = Il2Cpp.string(text);
            // PlayerControl.RpcSendChat(string) is the per-player chat RPC; invoking it on
            // another player's object makes the bubble appear under that player.
            const rpc = sender.tryMethod<boolean>("RpcSendChat", 1);
            if (rpc) {
                rpc.invoke(str);
                return true;
            }
            const ctrl = this.hudManager?.field<Il2Cpp.Object>("Chat").value;
            const send = ctrl?.tryMethod<void>("SendChat");
            if (send) {
                send.invoke();
                return true;
            }
            return false;
        } catch (e) {
            Logger.error(`[Game.sendChatAs] ${e}`);
            return false;
        }
    }

    /** Ensures a block runs on the Unity main thread. */
    static onMain(fn: () => void, label = "main"): void {
        try {
            Il2Cpp.perform(fn, "main");
        } catch (e) {
            Logger.error(`[Game.onMain:${label}] ${e}`);
        }
    }
}
