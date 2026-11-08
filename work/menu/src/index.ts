import "frida-il2cpp-bridge";

import { AssemblyHelper } from "./core/AssemblyHelper.js";
import { MenuHost } from "./core/MenuHost.js";
import { Logger } from "./utils/Logger.js";
import { Movement } from "./modules/Movement.js";
import { Visuals } from "./modules/Visuals.js";
import { Sabotage } from "./modules/Sabotage.js";
import { Original } from "./modules/Original.js";
import { Passive } from "./modules/Passive.js";

class ModMenu {
    static init(): void {
        // First line: proves to the on-device log that the gadget loaded the script.
        Logger.info("agent 2.0.0 loaded (in-game IMGUI menu)");
        Logger.info(`log file: ${Logger.path()}`);

        Il2Cpp.perform(() => {
            Logger.safe("il2cpp-info", () => {
                Logger.info(`il2cpp ready | unity ${Il2Cpp.unityVersion} | game ${Il2Cpp.application.version}`);
            });

            ModMenu.safeInit("AssemblyHelper", () => AssemblyHelper.init());
            ModMenu.safeInit("Visuals", () => Visuals.init());
            ModMenu.safeInit("Movement", () => Movement.init());
            ModMenu.safeInit("Sabotage", () => Sabotage.init());
            ModMenu.safeInit("Original", () => Original.init());
            ModMenu.safeInit("Passive", () => Passive.init());

            const ok = Logger.safe("MenuHost.install", () => {
                MenuHost.install();
                return true;
            });
            Logger.info(`in-game menu host: ${ok ? "installed" : "FAILED (see log)"}`);
        }).catch(e => {
            Logger.error(`il2cpp unavailable: ${e}`);
        });
    }

    private static safeInit(name: string, fn: () => void): void {
        const ok = Logger.safe(`${name}.init`, () => {
            fn();
            return true;
        });
        if (!ok) Logger.warn(`${name} failed to initialise`);
    }
}

ModMenu.init();
