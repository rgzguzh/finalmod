import { Gui } from "../core/Gui.js";
import { MenuHost } from "../core/MenuHost.js";
import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";
import { Movement } from "../modules/Movement.js";
import { Visuals } from "../modules/Visuals.js";
import { Roles } from "../modules/Roles.js";
import { Troll } from "../modules/Troll.js";
import { Sabotage, Sys } from "../modules/Sabotage.js";
import { Host } from "../modules/Host.js";
import { Passive } from "../modules/Passive.js";
import { Original } from "../modules/Original.js";

const VERSION = "2.0.0";

/**
 * The mod menu rendered with Unity IMGUI from inside the game's own OnGUI.
 * No Android window, no SYSTEM_ALERT_WINDOW, no Java.
 */
export class InGameMenu {
    private static open = false;
    private static page = 0;
    private static row = 0;
    private static fakeImpostorOn = false;

    private static status = "";
    private static statusUntil = 0;

    private static errors = 0;
    private static dead = false;

    // current layout
    private static px = 0;
    private static py = 0;
    private static pw = 0;
    private static rowH = 60;
    private static colW = 400;
    private static bodyTop = 0;

    private static readonly PAGES = [
        "MAIN",
        "ROLES",
        "PLAYERS",
        "TARGET",
        "SABOTAGE",
        "CHAT",
        "HOST",
        "DIAG"
    ];

    // ---- frame ------------------------------------------------------------
    static frame(): void {
        if (this.dead) return;
        try {
            if (!Gui.ready) Gui.init();
            Gui.tune();
            this.render();
            this.errors = 0;
        } catch (e) {
            this.errors++;
            if (this.errors === 1) Logger.error(`[Menu] OnGUI: ${e}`);
            if (this.errors > 120) {
                this.dead = true;
                Logger.error("[Menu] disabled rendering after repeated OnGUI errors");
            }
        }
    }

    private static render(): void {
        const w = Gui.width();
        const h = Gui.height();
        Gui.fontSize = Math.max(18, Math.round(h * 0.026));

        if (this.open) {
            this.drawPanel(w, h);
        } else {
            this.drawChip(w, h);
        }

        // Extra entry point inside the game's gear menu.
        if (!this.open && MenuHost.optionsOpen) {
            const bw = Math.round(Math.min(w * 0.3, 460));
            const bh = Math.round(h * 0.06);
            if (Gui.button(Math.round(w / 2 - bw / 2), Math.round(h * 0.9), bw, bh, "MOD MENU")) {
                this.open = true;
            }
        }
    }

    private static drawChip(w: number, h: number): void {
        const bw = Math.round(w * 0.09);
        const bh = Math.round(h * 0.06);
        if (Gui.button(Math.round(w * 0.012), Math.round(h * 0.012), bw, bh, "MOD")) {
            this.open = true;
        }
    }

