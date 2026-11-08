import { Game } from "../core/Game.js";
import { Logger } from "../utils/Logger.js";

/**
 * Player actions / troll area.
 *
 * Tags:
 *  - kickPlayer     BOTH (host = real kick via KickPlayer; client = vote-ban spam, unreliable + high detection)
 *  - forceColor     BOTH (host = synced; client = local visual only)
 *  - murderX        CLIENT (local player must be impostor for the animation to stick)
 *  - spoofMessage   CLIENT
 */
export class Troll {
    // ---- client id resolution --------------------------------------------
    private static clientIdOf(pc: Il2Cpp.Object): number {
        try {
            const client = Game.amongUsClient;
            if (!client) return -1;
            const all = client.field<Il2Cpp.Object>("allClients").value;
            for (const cd of Game.list(all)) {
                const ch = cd.field<Il2Cpp.Object>("Character").value;
                if (ch && !ch.isNull() && ch.handle.equals(pc.handle)) {
                    return cd.field<number>("Id").value;
                }
            }
        } catch (e) {
            Logger.warn(`[Troll.clientIdOf] ${e}`);
        }
        return -1;
    }

    // ---- kick / ban -------------------------------------------------------
    /** HOST: real kick. ban=true also bans. */
    static kickAsHost(pc: Il2Cpp.Object, ban = false): boolean {
        const clientId = this.clientIdOf(pc);
        if (clientId < 0) return false;
        const client = Game.amongUsClient;
        if (!client) return false;
        try {
            const m = client.tryMethod<void>("KickPlayer", 2);
            if (!m) return false;
            m.invoke(clientId, ban);
            return true;
        } catch (e) {
            Logger.error(`[Troll.kickAsHost] ${e}`);
            return false;
        }
    }

    /**
     * CLIENT: non-host kick attempt.
     * Floods VoteBanSystem.CmdAddVote, which the host counts toward a vote ban.
     * Only succeeds if enough clients vote; single-client use is unreliable.
     * Flagged high-detection.
     */
    static kickAsClient(pc: Il2Cpp.Object, votes = 3): number {
        const clientId = this.clientIdOf(pc);
        if (clientId < 0) return 0;
        let sent = 0;
        try {
            const vbs = Game.cls("VoteBanSystem");
            if (!vbs) return 0;
            const inst = vbs.field<Il2Cpp.Object>("Instance").value;
            if (!inst || inst.isNull()) return 0;
            const cmd = inst.tryMethod<void>("CmdAddVote", 1);
            if (!cmd) return 0;
            for (let i = 0; i < votes; i++) {
                cmd.invoke(clientId);
                sent++;
            }
        } catch (e) {
            Logger.error(`[Troll.kickAsClient] ${e}`);
        }
        return sent;
    }

    static kick(pc: Il2Cpp.Object): { ok: boolean; mode: string } {
        if (Game.isHost()) return { ok: this.kickAsHost(pc), mode: "host" };
        return { ok: this.kickAsClient(pc) > 0, mode: "client(vote-ban)" };
    }

    // ---- colour -----------------------------------------------------------
    /**
     * BOTH: change any player's colour.
     * Host: SetColor + RpcSetColor (everyone sees it).
     * Client: SetColor only (local visual); RpcSetColor is attempted but the
     *         host ignores colour RPCs that do not come from the body's owner.
     */
    static forceColor(pc: Il2Cpp.Object, colorId: number): { ok: boolean; synced: boolean } {
        let ok = false;
        try {
            pc.method<void>("SetColor", 1).invoke(colorId);
            ok = true;
        } catch (e) {
            Logger.error(`[Troll.forceColor:SetColor] ${e}`);
        }
        let synced = false;
        if (Game.isHost()) {
            try {
                pc.method<void>("RpcSetColor", 1).invoke(colorId);
                synced = true;
            } catch (e) {}
        } else {
            try {
                // best effort; host validates ownership and will usually drop it
                pc.method<void>("RpcSetColor", 1).invoke(colorId);
            } catch (e) {}
        }
        return { ok, synced };
    }

    static cycleOwnColor(): void {
        const lp = Game.localPlayer;
        if (!lp) return;
        const cur = Game.colorId(lp);
        const next = (cur + 1) % 18;
        this.forceColor(lp, next);
    }

    // ---- murder -----------------------------------------------------------
    static murder(killer: Il2Cpp.Object, victim: Il2Cpp.Object): boolean {
        try {
            killer.method<void>("MurderPlayer", 2).invoke(victim, 1 /* MurderResultFlags.Succeeded */);
            return true;
        } catch (e) {
            Logger.error(`[Troll.murder] ${e}`);
            return false;
        }
    }

    /** Make another impostor kill the selected player (blame framing). */
    static blameMurder(victim: Il2Cpp.Object, players: Il2Cpp.Object[]): number {
        let n = 0;
        const lp = Game.localPlayer;
        for (const pc of players) {
            if (lp && pc.handle.equals(lp.handle)) continue;
            if (Game.roleType(pc) !== 1) continue; // Impostor
            if (this.murder(pc, victim)) n++;
        }
        return n;
    }

    /** Kill selected player using your own player object. */
    static murderAsMe(victim: Il2Cpp.Object): boolean {
        const lp = Game.localPlayer;
        return lp ? this.murder(lp, victim) : false;
    }

    /** Make every impostor kill the crew. */
    static murderCrew(players: Il2Cpp.Object[]): number {
        const lp = Game.localPlayer;
        let n = 0;
        for (const victim of players) {
            if (Game.roleType(victim) === 1) continue;
            if (Game.isDead(victim)) continue;
            if (lp && this.murder(lp, victim)) n++;
        }
        return n;
    }

    /** Make impostors kill each other. */
    static murderImpostors(players: Il2Cpp.Object[]): number {
        const lp = Game.localPlayer;
        let n = 0;
        for (const victim of players) {
            if (Game.roleType(victim) !== 1) continue;
            if (lp && victim.handle.equals(lp.handle)) continue;
            if (lp && this.murder(lp, victim)) n++;
        }
        return n;
    }

    // ---- chat spoof -------------------------------------------------------
    static spoofMessage(sender: Il2Cpp.Object, text: string): boolean {
        return Game.sendChatAs(sender, text);
    }

    /** Original feature: repeat own message 2-3x, each under a random different player. */
    static echoChamber(ownText: string, players: Il2Cpp.Object[]): number {
        const others = players.filter(p => {
            const lp = Game.localPlayer;
            return lp ? !p.handle.equals(lp.handle) : true;
        });
        if (others.length === 0) return 0;
        const reps = 2 + Math.floor(Math.random() * 2);
        let n = 0;
        for (let i = 0; i < reps; i++) {
            const who = others[Math.floor(Math.random() * others.length)];
            if (Game.sendChatAs(who, ownText)) n++;
        }
        return n;
    }

    // ---- attach / freeze helpers -----------------------------------------
    private static attached: Array<{ follower: Il2Cpp.Object; leader: Il2Cpp.Object }> = [];

    static attach(follower: Il2Cpp.Object, leader: Il2Cpp.Object): void {
        this.attached.push({ follower, leader });
    }

    static detachAll(): void {
        this.attached = [];
    }

    static tickAttachments(): void {
        for (const a of this.attached) {
            try {
                Game.snapToPlayer(a.follower, a.leader);
            } catch (e) {}
        }
    }
}
