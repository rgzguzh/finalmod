import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";
import { Sabotage } from "./Sabotage.js";

/**
 * Roles, tasks, cosmetics and account.
 * All of these are CLIENT-capable; host versions are also applied when hosting.
 */
export class Roles {
    // ---- role -------------------------------------------------------------
    /** CLIENT: change your own role client-side; HOST: real RpcSetRole. */
    static setOwnRole(roleType: number): { visual: boolean; real: boolean } {
        const lp = Game.localPlayer;
        if (!lp) return { visual: false, real: false };
        let visual = false;
        try {
            const data = Game.data(lp);
            if (data) {
                data.field<number>("RoleType").value = roleType;
                visual = true;
            }
        } catch (e) {}

        let real = false;
        if (Game.isHost()) {
            try {
                lp.method<void>("RpcSetRole", 2).invoke(roleType, true);
                real = true;
            } catch (e) {
                Logger.warn(`[Roles.setOwnRole] ${e}`);
            }
        }
        return { visual, real };
    }

    /** CLIENT: pretend to be an impostor to yourself (sabotage UI / kill button). */
    static fakeImpostor(on: boolean): void {
        State.revealImpostors = State.revealImpostors; // no-op guard
        this.setOwnRole(on ? 1 : 0);
    }

    /** HOST: force a specific player's role. */
    static forceRole(pc: Il2Cpp.Object, roleType: number): boolean {
        try {
            pc.method<void>("RpcSetRole", 2).invoke(roleType, true);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ---- tasks ------------------------------------------------------------
    static completeMyTasks(): number {
        const lp = Game.localPlayer;
        if (!lp) return 0;
        return this.completeTasksOf(lp);
    }

    static completeTasksOf(pc: Il2Cpp.Object): number {
        let n = 0;
        try {
            const list = pc.field<Il2Cpp.Object>("myTasks").value;
            const tasks = Game.list(list);
            for (const t of tasks) {
                try {
                    const id = t.method<number>("get_Id").invoke();
                    pc.method<void>("RpcCompleteTask", 1).invoke(id);
                    n++;
                } catch (e) {}
            }
        } catch (e) {
            Logger.warn(`[Roles.completeTasksOf] ${e}`);
        }
        // trigger the sabotage roulette original feature
        if (n > 0) Sabotage.rouletteRoll();
        return n;
    }

    // ---- cosmetics / outfit ----------------------------------------------
    static copyOutfit(from: Il2Cpp.Object): boolean {
        const lp = Game.localPlayer;
        if (!lp) return false;
        try {
            const d = Game.data(from);
            if (!d) return false;
            const outfit = d.field<Il2Cpp.Object>("DefaultOutfit").value;
            const hat = outfit.field<Il2Cpp.String>("HatId").value;
            const skin = outfit.field<Il2Cpp.String>("SkinId").value;
            const visor = outfit.field<Il2Cpp.String>("VisorId").value;
            const pet = outfit.field<Il2Cpp.String>("PetId").value;
            const plate = outfit.field<Il2Cpp.String>("NamePlateId").value;
            const color = outfit.field<number>("ColorId").value;

            lp.method<void>("SetHat", 2).invoke(hat, color);
            lp.method<void>("SetSkin", 2).invoke(skin, color);
            lp.method<void>("SetVisor", 2).invoke(visor, color);
            lp.method<void>("SetPet", 2).invoke(pet, color);
            lp.method<void>("SetNamePlate", 1).invoke(plate);
            lp.method<void>("SetColor", 1).invoke(color);
            return true;
        } catch (e) {
            Logger.error(`[Roles.copyOutfit] ${e}`);
            return false;
        }
    }

    // ---- account ----------------------------------------------------------
    static setLevel(level: number): boolean {
        const lp = Game.localPlayer;
        if (!lp) return false;
        try {
            const d = Game.data(lp);
            if (d) d.field<number>("PlayerLevel").value = level;
            try {
                lp.method<void>("RpcSetLevel", 1).invoke(level);
            } catch (e) {}
            return true;
        } catch (e) {
            return false;
        }
    }

    static setDisplayName(name: string): boolean {
        const lp = Game.localPlayer;
        if (!lp || !name) return false;
        try {
            lp.method<void>("SetName", 1).invoke(Il2Cpp.string(name));
            if (Game.isHost()) {
                try {
                    lp.method<void>("RpcSetName", 1).invoke(Il2Cpp.string(name));
                } catch (e) {}
            }
            return true;
        } catch (e) {
            Logger.error(`[Roles.setDisplayName] ${e}`);
            return false;
        }
    }
}
