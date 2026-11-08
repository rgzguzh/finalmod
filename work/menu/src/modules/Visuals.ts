import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";

const ROLE_NAMES: Record<number, string> = {
    0: "Crewmate",
    1: "Impostor",
    2: "Scientist",
    3: "Engineer",
    4: "GuardianAngel",
    5: "Shapeshifter",
    6: "CrewmateGhost",
    7: "ImpostorGhost",
    8: "Noisemaker",
    9: "Phantom",
    10: "Tracker",
    12: "Detective",
    18: "Viper",
    19: "Judge",
    21: "SpiritGuide"
};

const ROOM_NAMES: Record<number, string> = {
    0: "Hallway",
    1: "Storage",
    2: "Cafeteria",
    3: "Reactor",
    4: "UpperEngine",
    5: "Nav",
    6: "Admin",
    7: "Electrical",
    8: "LifeSupp",
    9: "Shields",
    10: "MedBay",
    11: "Security",
    12: "Weapons",
    13: "LowerEngine",
    14: "Comms",
    21: "Laboratory",
    23: "Office",
    24: "Greenhouse",
    25: "Balcony"
};

export interface KillLogEntry {
    time: string;
    killer: string;
    victim: string;
    room: string;
}

/** ESP / visual helpers. All CLIENT. */
export class Visuals {
    private static lastEsp = 0;
    private static visionHooked = false;
    private static zoomApplied = false;
    private static originalOrtho = -1;
    private static mapRooms: Il2Cpp.Object[] = [];
    private static lastRoomScan = 0;
    static killLog: KillLogEntry[] = [];

    /** Installs the kill-log hook and light-radius hook (idempotent). */
    static init(): void {
        this.hookKillLog();
        this.hookLightRadius();
    }

    private static hookKillLog(): void {
        const pc = Game.cls("PlayerControl");
        const m = pc?.tryMethod<void>("MurderPlayer", 2);
        if (!m) return;
        m.implementation = function (target: Il2Cpp.Object, flags: number): void {
            try {
                if (State.killLog) {
                    const killerName = Game.playerName(this as any);
                    const victimName = Game.playerName(target);
                    Visuals.pushKill({
                        time: new Date().toISOString().substr(11, 8),
                        killer: killerName,
                        victim: victimName,
                        room: Visuals.roomOf(target as any)
                    });
                }
            } catch (e) {}
            return this.method<void>("MurderPlayer", 2).invoke(target, flags);
        };
    }

    private static hookLightRadius(): void {
        if (this.visionHooked) return;
        const ship = Game.cls("ShipStatus");
        const m = ship?.tryMethod<number>("CalculateLightRadius", 1);
        if (!m) {
            Logger.warn("[Visuals] CalculateLightRadius missing (vision multiplier disabled)");
            return;
        }
        m.implementation = function (player: Il2Cpp.Object): number {
            const base = this.method<number>("CalculateLightRadius", 1).invoke(player) as unknown as number;
            const mult = State.visionMultiplier || 1.0;
            return base * mult;
        };
        this.visionHooked = true;
    }

    static pushKill(e: KillLogEntry): void {
        this.killLog.push(e);
        if (this.killLog.length > 50) this.killLog.shift();
        Logger.info(`[KillLog] ${e.time} ${e.killer} -> ${e.victim} @ ${e.room}`);
    }

