import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";

/** SystemTypes values from dump.cs (Among Us 2026.11.3). */
export const Sys = {
    Reactor: 3,
    Electrical: 7,
    LifeSupp: 8,
    Comms: 14,
    Doors: 16,
    Sabotage: 17,
    Decontamination: 18,
    MushroomMixupSabotage: 57,
    HeliSabotage: 58
};

/**
 * Sabotage module.
 *
 * Crewmate sabotage works because the host's system handlers (SabotageSystemType /
 * DoorsSystemType) do not validate the sender's role - they only validate the
 * system id. We therefore only need a valid RpcUpdateSystem call, which is why
 * this is CLIENT-capable (and still valid as host).
 */
export class Sabotage {
    private static loopTimer = 0;
    private static hooked = false;

    static init(): void {
        if (this.hooked) return;
        this.hooked = true;
        Logger.info("[Sabotage] ready");
    }

    private static rpc(systemType: number, amount: number): boolean {
        const ship = Game.shipStatus;
        if (!ship) return false;
        try {
            ship.method<void>("RpcUpdateSystem", 2).invoke(systemType, amount);
            return true;
        } catch (e) {
            Logger.error(`[Sabotage.rpc] ${e}`);
            return false;
        }
    }

    /** Start a sabotage by its SystemTypes id. Works for crewmates (no role check on host). */
    static sabotage(systemType: number): boolean {
        return this.rpc(Sys.Sabotage, systemType);
    }

    static lights(): boolean {
        return this.sabotage(Sys.Electrical);
    }
    static comms(): boolean {
        return this.sabotage(Sys.Comms);
    }
    static o2(): boolean {
        return this.sabotage(Sys.LifeSupp);
    }
    static reactor(): boolean {
        return this.sabotage(Sys.Reactor);
    }
    static mushrooms(): boolean {
        return this.sabotage(Sys.MushroomMixupSabotage);
    }
    static helicrash(): boolean {
        return this.sabotage(Sys.HeliSabotage);
    }

    static sabotageAll(): number {
        const targets = [Sys.Electrical, Sys.Comms, Sys.LifeSupp, Sys.Reactor];
        return targets.filter(t => this.sabotage(t)).length;
    }

    /** CLIENT: close doors of a specific room. amount = CloseDoors(128) | roomId. */
    static closeDoorsOf(room: number): boolean {
        const ship = Game.shipStatus;
        if (!ship) return false;
        try {
            ship.method<void>("RpcCloseDoorsOfType", 1).invoke(room);
            return true;
        } catch (e) {
            // fall back to the low level encoding
            return this.rpc(Sys.Doors, 128 | (room & 31));
        }
    }

    /** CLIENT: lock every door on the map. */
    static lockAllDoors(rooms = 16): number {
        let n = 0;
        for (let r = 0; r < rooms; r++) if (this.closeDoorsOf(r)) n++;
        return n;
    }

    /** CLIENT: repair critical sabotages from anywhere. */
    static repairAll(): number {
        const ship = Game.shipStatus;
        let n = 0;
        try {
            ship?.method<void>("RepairCriticalSabotages").invoke();
            n++;
        } catch (e) {}
        // also clear lights/comms
        try {
            ship?.method<void>("RpcUpdateSystem", 2).invoke(Sys.Electrical, 16);
            n++;
        } catch (e) {}
        try {
            ship?.method<void>("RpcUpdateSystem", 2).invoke(Sys.Comms, 16);
            n++;
        } catch (e) {}
        return n;
    }

    /** Per-frame driver for the sabotage loop / roulette. */
    static tick(): void {
        if (!State.sabotageLoop) return;
        const now = Date.now();
        if (now - this.loopTimer < 8000) return;
        this.loopTimer = now;
        this.sabotage(State.sabotageLoopSystem);
    }

    /** Original feature: chance-based random non-critical sabotage after a finished task. */
    static rouletteRoll(): void {
        if (!State.sabotageRoulette) return;
        if (Math.random() * 100 > State.rouletteChance) return;
        const pool = [Sys.Electrical, Sys.Comms];
        this.sabotage(pool[Math.floor(Math.random() * pool.length)]);
        Logger.info("[Sabotage] roulette triggered");
    }
}
