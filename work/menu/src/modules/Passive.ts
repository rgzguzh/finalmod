import { Game } from "../core/Game.js";
import { State } from "../data/State.js";
import { Logger } from "../utils/Logger.js";
import { Visuals } from "./Visuals.js";
import { Sabotage } from "./Sabotage.js";
import { Troll } from "./Troll.js";
import { Original } from "./Original.js";

/**
 * Passive / always-on hooks. Installed once at startup.
 *  - Unlock all cosmetics  (PlayerPurchasesData.GetPurchase -> true)
 *  - Always enable free chat + guest unlock (AccountManager.CanPlayOnline -> true)
 *  - 120-char chat / symbols (TextBoxTMP.characterLimit)
 *  - Per-frame driver for ESP, sabotage loop, attachments, mimicry, crash
 */
export class Passive {
    private static hooked = false;
    private static lastLimitApplied = 0;

    static init(): void {
        if (this.hooked) return;
        this.hookPurchases();
        this.hookAccount();
        this.hookHud();
        this.hooked = true;
        Logger.info("[Passive] hooks installed");
    }

    private static hookPurchases(): void {
        const k = Game.cls("PlayerPurchasesData");
        const m = k?.tryMethod<boolean>("GetPurchase", 2);
        if (!m) {
            Logger.warn("[Passive] PlayerPurchasesData.GetPurchase missing");
            return;
        }
        m.implementation = function (itemKey: Il2Cpp.String, bundleKey: Il2Cpp.String): boolean {
            if (State.unlockCosmetics) return true;
            return this.method<boolean>("GetPurchase", 2).invoke(itemKey, bundleKey);
        };
    }

    private static hookAccount(): void {
        const k = Game.cls("AccountManager");
        const m = k?.tryMethod<boolean>("CanPlayOnline", 0);
        if (!m) {
            Logger.warn("[Passive] AccountManager.CanPlayOnline missing");
            return;
        }
        m.implementation = function (): boolean {
            if (State.freeChat) return true;
            return this.method<boolean>("CanPlayOnline", 0).invoke();
        };
    }

    private static hookHud(): void {
        const hud = Game.cls("HudManager");
        const upd = hud?.tryMethod<void>("Update", 0);
        if (!upd) {
            Logger.warn("[Passive] HudManager.Update missing");
            return;
        }
        upd.implementation = function (): void {
            try {
                Passive.tickChatLimit();
                Passive.tickVisuals();
                Passive.tickLoops();
            } catch (e) {
                /* keep the game alive */
            }
            this.method<void>("Update", 0).invoke();
        };
    }

    /** Enforces the 120-char limit on the free chat field (CLIENT). */
    private static tickChatLimit(): void {
        if (!State.chatLength) return;
        const now = Date.now();
        if (now - this.lastLimitApplied < 1000) return;
        this.lastLimitApplied = now;
        try {
            const chatctl = Game.hudManager?.field<Il2Cpp.Object>("Chat").value;
            const field = chatctl?.field<Il2Cpp.Object>("freeChatField").value;
            const area = field?.field<Il2Cpp.Object>("textArea").value;
            if (area && !area.isNull()) area.field<number>("characterLimit").value = 120;
        } catch (e) {}
    }

    private static tickVisuals(): void {
        if (State.esp || State.revealImpostors || State.seeGhosts) Visuals.update();
        if (State.noShadows || State.fullBright) Visuals.shadows(!(State.noShadows || State.fullBright));
        if (State.visionMultiplier !== 1.0) Visuals.vision(State.visionMultiplier);
        if (State.zoomOut) Visuals.zoom(true);
    }

    private static tickLoops(): void {
        Sabotage.tick();
        Troll.tickAttachments();
        Original.tickTaskMimicry();
        if (State.crashArmed) Passive.crash();
    }

    /** Deliberate, immediate crash of the game process (CLIENT). */
    static crash(): void {
        State.crashArmed = false;
        Logger.warn("[Passive.crash] triggering crash");
        try {
            (Process as any).crash();
        } catch (e) {
            Logger.error(`[Passive.crash] ${e}`);
        }
    }
}