    // ---- panel ------------------------------------------------------------
    private static drawPanel(w: number, h: number): void {
        const fs = Gui.fontSize;
        this.rowH = Math.round(Math.min(fs * 2.4, h * 0.07));
        this.pw = Math.min(Math.round(w * 0.66), fs * 34);
        const chrome = this.rowH * 3;
        const rows = Math.max(6, Math.min(10, Math.floor((h * 0.94 - chrome) / this.rowH)));
        const ph = chrome + rows * this.rowH;
        this.px = Math.round((w - this.pw) / 2);
        this.py = Math.round((h - ph) / 2);
        this.colW = this.pw - 24;
        const pad = 12;

        Gui.box(this.px, this.py, this.pw, ph, "");

        // header
        Gui.label(this.px + pad, this.py + pad, this.colW, this.rowH, `AMONG US MOD MENU  v${VERSION}`);

        const closeW = Math.round(this.pw * 0.16);
        const closeH = Math.round(this.rowH * 0.8);
        if (Gui.button(this.px + this.pw - closeW - pad, this.py + pad, closeW, closeH, "CLOSE")) {
            this.open = false;
            return;
        }

        // page navigation
        const navY = this.py + this.rowH * 2;
        const navBtn = Math.round(this.pw * 0.18);
        if (Gui.button(this.px + pad, navY, navBtn, closeH, "< PREV")) {
            this.page = (this.page + this.PAGES.length - 1) % this.PAGES.length;
        }
        if (Gui.button(this.px + this.pw - navBtn - pad, navY, navBtn, closeH, "NEXT >")) {
            this.page = (this.page + 1) % this.PAGES.length;
        }
        Gui.label(
            this.px + pad + navBtn + pad,
            navY,
            this.pw - 2 * navBtn - 3 * pad,
            closeH,
            `[${this.page + 1}/${this.PAGES.length}] ${this.PAGES[this.page]}`
        );

        // body
        this.bodyTop = navY + this.rowH;
        this.row = 0;
        const limit = rows - 1;
        const draw = () => {
            if (this.row >= limit) return;
            switch (this.page) {
                case 0: return this.pageMain();
                case 1: return this.pageRoles();
                case 2: return this.pagePlayers();
                case 3: return this.pageTarget();
                case 4: return this.pageSabotage();
                case 5: return this.pageChat();
                case 6: return this.pageHost();
                default: return this.pageDiag(limit);
            }
        };
        Logger.safe("page", draw);

        // status line (also shows transient errors from actions)
        const statusY = this.py + ph - this.rowH - pad;
        const text = Date.now() < this.statusUntil ? this.status : this.statusText();
        Gui.label(this.px + pad, statusY, this.colW, this.rowH, text.substring(0, 90));
    }

    private static statusText(): string {
        const t = this.targetName();
        return `target: ${t}  |  page ${this.page + 1}/${this.PAGES.length}  |  log: ${Logger.path()}`;
    }

    // ---- row helpers ------------------------------------------------------
    private static y(): number {
        return this.bodyTop + this.row * this.rowH;
    }

    private static full(label: string, action: () => void): void {
        if (this.row < 0) return;
        if (Gui.button(this.px + 12, this.y(), this.colW, this.rowH - 4, label)) {
            this.run(label, action);
        }
        this.row++;
    }

    private static chk(label: string, get: () => boolean, set: (v: boolean) => void): void {
        const v = this.safeGet(get, false);
        const shown = `${label}: ${v ? "ON" : "OFF"}`;
        const next = Gui.toggle(this.px + 12, this.y(), this.colW, this.rowH - 4, shown, v);
        if (next !== v) this.run(label, () => set(next));
        this.row++;
    }

    private static adjust(label: string, valueLabel: string, dec: () => void, inc: () => void): void {
        const bw = Math.round(this.colW * 0.14);
        const labelW = this.colW - 2 * bw - 16;
        Gui.label(this.px + 12, this.y(), labelW, this.rowH - 4, `${label}: ${valueLabel}`);
        if (Gui.button(this.px + 12 + labelW + 8, this.y(), bw, this.rowH - 4, "-")) this.run(`${label}-`, dec);
        if (Gui.button(this.px + 12 + labelW + bw + 16, this.y(), bw, this.rowH - 4, "+")) this.run(`${label}+`, inc);
        this.row++;
    }

    private static note(text: string): void {
        Gui.label(this.px + 12, this.y(), this.colW, this.rowH - 4, text);
        this.row++;
    }

    private static run(label: string, action: () => void): void {
        try {
            action();
        } catch (e) {
            Logger.error(`[Menu:${label}] ${e}`);
            this.notify(`${label}: ${e}`);
        }
    }

    private static safeGet<T>(get: () => T, fallback: T): T {
        try {
            return get();
        } catch (e) {
            return fallback;
        }
    }

    private static notify(msg: string): void {
        this.status = msg;
        this.statusUntil = Date.now() + 3000;
    }

