/** Runtime state for every feature. Read by modules each frame / on demand. */
export const State = {
    // movement
    noclip: false,
    speedhack: false,
    speedMultiplier: 1.0,
    invertControls: false,
    freezeSelf: false,

    // esp / visuals
    esp: false,
    espDistance: true,
    espRole: true,
    noShadows: false,
    fullBright: false,
    visionMultiplier: 1.0,
    zoomOut: false,
    seeGhosts: false,
    revealImpostors: false,
    radar: false,

    // roles / cosmetics / account
    unlockCosmetics: false,
    completeTasksOnJoin: false,
    selectedPlayerIndex: 0,
    setLevel: 0,
    displayName: "",
    colourCycler: false,
    impostorCount: 1,

    // sabotage
    crewmateSabotage: false,
    sabotageAll: false,
    sabotageLoop: false,
    sabotageLoopSystem: 14, // Comms (non-critical)
    lockDoors: false,
    repairAll: false,
    sabotageRoulette: false,
    rouletteChance: 25,

    // chat
    freeChat: false,
    noChatCooldown: false,
    chatLength: false,
    echoChamber: false,
    ghostWhisper: false,

    // kill log
    killLog: false,

    // fun
    uwuify: false,
    forceTaskAnim: 0,

    // original features
    taskMimicry: false,
    taskMimicrySeconds: 3,

    // crash
    crashArmed: false
};

export type StateType = typeof State;
