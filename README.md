# Among Us Mod Menu — dual-install build

**Deliverable:** `output/AmongUs_ModMenu_InGame.apk`
**Package:** `com.innersloth.spacemafia.mod` (installs *alongside* the official `com.innersloth.spacemafia`)
**Game version merged:** 2026.11.3 (versionCode 7616), minSdk 26, targetSdk 36, **arm64-v8a only**
**Menu version:** 2.0.0 — drawn by the game's own Unity IMGUI; **no overlay, no WindowManager, no Java at load time**
**APK SHA-256:** `1b6bf7ef5fc40524e49a79062fc738fe29502ac39e295265b70ba9223d08dcdd`
**Open it:** tap the **MOD** chip top-left, or press the **MOD MENU** button that appears
when you open the game's gear/settings menu (see §2b).

> **Read "Verification status" first.** Everything that can be proven inside this
> Codespace was proven. Installation and in-game behaviour could not be executed
> here because the XAPK is arm64-only and this container has no ARM device or
> arm64-capable emulator. `scripts/verify_device.sh` does that part in one command.

---

## 1. Base projects

| Project | Role | Verdict |
|---|---|---|
| [AstralKitsune/MalumMenu-Android](https://github.com/AstralKitsune/MalumMenu-Android) | **Base used.** TS/Frida menu on `frida-il2cpp-bridge` + `frida-java-menu`; resolves classes/methods *by name* at runtime | Accepted |
| [Devilx86/ImpostorModmenu](https://github.com/Devilx86/ImpostorModmenu) | Secondary, evaluated as native base | **Rejected — evidence in §7** |

Why Malum's approach was chosen: it survives the 2026.11.3 API renames (`Kill`→`MurderPlayer`,
`Sabotage`→`RpcUpdateSystem`, `RepairSystem`→`RepairCriticalSabotages`) because it looks
methods up by name instead of patching fixed addresses.

**Note:** no Malum code ships in the APK — the module registry, tabs, UI labels, i18n and
branding are replaced; the agent was written for this task against `dump.cs`. Its framework
choice (frida-il2cpp-bridge / frida-java-menu, both GPL-3.0) and the runtime-hook strategy
were reused as described above.

**Injection method:** Frida **Gadget as a core library** (`libfrida-gadget.so`), loaded from
`EosUnityPlayerActivity.<clinit>` before `EOSSDK` and before Unity starts. This needs **no
root** and **no Java Service/Activity of its own** — which is exactly why the package rename
is clean and dual-install works.

---

## 2. Package rename performed (Phase 5.1–5.7)

| Step | Result |
|---|---|
| `AndroidManifest.xml` `package=` | `com.innersloth.spacemafia` → `com.innersloth.spacemafia.mod` |
| Every `android:authorities` | 5 providers renamed: `…mod.androidx-startup`, `…mod.IronsourceLifecycleProvider`, `…mod.LevelPlayActivityLifecycleProvider`, `…mod.SentryInitProvider`, `…mod.SentryPerformanceProvider` |
| Fully-qualified components | `…mod.EosUnityPlayerActivity`, `…mod.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` |
| Smali package dir | `smali_classes3/com/innersloth/spacemafia/*` → `…/spacemafia/mod/*` |
| Slashed descriptors | `Lcom/innersloth/spacemafia/` → `Lcom/innersloth/spacemafia/mod/` (single pass) |
| Dotted strings | `com.innersloth.spacemafia` → `com.innersloth.spacemafia.mod` |
| App label | `@string/app_name` → "Among Us Mod" |
| Overlay | `android.permission.SYSTEM_ALERT_WINDOW` still declared (harmless, unused) — the menu draws inside the game window and needs **no** overlay grant |
| Native libs | `libfrida-gadget.so`, `libfrida-gadget.config.so`, `libfrida-gadget.script.so` |
| Launcher smali patch | `System.loadLibrary("frida-gadget")` prepended in `EosUnityPlayerActivity.<clinit>` |

Verified after build: **0** old-package descriptors remain in the bytes of any `classes*.dex`,
and the manifest contains only `com.innersloth.spacemafia.mod*` values.

The mod menu itself had **no hardcoded** `com.innersloth.spacemafia` references to fix
(the only occurrence in the bundle is the UI caption showing its own package name), so
there is no stale Frida target, Intent or `FindClass` string.

---

## 2b. 2.0.0 — the menu is part of the game's Unity UI (IMGUI)

The Android-overlay route (1.0.0, 1.0.1) is retired. On the operator's device the
menu never appeared **and** `modmenu.log` stayed empty, which means the overlay code
never ran at all: an in-window/overlay UI was the wrong layer to fight on. 2.0.0
removes Java, `WindowManager`, `SYSTEM_ALERT_WINDOW` and every `Activity` call from
the load path, and draws the menu with Unity's own IMGUI from inside the game.

### How to open it

1. Launch **Among Us Mod** (original artwork, label "Among Us Mod").
2. Tap the small **MOD** chip in the top-left corner. It is drawn during boot menus,
   lobby and in-game, and it stays put across scene changes.
3. Panel opens centred: title `AMONG US MOD MENU v2.0.0`, `CLOSE` top-right, page
   switcher `< PREV` / `NEXT >`, 8 pages — MAIN, ROLES, PLAYERS, TARGET, SABOTAGE,
   CHAT, HOST, DIAG.
4. Second entry point: open the game's own **gear icon** (settings / pause). A wide
   **MOD MENU** button is drawn near the bottom centre of the screen on top of it.

### How it is injected

- **Host object.** `DebugAnalytics : DestroyableSingleton<DebugAnalytics>`
  (`work/dump/dump.cs:12973`) is an Among Us `MonoBehaviour` that already implements
  `OnGUI`. `MenuHost.install()` replaces its `OnGUI` with the renderer and replaces
  `Start()` with a no-op so the game's analytics reporter is never created. If no
  instance is alive, one is created with
  `new GameObject("ModMenuIMGUI")` + `AddComponent(DebugAnalytics)` +
  `DontDestroyOnLoad`, on the Unity main thread via `Il2Cpp.perform(fn, "main")`,
  retried once per second until the player is up.
- **Rendering.** `UnityEngine.GUI.Button/Toggle/Label/Box` with `Rect`,
  `GUIContent` and the built-in `GUI.skin` styles; font size is derived from
  `Screen.height` so rows are thumb-sized on a 1080p landscape phone
  (`work/menu/src/core/Gui.ts`). No extra window, no appop, no `finish()`.
- **Settings-menu awareness.** `OptionsMenuBehaviour.Open()` / `Close()`
  (`dump.cs:65665`) are watched with `Interceptor.attach` — the originals still run,
  so the gear menu behaves normally; the hooks only tell the renderer when to show
  the extra MOD MENU button.
- **Panel.** `work/menu/src/ui/InGameMenu.ts`: 8 pages, each row is a full-width
  button, a toggle, or a `label  -  +` stepper. Every action is wrapped so a failing
  feature prints a one-line status instead of killing the frame; rendering
  self-disables after 120 consecutive OnGUI errors.

### Diagnostics (no adb needed)

Both files are written with Frida's native `File` API, so they work even if the Java
bridge or an Android permission is what failed:

```
/storage/emulated/0/Android/data/com.innersloth.spacemafia.mod/files/modmenu.log   agent
/storage/emulated/0/Android/data/com.innersloth.spacemafia.mod/files/gadget.log    gadget
```

The first line of `modmenu.log` is `agent 2.0.0 loaded (in-game IMGUI menu)`, which
separates "the gadget never ran the script" from "the menu failed to draw". Page
**DIAG** renders the log tail in-game, plus `Clear log`, `Log info` and a deliberate
`CRASH THE GAME` row.

---

## 3. Environment / reproducibility

```
openjdk 17.0.x        java, keytool
Android build-tools   29.0.3  (aapt2, zipalign, apksigner, dexdump)
apktool               2.11.1
APKEditor             1.4.3      (XAPK merge)
Il2CppDumper          6.7.46     (net7 dll on the net9 runtime, DOTNET_ROLL_FORWARD=Major)
node / npm            24.x       (frida-compile, frida-java-menu)
frida-gadget          17.26.2    android-arm64
```

Reproduce:
```bash
# merge -> decompile -> rename -> inject -> build -> align -> sign
java -jar tools/APKEditor.jar m -i work/xapk -o work/amongus_merged.apk
java -Xmx2200m -jar tools/apktool.jar d work/amongus_merged.apk -o work/game --use-aapt2
(cd work/menu && npm i && npx frida-compile src/index.ts --output dist/agent.js)
# renames + injection are scripted in the commands recorded in build.log
java -Xmx2200m -jar tools/apktool.jar b work/game -o work/amongus_modded_unsigned.apk --use-aapt2
zipalign -p -f 4 work/amongus_modded_unsigned.apk work/amongus_modded_aligned.apk
apksigner sign --ks mod.keystore --ks-pass pass:modpass --key-pass pass:modpass \
  --out output/AmongUs_ModMenu.apk work/amongus_modded_aligned.apk
```
**Heap matters:** `-Xmx6g` gets OOM-killed (the box has 3 GB free, no swap). Use `-Xmx2200m`.

---

## 4. Keystore

```
file:      mod.keystore              (alias: mod)
storepass: modpass
keypass:   modpass
DN:        CN=ModMenu, OU=Mod, O=Mod, L=NA, ST=NA, C=US
RSA 2048, validity 10000 days
cert SHA-256: 1e7a561be7f9fe0c7e5ac597bbbaa9bf0da7ff5df22ac1818265840cb0a11aec
```

Signature schemes: **v1 false, v2 true, v3 true** (minSdk 26, so v2 suffices).
The keystore is regenerated per checkout; anyone rebuilding must keep it to upgrade in place.

---

## 5. Feature list

Tags: **CLIENT** = works without being host · **HOST** = needs host · **BOTH**.
Everything marked CLIENT is wired to a real API call, not a placeholder.

### Movement & self — CLIENT
- NoClip (collider disabled per-frame) · Speedhack slider 0.5×–4× · Teleport to random vent
- Teleport to selected player · Invert controls (joystick direction negated)
- Freeze my position

### ESP & visuals — CLIENT
- ESP: name + role + distance through walls · Reveal impostors (red names)
- No shadows / fullbright · Vision multiplier 0.25×–5× (hooks `ShipStatus.CalculateLightRadius`)
- Zoom out camera · See ghosts / ghost chat · 2D radar readout (distance + cardinal)
- Kill log (time, killer, victim, room via nearest `MapRoom.room`)

### Roles, tasks & cosmetics
- Force/change own role any time — **CLIENT** (visual) / **BOTH** (real when host)
- Fake impostor — **CLIENT**
- Complete my tasks — **CLIENT**
- Complete selected player's tasks — **CLIENT** (sends their task ids; may be rejected by host)
- **Unlock all cosmetics** (hats, skins, visors, pets, nameplates, cosmicubes) — **PASSIVE, CLIENT**
  (`PlayerPurchasesData.GetPurchase` → true)
- Copy player outfit — **CLIENT**
- No kill cooldown — **BOTH** (labelled; visual as client)
- No emergency cooldown — **CLIENT**
- Set level 1–1000 — **CLIENT**
- Change displayed name — **CLIENT**

### Player actions & troll
- Teleport to player — **CLIENT**
- Teleport all to me / to player — **BOTH**
- Freeze player / freeze all — **BOTH**
- Attach player to me — **BOTH**
- Spoof message as any player — **CLIENT** (`PlayerControl.RpcSendChat` on the target object)
- **Kick player** — **BOTH**: host → real `InnerNetClient.KickPlayer(clientId, ban)`;
  client → `VoteBanSystem.CmdAddVote` flood. Client path is **unreliable and high-detection**.
- **Change any player's colour whether you are host or not** — **BOTH**:
  host → `SetColor` + `RpcSetColor` (everyone sees it);
  client → `SetColor` only = **your view only**, because the host drops colour RPCs whose
  sender does not own that body. This limitation is inherent to the protocol, not a bug.
- Blame murder (impostors kill target) — **CLIENT**
- Murder crew as impostor — **CLIENT**
- Murder impostors — **CLIENT**
- Change my colour / colour cycler — **CLIENT**

### Sabotage (incl. crewmate sabotage) — CLIENT
- **Crewmate sabotage** — no role check exists on the host for `SabotageSystemType`/
  `DoorsSystemType`, so `ShipStatus.RpcUpdateSystem(SystemTypes.Sabotage, system)` is accepted
  from a crewmate. This is why the requirement is satisfiable as CLIENT.
- Sabotage all · Sabotage loop (8 s) · Lock all doors (`CloseDoors=128 | IdMask=31`)
- Repair all from anywhere · Individual: Reactor, O2, Lights, Comms, Mushrooms, Heli

### Chat & account — CLIENT / PASSIVE
- Always enable free chat + guest unlocker (`AccountManager.CanPlayOnline` → true)
- No chat cooldown · Chat length 120 + symbols (`TextBoxTMP.characterLimit`)
- Ghost whisperer (passive toggle)

### Host-only lobby (greyed out as client)
Force impostor 1–3 · Role grid per slot · Swap roles · Impostor count · Force start ·
End game (crew/impostor win) · Randomize colours · Flip the Skeld (negates ship scale.x)

Controls are disabled **and** alpha-dimmed at build time of the tab when `AmHost` is false,
and every action re-checks host status and toasts `Host only`.

### Fun & animation trolls — CLIENT
Force task animation · UwUify game text · Play pet/emote on a player

### Original features
1. **Sabotage Roulette** — CLIENT; configurable % after task completion, non-critical only (Lights/Comms)
2. **Echo Chamber** — CLIENT; repeats your message 2–3×, each spoofed as a different random player
3. **Ghost Whisperer** — CLIENT, passive
4. **Task Mimicry** — CLIENT; idle N s within 2.5 units of a `Console` replays its `Use()`
5. **Selective Role Scrambler** — **HOST**; per-slot role assignment, greyed out as client

### Added on request
- **CRASH THE GAME** — CLIENT; deliberate `Process.crash()` (bottom of the menu)
- **Kick players in lobbies** — see BOTH note above
- **Change another player's colour** — see BOTH note above

---

## 6. Verification status — what was and was not proven

### Proven here (automated)
| Check | Result |
|---|---|
| XAPK merge, 3 splits → 1 APK, 1112 files, 467 Unity data files retained | PASS |
| Manifest parses; 29,651 smali classes across 4 dex | PASS |
| Il2CppDumper: metadata v31, CodeRegistration/`MetadataRegistration` found | PASS |
| `offsets.json` RVA→file-offset consistency vs ELF `PT_LOAD` | PASS |
| `apksigner verify` (v2 + v3) | PASS |
| `zipalign -c -p 4` (native libs page-aligned) | PASS |
| Package renamed: 0 old descriptors in dex, manifest values all `.mod` | PASS |
| `aapt2 dump badging`: `com.innersloth.spacemafia.mod`, label "Among Us Mod" | PASS |
| Agent bundle built, no CJS `require`, no upstream branding | PASS |
| Agent 1.0.1 packaged into the APK byte-identically (`libfrida-gadget.script.so` SHA == `dist/agent.js` SHA) | PASS |
| No `Composer` instantiation left in the bundle (grep) — overlay branch unreachable | PASS |
| `add()` calls all carry an explicit target layout (no `instance` dependency) | PASS |

### NOT proven here — requires an arm64 device
1. `adb install` alongside the official app (Phase 5.10) — **the mandatory gate**
2. Menu overlay rendering and every in-game feature (Phase 6)
3. Official app still launching with the modded app installed

**Why:** this XAPK contains only `lib/arm64-v8a`, so it cannot run on an x86_64 emulator;
no ARM device is attached (`adb devices` empty). Guessing at results would be dishonest.

**Run:** `./scripts/verify_device.sh` on a real arm64 phone. It checks dual-install, catches
`INSTALL_FAILED_CONFLICTING_PROVIDER`/`ALREADY_EXISTS` with an explanation, confirms both
processes run, confirms `/data/data/…mod/`, dumps the UI hierarchy and asserts that the
`MOD MENU` panel is actually inside the activity window (no overlay grant involved), and
prints the on-device `modmenu.log`.

If it fails, the exact `adb` error goes into `build.log` as Phase 6 requires.

---

## 7. Why the native base was rejected (documented, not dropped)

`Devilx86/ImpostorModmenu` cannot be built against 2026.11.3:

1. Last touched 2021-06-25 (pre-roles, pre-radar game).
2. Hook targets are hardcoded `uintptr_t` literals in `app/src/main/cpp/func.h` — no
   runtime resolution, so every address is wrong for this build.
3. It patches via `getAbsoluteAddress(offsets.x, true)`, i.e. **writes to `.text`** at those
   stale literals → SIGSEGV on launch.
4. 5 of its 10 critical symbols are gone in 2026.11.3: `PlayerControl.Kill`,
   `RpcSetInfected`, `ShipStatus.Sabotage`, `RepairSystem`, `getUnlockedHats/Skins/Pets`,
   `getBoughtNoAds`.
5. Its `.so` is not in the repo and would need NDK+Gradle, then still crash per (2)–(4).

Recompiling it was therefore not "a fix away" — the entire offset table and 5 call sites
would have to be rewritten, which is exactly what reading `dump.cs` and using name-based
resolution already achieves.

---

## 8. Known limitations

- **Additive extra sabotage:** reactive "all sabotages at once" — the game allows one
  critical sabotage at a time, so the last one wins; non-critical ones still stack.
- **Client colour change** of *another* player is local-only (host authority) — see §5.
- **Client kick** via vote-ban needs other voters; single-client use usually does nothing.
- **Invert controls** is best-effort: the joystick is re-negated each frame and a fast
  VirtualJoystick update can win the race on some devices.
- **ESP** works by rewriting each player's overhead `nameText`; it does not draw new geometry.
- **`Il2CppDumper` printed a "This file may be protected" warning** — benign, it refers only
  to a failed `JNI_OnLoad` symbol lookup; the dump completed and offsets were validated.
- Launcher icon was left as the original artwork; only the label changed.

---

## 9. Artifacts

```
output/AmongUs_ModMenu_InGame.apk  signed (v2+v3), 1.06 GiB (=1,135,198,945 B), menu 2.0.0
                                in-game Unity IMGUI menu, no overlay permission
                                SHA-256 1b6bf7ef5fc40524e49a79062fc738fe29502ac39e295265b70ba9223d08dcdd
output/AmongUs_ModMenu.apk      previous 1.0.1 overlay attempt (kept for reference)
offsets.json                    25 classes / 57 methods + field offsets (for future updates)
build.log                       every command and its output
scripts/verify_device.sh        on-device dual-install + feature checks
work/menu/                      agent source (TypeScript) and dist/agent.js (238 KB, no Java bridge)
mod.keystore                    signing key (credentials in §4)
```