    // ---- target -----------------------------------------------------------
    private static target(): Il2Cpp.Object | null {
        const players = Game.allPlayers();
        return players[State.selectedPlayerIndex] ?? null;
    }

    private static targetName(): string {
        const t = this.safeGet(() => this.target(), null);
        if (!t) return "none";
        return this.safeGet(() => Game.playerName(t), "?");
    }

    private static withTarget(label: string, fn: (pc: Il2Cpp.Object) => void): void {
        const pc = this.target();
        if (!pc) {
            this.notify("no player in that slot");
            return;
        }
        fn(pc);
        this.notify(`${label}: ${Game.playerName(pc)}`);
    }

    private static isHost(): boolean {
        return this.safeGet(() => Game.isHost(), false);
    }

    // ---- page 0: main -----------------------------------------------------
    private static pageMain(): void {
        this.chk("NoClip", () => State.noclip, v => (State.noclip = v));
        this.adjust(
            "Speed",
            `${State.speedMultiplier.toFixed(2)}x`,
            () => Movement.setSpeed(Math.max(0.5, State.speedMultiplier - 0.25)),
            () => Movement.setSpeed(Math.min(4, State.speedMultiplier + 0.25))
        );
        this.adjust(
            "Vision",
            `${State.visionMultiplier.toFixed(2)}x`,
            () => (State.visionMultiplier = Math.max(0.25, State.visionMultiplier - 0.25)),
            () => (State.visionMultiplier = Math.min(5, State.visionMultiplier + 0.25))
        );
        this.chk("ESP names", () => State.esp, v => (State.esp = v));
        this.chk("Reveal impostors", () => State.revealImpostors, v => (State.revealImpostors = v));
        this.chk("Zoom out", () => State.zoomOut, v => (State.zoomOut = v));
        this.chk("Freeze me", () => State.freezeSelf, v => (State.freezeSelf = v));
        this.chk("Invert controls", () => State.invertControls, v => (State.invertControls = v));
        this.full("Teleport to random vent", () =>
            this.notify(Movement.teleportToRandomVent() ? "teleported" : "no vents found")
        );
        this.full("Teleport to target", () => this.withTarget("teleport", pc => Movement.teleportToPlayer(pc)));
    }

    // ---- page 1: roles ----------------------------------------------------
    private static pageRoles(): void {
        const roles = ["Crewmate", "Impostor", "Engineer", "Scientist", "Shapeshifter", "Phantom"];
        const ids = [0, 1, 3, 2, 5, 9];
        roles.forEach((name, i) => {
            this.full(`Set role: ${name}`, () => {
                const r = Roles.setOwnRole(ids[i]);
                this.notify(`${name} (${r.real ? "real" : "visual"})`);
            });
        });
        this.chk(
            "Fake impostor",
            () => this.fakeImpostorOn,
            v => {
                this.fakeImpostorOn = v;
                Roles.fakeImpostor(v);
            }
        );
        this.full("Complete my tasks", () => this.notify(`completed ${Roles.completeMyTasks()}`));
        this.full("Complete target tasks", () => this.withTarget("tasks", pc => Roles.completeTasksOf(pc)));
        this.chk("Unlock all cosmetics", () => State.unlockCosmetics, v => (State.unlockCosmetics = v));
        this.full("Copy target outfit", () => this.withTarget("outfit", pc => Roles.copyOutfit(pc)));
        this.full("Set name: Modded", () => this.notify(Roles.setDisplayName("Modded") ? "name set" : "failed"));
    }