    // ---- room lookup ------------------------------------------------------
    private static roomOf(pc: Il2Cpp.Object): string {
        try {
            const now = Date.now();
            if (now - this.lastRoomScan > 10000 || this.mapRooms.length === 0) {
                this.lastRoomScan = now;
                const k = Game.cls("MapRoom");
                const res = Game.cls("UnityEngine.Resources", "core");
                if (this.mapRooms.length === 0 && k && res) {
                    const arr = res.method<Il2Cpp.Array<Il2Cpp.Object>>("FindObjectsOfTypeAll", 1).invoke(k.type.object);
                    const len = (arr as any).length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const r = arr.get(i);
                        if (r && !r.isNull()) this.mapRooms.push(r);
                    }
                }
            }
            const p = Game.worldPos(pc);
            let best: Il2Cpp.Object | null = null;
            let bestD = Infinity;
            for (const room of this.mapRooms) {
                const rp = Game.worldPos(room);
                const d = (rp.x - p.x) ** 2 + (rp.y - p.y) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = room;
                }
            }
            if (!best) return "Unknown";
            const id = best.field<number>("room").value;
            return ROOM_NAMES[id] ?? `System#${id}`;
        } catch (e) {
            return "Unknown";
        }
    }

    // ---- per-frame ESP ----------------------------------------------------
    static update(): void {
        const now = Date.now();
        if (now - this.lastEsp < 250) return;
        this.lastEsp = now;

        const lp = Game.localPlayer;
        const players = Game.allPlayers();
        if (!lp) return;
        const lpos = Game.worldPos(lp);

        for (const pc of players) {
            try {
                const cosmetics = pc.field<Il2Cpp.Object>("cosmetics").value;
                if (!cosmetics || cosmetics.isNull()) continue;

                if (State.seeGhosts) {
                    // keep dead bodies' names visible while we are alive
                    const container = cosmetics.field<Il2Cpp.Object>("nameTextContainer").value;
                    if (container && !container.isNull()) container.method<void>("SetActive", 1).invoke(true);
                }

                if (!State.esp) continue;

                const nameText = cosmetics.field<Il2Cpp.Object>("nameText").value;
                if (!nameText || nameText.isNull()) continue;

                const pos = Game.worldPos(pc);
                const dist = Math.sqrt((pos.x - lpos.x) ** 2 + (pos.y - lpos.y) ** 2);
                let label = Game.playerName(pc);

                if (State.espRole) label += ` [${ROLE_NAMES[Game.roleType(pc)] ?? "?"}]`;
                if (State.espDistance) label += ` ${dist.toFixed(1)}m`;
                if (Game.isDead(pc)) label += " (dead)";

                nameText.method<void>("set_text", 1).invoke(Il2Cpp.string(label));
                nameText.method<void>("SetAllDirty", 0).invoke();

                if (State.revealImpostors) {
                    const isImpostor = Game.roleType(pc) === 1;
                    nameText.method<void>("set_color", 1).invoke(Game.color(isImpostor ? 255 : 255, isImpostor ? 0 : 255, isImpostor ? 0 : 255, 255));
                }
            } catch (e) {}
        }
    }

    // ---- fullbright / shadows --------------------------------------------
    static shadows(enable: boolean): void {
        try {
            const quad = Game.hudManager?.field<Il2Cpp.Object>("ShadowQuad").value;
            if (quad && !quad.isNull()) quad.method<void>("SetActive", 1).invoke(enable);
        } catch (e) {}
    }

    static vision(mult: number): void {
        try {
            const ship = Game.shipStatus;
            if (!ship) return;
            const base = ship.field<number>("MaxLightRadius").value;
            if (base > 0) ship.field<number>("MaxLightRadius").value = base * (mult > 1 ? mult : 1);
        } catch (e) {}
    }

    static zoom(out: boolean): void {
        try {
            const cam = Game.cls("UnityEngine.Camera", "core");
            if (!cam) return;
            const main = cam.method<Il2Cpp.Object>("get_main").invoke();
            if (!main || main.isNull()) return;
            const cur = main.method<number>("get_orthographicSize").invoke();
            if (this.originalOrtho < 0) this.originalOrtho = cur;
            const target = out ? this.originalOrtho * 1.6 : this.originalOrtho;
            if (Math.abs(cur - target) > 0.01) main.method<void>("set_orthographicSize", 1).invoke(target);
            this.zoomApplied = out;
        } catch (e) {}
    }

    // ---- radar ------------------------------------------------------------
    static radarLines(): string[] {
        const lp = Game.localPlayer;
        if (!lp) return [];
        const lpos = Game.worldPos(lp);
        const out: string[] = [];
        for (const pc of Game.allPlayers()) {
            if (pc.handle.equals(lp.handle)) continue;
            const p = Game.worldPos(pc);
            const dx = p.x - lpos.x;
            const dy = p.y - lpos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const arrow = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "N" : "S";
            out.push(`${Game.playerName(pc)} ${d.toFixed(1)}m ${arrow}${Game.isDead(pc) ? " [dead]" : ""}`);
        }
        return out;
    }
}
