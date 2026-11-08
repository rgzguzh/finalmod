import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";

/**
 * Movement & self. CLIENT-tagged features work without host.
 * Hooks PlayerPhysics.LateUpdate once; all toggles are read per-frame.
 */
export class Movement {
    private static hooked = false;
    private static ventCache: Il2Cpp.Object[] = [];
    private static lastVentScan = 0;

    static init(): void {
        if (this.hooked) return;
        const physics = Game.cls("PlayerPhysics");
        if (!physics) {
            Logger.warn("[Movement] PlayerPhysics missing, skipped");
            return;
        }
        const lateUpdate = physics.tryMethod<void>("LateUpdate");
        if (!lateUpdate) {
            Logger.warn("[Movement] PlayerPhysics.LateUpdate missing, skipped");
            return;
        }

        lateUpdate.implementation = function (): void {
            try {
                Movement.tick();
            } catch (e) {
                /* never break gameplay */
            }
            this.method<void>("LateUpdate").invoke();
        };
        this.hooked = true;
        Logger.info("[Movement] hooks installed");
    }

    /** Per-frame movement logic. */
    private static tick(): void {
        const lp = Game.localPlayer;
        if (!lp) return;

        // ---- speedhack (CLIENT) ------------------------------------------
        const physics = lp.field<Il2Cpp.Object>("MyPhysics").value;
        if (physics && !physics.isNull()) {
            const baseSpeed = 2.5;
            const s = State.speedhack ? baseSpeed * State.speedMultiplier : baseSpeed;
            try {
                physics.field<number>("Speed").value = s;
                physics.field<number>("GhostSpeed").value = Math.max(3, s);
            } catch (e) {}
        }

        // ---- noclip (CLIENT) ---------------------------------------------
        const collider = lp.field<Il2Cpp.Object>("Collider").value;
        if (collider && !collider.isNull()) {
            try {
                collider.method<void>("set_enabled").invoke(!State.noclip);
            } catch (e) {}
        }

        // ---- invert controls (CLIENT) ------------------------------------
        if (State.invertControls) this.invertJoystick();

        // ---- freeze self (CLIENT) ----------------------------------------
        if (State.freezeSelf) {
            if (!this.frozenSelf) this.frozenSelf = Game.worldPos(lp);
            Game.snapTo(lp, this.frozenSelf.x, this.frozenSelf.y);
        } else {
            this.frozenSelf = null;
        }
    }

    private static frozenPos: { x: number; y: number } | null = null;
    private static frozenSelf: { x: number; y: number; z: number } | null = null;

    private static invertJoystick(): void {
        const hud = Game.hudManager;
        if (!hud) return;
        try {
            const joy = hud.field<Il2Cpp.Object>("joystick").value;
            if (!joy || joy.isNull()) return;
            const dir = joy.field<Il2Cpp.Object>("Direction").value;
            if (!dir) return;
            const x = dir.field<number>("x").value;
            const y = dir.field<number>("y").value;
            dir.field<number>("x").value = -x;
            dir.field<number>("y").value = -y;
        } catch (e) {}
    }

    // ---- public actions ---------------------------------------------------
    static setSpeed(mult: number): void {
        State.speedMultiplier = mult;
        State.speedhack = mult !== 1.0;
    }

    static teleportToPlayer(target: Il2Cpp.Object): void {
        const lp = Game.localPlayer;
        if (!lp || !target) return;
        Game.snapToPlayer(lp, target);
    }

    static teleportAllToMe(players: Il2Cpp.Object[]): number {
        const lp = Game.localPlayer;
        if (!lp) return 0;
        const p = Game.worldPos(lp);
        let n = 0;
        for (const pc of players) {
            if (pc.handle.equals(lp.handle)) continue;
            if (Game.snapTo(pc, p.x, p.y)) n++;
        }
        return n;
    }

    static teleportAllTo(target: Il2Cpp.Object, players: Il2Cpp.Object[]): number {
        const p = Game.worldPos(target);
        let n = 0;
        for (const pc of players) {
            if (pc.handle.equals(target.handle)) continue;
            if (Game.snapTo(pc, p.x, p.y)) n++;
        }
        return n;
    }

    static teleportToRandomVent(): boolean {
        const now = Date.now();
        if (now - this.lastVentScan > 5000 || this.ventCache.length === 0) {
            this.lastVentScan = now;
            this.ventCache = this.findVents();
        }
        if (this.ventCache.length === 0) return false;
        const vent = this.ventCache[Math.floor(Math.random() * this.ventCache.length)];
        const p = Game.worldPos(vent);
        const lp = Game.localPlayer;
        return lp ? Game.snapTo(lp, p.x, p.y) : false;
    }

    private static findVents(): Il2Cpp.Object[] {
        try {
            const ventCls = Game.cls("Vent");
            const resources = Game.cls("UnityEngine.Resources", "core");
            if (!ventCls || !resources) return [];
            const arr = resources.method<Il2Cpp.Array<Il2Cpp.Object>>("FindObjectsOfTypeAll", 1).invoke(ventCls.type.object);
            const out: Il2Cpp.Object[] = [];
            const len = (arr as any).length ?? 0;
            for (let i = 0; i < len; i++) {
                const v = arr.get(i);
                if (v && !v.isNull()) out.push(v);
            }
            return out;
        } catch (e) {
            return [];
        }
    }

    static freezePlayer(pc: Il2Cpp.Object): void {
        this.frozen[pc.handle.toString()] = Game.worldPos(pc);
    }

    private static frozen: Record<string, { x: number; y: number; z: number }> = {};

    static unfreezeAll(): void {
        this.frozen = {};
    }

    /** Keeps frozen players pinned; called from the frame hook. */
    static applyFreezes(players: Il2Cpp.Object[]): void {
        for (const pc of players) {
            const key = pc.handle.toString();
            const pos = this.frozen[key];
            if (pos) Game.snapTo(pc, pos.x, pos.y);
        }
    }
}
