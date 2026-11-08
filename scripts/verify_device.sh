#!/usr/bin/env bash
# On-device verification for AmongUs_ModMenu_InGame.apk (menu 2.0.0, in-game IMGUI).
# Run this on a machine with adb + a real arm64 Android device.
#
# Usage: ./scripts/verify_device.sh [path/to/AmongUs_ModMenu.apk]
set -uo pipefail

APK="${1:-output/AmongUs_ModMenu_InGame.apk}"
MOD_PKG="com.innersloth.spacemafia.mod"
ORIG_PKG="com.innersloth.spacemafia"
FAIL=0

say() { printf '\n=== %s ===\n' "$*"; }
ok()  { printf 'PASS  %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; FAIL=1; }

say "device"
adb get-state || { echo "no device"; exit 2; }
adb shell getprop ro.product.cpu.abi

say "precondition: official build installed"
if adb shell pm list packages | grep -qx "package:$ORIG_PKG"; then
  ok "official $ORIG_PKG present"
else
  echo "NOTE  official build not installed; dual-install cannot be proven"
fi

say "install modded build (must NOT require uninstalling the official app)"
# -r is deliberately NOT used: we want a clean install of a new package.
OUT=$(adb install "$APK" 2>&1); RC=$?
echo "$OUT"
if [ $RC -eq 0 ] && echo "$OUT" | grep -q Success; then
  ok "installed alongside official app"
else
  bad "install failed (exit $RC)"
  echo "Common codes:"
  echo "  INSTALL_FAILED_ALREADY_EXISTS            -> package name not renamed"
  echo "  INSTALL_FAILED_CONFLICTING_PROVIDER      -> an android:authorities value was missed"
  echo "  INSTALL_FAILED_NO_MATCHING_ABIS          -> device is not arm64-v8a"
  echo "  INSTALL_FAILED_INVALID_APK               -> re-zipalign/re-sign"
  echo "  INSTALL_FAILED_UPDATE_INCOMPATIBLE       -> stale $MOD_PKG already installed, adb uninstall it"
  exit 1
fi

say "both packages present"
adb shell pm list packages | grep -E "package:(${ORIG_PKG}|${MOD_PKG})$"

say "launcher entries (distinct labels)"
adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$MOD_PKG" | tail -1
adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$ORIG_PKG" | tail -1

say "overlay permission (menu 2.0.0 does not use it at all)"
# The menu is drawn by the game's own Unity OnGUI. There is no second window and
# no appop involved; this is only recorded so the check is auditable.
adb shell appops get "$MOD_PKG" SYSTEM_ALERT_WINDOW 2>/dev/null | sed 's/^/NOTE  /'

say "launch modded build (watch for crashes)"
adb logcat -c
adb shell monkey -p "$MOD_PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 15
if adb shell pidof "$MOD_PKG" >/dev/null; then ok "modded process alive"; else bad "modded process died"; fi

echo "--- agent/menu log lines ---"
adb logcat -d | grep -iE 'AUMenu|frida|il2cpp|ModMenu' | tail -40

say "agent actually loaded (this is the check that failed on 1.0.1)"
# The Unity menu is NOT part of the Android view hierarchy, so uiautomator cannot
# see it. The authoritative signal is the agent's own first log line.
LOG=/sdcard/Android/data/$MOD_PKG/files/modmenu.log
GLOG=/sdcard/Android/data/$MOD_PKG/files/gadget.log
AGENT_LOG=$(adb shell cat "$LOG" 2>/dev/null)
if echo "$AGENT_LOG" | grep -q "agent 2.0.0 loaded"; then
  ok "gadget ran the script (modmenu.log: 'agent 2.0.0 loaded')"
elif [ -n "$(adb shell cat "$GLOG" 2>/dev/null)" ]; then
  bad "gadget started but the script did not log - see gadget.log"
  adb shell cat "$GLOG" 2>/dev/null | tail -20
else
  bad "modmenu.log empty AND gadget.log empty - gadget never initialised"
fi
if echo "$AGENT_LOG" | grep -q "in-game menu host: installed"; then
  ok "IMGUI host installed (DebugAnalytics.OnGUI hooked)"
else
  bad "IMGUI host not installed - see log below"
fi

say "on-device agent log"
echo "$AGENT_LOG" | tail -40 || echo "NOTE  $LOG not readable yet"

say "menu is visible (manual, one screenshot)"
adb exec-out screencap -p > /tmp/amongus_mod.png 2>/dev/null \
  && echo "NOTE  screenshot saved to /tmp/amongus_mod.png - look for the 'MOD' chip top-left" \
  || echo "NOTE  screencap failed"

say "data directories are independent"
adb shell run-as "$MOD_PKG" pwd 2>/dev/null && ok "$MOD_PKG data dir exists"
adb shell ls -d "/data/data/$ORIG_PKG" 2>/dev/null && ok "official data dir still present"

say "official build still launches"
adb shell monkey -p "$ORIG_PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 10
if adb shell pidof "$ORIG_PKG" >/dev/null; then ok "official process alive"; else bad "official process died"; fi

say "feature smoke test (manual, CLIENT / non-host lobby)"
cat <<'TXT'
Tap the top-left 'MOD' chip (or the 'MOD MENU' button that appears over the gear/settings menu),
then verify in a private lobby you are NOT hosting:
  [ ] NoClip       - walk through a wall
  [ ] Speedhack    - move noticeably faster
  [ ] ESP          - names + roles + distance through walls
  [ ] Unlock cosmetics - all hats/skins/pets selectable
  [ ] Free chat    - type a message as a guest
  [ ] My colour    - colour changes
  [ ] Spoof chat   - message appears under another player
  [ ] Crewmate sabotage - LIGHTS triggers while crewmate
  [ ] Teleport     - to a selected player
  [ ] Change selected player's colour (LOCAL view only as client)
  [ ] Kick selected (CLIENT = vote-ban; expected unreliable)
  [ ] CRASH THE GAME (last item; should kill the process)
TXT

say "result"
if [ $FAIL -eq 0 ]; then ok "all automated checks passed"; else bad "one or more automated checks failed"; fi
exit $FAIL