    // ---- page 2: players --------------------------------------------------
    private static pagePlayers(): void {
        this.adjust(
            "Target slot",
            `#${State.selectedPlayerIndex}`,
            () => (State.selectedPlayerIndex = Math.max(0, State.selectedPlayerIndex - 1)),
            () => (State.selectedPlayerIndex = Math.min(14, State.selectedPlayerIndex + 1))
        );
        this.full("List players", () => {
            const names = Game.allPlayers().map((p, i) => `#${i} ${Game.playerName(p)}`);
            Logger.info(`players: ${names.join(", ")}`);
            this.notify(names.slice(0, 3).join("  ") || "lobby empty");
        });
        this.full("Teleport all to me", () =>
            this.notify(`moved ${Movement.teleportAllToMe(Game.allPlayers())}`)
        );
        this.full("Teleport all to target", () =>
            this.withTarget("tp all", pc => this.notify(`moved ${Movement.teleportAllTo(pc, Game.allPlayers())}`))
        );
        this.full("Freeze target", () => this.withTarget("freeze", pc => Movement.freezePlayer(pc)));
        this.full("Unfreeze all", () => (Movement.unfreezeAll(), this.notify("unfrozen")));
        this.full("Attach target to me", () =>
            this.withTarget("attach", pc => {
                const me = Game.localPlayer;
                if (me) Troll.attach(pc, me);
            })
        );
        this.full("Detach all", () => (Troll.detachAll(), this.notify("detached")));
        this.full("Kick target", () =>
            this.withTarget("kick", pc => {
                const r = Troll.kick(pc);
                this.notify(`kick via ${r.mode}: ${r.ok ? "sent" : "failed"}`);
            })
        );
    }

    // ---- page 3: target actions -------------------------------------------
    private static pageTarget(): void {
        this.note(`Target: ${this.targetName()}`);
        this.full("Change target colour", () =>
            this.withTarget("colour", pc => {
                const next = (Game.colorId(pc) + 1) % 18;
                const r = Troll.forceColor(pc, next);
                this.notify(`colour ${next} (${r.synced ? "synced" : "local only"})`);
            })
        );
        this.full("Change my colour", () => (Troll.cycleOwnColor(), this.notify("colour cycled")));
        this.chk("Colour cycler", () => State.colourCycler, v => (State.colourCycler = v));
        this.full("Spoof chat as target: 'sus'", () =>
            this.withTarget("spoof", pc => Troll.spoofMessage(pc, "sus"))
        );
        this.full("Kill target (as me)", () => this.withTarget("kill", pc => Troll.murderAsMe(pc)));
        this.full("Blame murder on impostors", () =>
            this.withTarget("blame", pc => this.notify(`killed ${Troll.blameMurder(pc, Game.allPlayers())}`))
        );
        this.full("Murder all crew", () => this.notify(`killed ${Troll.murderCrew(Game.allPlayers())}`));
        this.full("Murder all impostors", () =>
            this.notify(`killed ${Troll.murderImpostors(Game.allPlayers())}`)
        );
        this.full("Echo chamber: hello", () => this.notify(`echoed ${Troll.echoChamber("hello", Game.allPlayers())}x`));
    }

    // ---- page 4: sabotage -------------------------------------------------
    private static pageSabotage(): void {
        this.full("Sabotage LIGHTS", () => this.notify(Sabotage.lights() ? "sent" : "failed"));
        this.full("Sabotage COMMS", () => this.notify(Sabotage.comms() ? "sent" : "failed"));
        this.full("Sabotage O2", () => this.notify(Sabotage.o2() ? "sent" : "failed"));
        this.full("Sabotage REACTOR", () => this.notify(Sabotage.reactor() ? "sent" : "failed"));
        this.full("Sabotage ALL", () => this.notify(`sent ${Sabotage.sabotageAll()}`));
        this.full("Sabotage MUSHROOMS", () => this.notify(Sabotage.mushrooms() ? "sent" : "failed"));
        this.full("Lock all doors", () => this.notify(`locked ${Sabotage.lockAllDoors()}`));
        this.full("Repair everything", () => this.notify(`repaired ${Sabotage.repairAll()}`));
        this.chk("Sabotage loop", () => State.sabotageLoop, v => (State.sabotageLoop = v));
        this.full("Cycle loop system", () => {
            const order = [Sys.Electrical, Sys.Comms, Sys.LifeSupp, Sys.Reactor];
            const i = Math.max(0, order.indexOf(State.sabotageLoopSystem));
            State.sabotageLoopSystem = order[(i + 1) % order.length];
            this.notify(`loop system ${State.sabotageLoopSystem}`);
        });
    }

