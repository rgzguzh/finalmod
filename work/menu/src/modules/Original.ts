import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";

/**
 * Original features from the task spec.
 *  1. Task Mimicry  - stand still near a task for N seconds -> play its animation
 *  2. UwUify        - transform all rendered text
 *  3. Role Scrambler support (data lives here; host-only action is in Host.ts)
 */
export class Original {
    private static hooked = false;
    private static lastPos = { x: 0, y: 0 };
    private static idleSince = 0;
    private static mimicCooldownUntil = 0;

    /** role scrambler assignment: distinct player index -> RoleTypes */
    static roleScramble: Record<number, number> = {};

    static init(): void {
        if (this.hooked) return;
        this.hookUwu();
        this.hooked = true;
    }

    private static hookUwu(): void {
        // TMPro text setters; hooking both variants is harmless if one is absent.
        for (const clsName of ["TMPro.TextMeshPro", "TMPro.TextMeshProUGUI"]) {
            const k = Game.cls(clsName, "tmp");
            const m = k?.tryMethod<void>("set_text", 1);
            if (!m) continue;
            m.implementation = function (text: Il2Cpp.String): void {
                let out = text;
                if (State.uwuify && text) {
                    out = Il2Cpp.string(Original.uwu(text.toString()));
                }
                return this.method<void>("set_text", 1).invoke(out);
            };
        }
    }

    static uwu(s: string): string {
        return s
            .replace(/[rl]/g, "w")
            .replace(/[RL]/g, "W")
            .replace(/n([aeiou])/g, "ny$1")
            .replace(/N([aeiou])/g, "Ny$1")
            .replace(/ove/g, "uv")
            .replace(/!+/g, "! uwu");
    }

    /** Called every frame from the HUD hook. */
    static tickTaskMimicry(): void {
        if (!State.taskMimicry) {
            this.idleSince = 0;
            return;
        }
        const lp = Game.localPlayer;
        if (!lp) return;
        const now = Date.now();
        const pos = Game.worldPos(lp);
        const moved = Math.abs(pos.x - this.lastPos.x) > 0.15 || Math.abs(pos.y - this.lastPos.y) > 0.15;
        this.lastPos = pos;

        if (moved) {
            this.idleSince = now;
            return;
        }
        if (this.idleSince === 0) {
            this.idleSince = now;
            return;
        }
        if (now - this.idleSince < State.taskMimicrySeconds * 1000) return;
        if (now < this.mimicCooldownUntil) return;

        this.mimicCooldownUntil = now + 8000;
        this.idleSince = now;
        this.playNearestTaskAnimation(pos.x, pos.y);
    }

    private static playNearestTaskAnimation(px: number, py: number): void {
        try {
            const consoleCls = Game.cls("Console");
            const res = Game.cls("UnityEngine.Resources", "core");
            if (!consoleCls || !res) return;
            const arr = res.method<Il2Cpp.Array<Il2Cpp.Object>>("FindObjectsOfTypeAll", 1).invoke(consoleCls.type.object);
            const len = (arr as any).length ?? 0;
            let best: Il2Cpp.Object | null = null;
            let bestD = 2.5 * 2.5; // only act when genuinely near a console
            for (let i = 0; i < len; i++) {
                const c = arr.get(i);
                if (!c || c.isNull()) continue;
                const p = Game.worldPos(c);
                const d = (p.x - px) ** 2 + (p.y - py) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            if (best) {
                best.method<void>("Use").invoke();
                Logger.info("[Original] task mimicry played");
            }
        } catch (e) {
            Logger.warn(`[Original.playNearestTaskAnimation] ${e}`);
        }
    }

    // ---- role scrambler ---------------------------------------------------
    static setScramble(playerIndex: number, roleType: number): void {
        this.roleScramble[playerIndex] = roleType;
    }

    static applyScramble(players: Il2Cpp.Object[], host: { assignRole: (p: Il2Cpp.Object[], r: number) => number }): number {
        let n = 0;
        for (const key of Object.keys(this.roleScramble)) {
            const idx = parseInt(key, 10);
            const pc = players[idx];
            if (!pc) continue;
            n += host.assignRole([pc], this.roleScramble[idx]);
        }
        return n;
    }
}
