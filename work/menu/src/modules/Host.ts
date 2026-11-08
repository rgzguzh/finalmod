import { Game } from "../core/Game.js";
import { Logger } from "../utils/Logger.js";

/**
 * Host-only lobby controls.
 * Every method returns { ok, reason } so the UI can grey out or report.
 * The UI layer checks Game.isHost() before enabling these controls.
 */
export class Host {
    private static guard(): { ok: boolean; reason?: string } {
        if (!Game.isHost()) return { ok: false, reason: "Host only" };
        return { ok: true };
    }

    static forceImpostor(pc: Il2Cpp.Object): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            pc.method<void>("RpcSetRole", 2).invoke(1 /* Impostor */, true);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    static makeCrewmate(pc: Il2Cpp.Object): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            pc.method<void>("RpcSetRole", 2).invoke(0 /* Crewmate */, true);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    /** Swap the roles of two players. */
    static swapRoles(a: Il2Cpp.Object, b: Il2Cpp.Object): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            const ra = Game.roleType(a);
            const rb = Game.roleType(b);
            a.method<void>("RpcSetRole", 2).invoke(rb, true);
            b.method<void>("RpcSetRole", 2).invoke(ra, true);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    /** Assign a role to a list of players (used by the role scrambler). */
    static assignRole(players: Il2Cpp.Object[], roleType: number): number {
        if (!Game.isHost()) return 0;
        let n = 0;
        for (const p of players) {
            try {
                p.method<void>("RpcSetRole", 2).invoke(roleType, true);
                n++;
            } catch (e) {}
        }
        return n;
    }

    /** HOST: set impostor count via game options. */
    static setImpostorCount(count: number): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            const mgr = Game.cls("GameOptionsManager");
            if (!mgr) return { ok: false, reason: "GameOptionsManager missing" };
            const inst = mgr.tryMethod<Il2Cpp.Object>("get_Instance")?.invoke();
            if (!inst || inst.isNull()) return { ok: false, reason: "no options instance" };
            const opts = inst.tryMethod<Il2Cpp.Object>("get_CurrentGameOptions")?.invoke();
            if (!opts || opts.isNull()) return { ok: false, reason: "no game options" };
            opts.field<number>("NumImpostors").value = count;
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    static forceStart(): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            const gsm = Game.cls("GameStartManager");
            const inst = gsm?.tryMethod<Il2Cpp.Object>("get_Instance")?.invoke();
            const target = inst && !inst.isNull() ? inst : null;
            if (target) {
                target.method<void>("BeginGame").invoke();
                return { ok: true };
            }
            const client = Game.amongUsClient;
            client?.method<void>("CoStartGame").invoke();
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    /** HOST: end the game. crewWin=true -> impostors lose. */
    static endGame(crewWin: boolean): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            const gm = Game.cls("GameManager");
            const inst = gm?.tryMethod<Il2Cpp.Object>("get_Instance")?.invoke();
            if (!inst || inst.isNull()) return { ok: false, reason: "no GameManager" };
            // GameOverReason: CrewmatesByTask=1, ImpostorsByKill=3
            inst.method<void>("RpcEndGame", 2).invoke(crewWin ? 1 : 3, false);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }

    static randomizeColors(players: Il2Cpp.Object[]): number {
        const g = this.guard();
        if (!g.ok) return 0;
        let n = 0;
        for (const p of players) {
            const c = Math.floor(Math.random() * 18);
            try {
                p.method<void>("SetColor", 1).invoke(c);
                p.method<void>("RpcSetColor", 1).invoke(c);
                n++;
            } catch (e) {}
        }
        return n;
    }

    /** HOST: flip the map horizontally by negating the ship transform scale. */
    static flipMap(): { ok: boolean; reason?: string } {
        const g = this.guard();
        if (!g.ok) return g;
        try {
            const ship = Game.shipStatus;
            if (!ship) return { ok: false, reason: "no ShipStatus" };
            const tr = ship.method<Il2Cpp.Object>("get_transform").invoke();
            const scale = tr.method<Il2Cpp.Object>("get_localScale").invoke();
            const x = scale.field<number>("x").value;
            const y = scale.field<number>("y").value;
            const z = scale.field<number>("z").value;
            const v = Game.vector3(-x, y, z);
            if (v) tr.method<void>("set_localScale").invoke(v);
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: String(e) };
        }
    }
}