    // ---- page 5: chat / fun -----------------------------------------------
    private static pageChat(): void {
        this.chk("Free chat", () => State.freeChat, v => (State.freeChat = v));
        this.chk("Chat length 120", () => State.chatLength, v => (State.chatLength = v));
        this.chk("No chat cooldown", () => State.noChatCooldown, v => (State.noChatCooldown = v));
        this.chk("Ghost whisperer", () => State.ghostWhisper, v => ((State.ghostWhisper = v), (State.seeGhosts = v)));
        this.chk("Echo chamber", () => State.echoChamber, v => (State.echoChamber = v));
        this.chk("UwUify text", () => State.uwuify, v => (State.uwuify = v));
        this.full("Cycle task animation", () => {
            State.forceTaskAnim = (State.forceTaskAnim + 1) % 5;
            this.notify(`task animation ${State.forceTaskAnim}`);
        });
        this.full("Pat target (pet)", () =>
            this.withTarget("emote", pc => pc.method<void>("SetPet", 1).invoke(Il2Cpp.string("pet_EmptyPet")))
        );
        this.chk("Kill log", () => State.killLog, v => (State.killLog = v));
        this.full("Show 2D radar", () => this.notify(Visuals.radarLines().slice(0, 3).join("  ") || "no players"));
    }

    // ---- page 6: host -----------------------------------------------------
    private static pageHost(): void {
        this.note(this.isHost() ? "HOST: controls active" : "not host: host actions will report 'Host only'");
        this.full("Force start game", () => this.notify(`start: ${Host.forceStart().ok}`));
        this.full("End game: CREW win", () => this.notify(`crew win: ${Host.endGame(true).ok}`));
        this.full("End game: IMPOSTOR win", () => this.notify(`impostor win: ${Host.endGame(false).ok}`));
        this.full("Randomize colours", () => this.notify(`randomized ${Host.randomizeColors(Game.allPlayers())}`));
        this.full("Flip the Skeld", () => this.notify(`flip: ${Host.flipMap().ok}`));
        this.adjust(
            "Impostor count",
            `${State.impostorCount}`,
            () => {
                State.impostorCount = Math.max(1, State.impostorCount - 1);
                this.notify(`count ${Host.setImpostorCount(State.impostorCount).ok}`);
            },
            () => {
                State.impostorCount = Math.min(3, State.impostorCount + 1);
                this.notify(`count ${Host.setImpostorCount(State.impostorCount).ok}`);
            }
        );
        this.full("Swap roles slot 0 <-> 1", () => {
            const p = Game.allPlayers();
            if (p.length >= 2) this.notify(`swap: ${Host.swapRoles(p[0], p[1]).ok}`);
        });
        this.full("Apply role scramble", () =>
            this.notify(`assigned ${Original.applyScramble(Game.allPlayers(), Host)}`)
        );
        this.full("Clear role scramble", () => (Original.roleScramble = {}, this.notify("cleared")));
    }

    // ---- page 7: diagnostics ----------------------------------------------
    private static pageDiag(limit: number): void {
        this.note(`agent 2.0.0 | il2cpp | log: ${Logger.path()}`);
        this.full("Clear log", () => (Logger.clear(), this.notify("log cleared")));
        this.full("Log il2cpp/game info", () => {
            Logger.info(`game ${Il2Cpp.application.version} unity ${Il2Cpp.unityVersion}`);
            this.notify("info written to log");
        });
        this.full("CRASH THE GAME", () => {
            this.notify("crashing...");
            State.crashArmed = true;
            setTimeout(() => Passive.crash(), 400);
        });
        const lines = Logger.tail(limit - this.row);
        for (const line of lines) {
            this.note(line.substring(0, 96));
        }
    }
}
