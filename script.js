let phaserGame;
let score = 0;
let pausedScene = null; // Track paused scene for relic modal
let _sfxVolume = 0.7;
let _graceMusicVolume = 0.5;
let _ambienceVolume = 0.35;
let _shakeMultiplier = 0.25; // Screen shake intensity (0 = off, 1 = full)
const MAX_FUSED_RELICS = 3;

function formatVolumePercent(value) {
    return `${Math.round(value * 100)}%`;
}

function setSfxVolume(value, syncSlider = true) {
    _sfxVolume = Math.max(0, Math.min(1, Number(value)));
    const label = document.getElementById('sfxVolumeLabel');
    if (label) label.textContent = formatVolumePercent(_sfxVolume);
    const slider = document.getElementById('sfxVolumeSlider');
    if (slider && syncSlider) slider.value = _sfxVolume;
}

function setGraceMusicVolume(value, syncSlider = true) {
    _graceMusicVolume = Math.max(0, Math.min(1, Number(value)));
    const label = document.getElementById('graceMusicVolumeLabel');
    if (label) label.textContent = formatVolumePercent(_graceMusicVolume);
    const slider = document.getElementById('graceMusicVolumeSlider');
    if (slider && syncSlider) slider.value = _graceMusicVolume;
    if (_graceScene && _graceScene.downtimeMusic) {
        try { _graceScene.downtimeMusic.setVolume(_graceMusicVolume); } catch (e) {}
    }
}

function setAmbienceVolume(value, syncSlider = true) {
    _ambienceVolume = Math.max(0, Math.min(1, Number(value)));
    const label = document.getElementById('ambienceVolumeLabel');
    if (label) label.textContent = formatVolumePercent(_ambienceVolume);
    const slider = document.getElementById('ambienceVolumeSlider');
    if (slider && syncSlider) slider.value = _ambienceVolume;
    const scene = phaserGame && phaserGame.scene && phaserGame.scene.scenes[0];
    if (scene && scene.music) {
        try { scene.music.setVolume(_ambienceVolume); } catch (e) {}
    }
}

function setShakeMultiplier(value, syncSlider = true) {
    _shakeMultiplier = Math.max(0, Math.min(1, Number(value)));
    const label = document.getElementById('shakeLabel');
    if (label) label.textContent = Math.round(_shakeMultiplier * 100) + '%';
    const slider = document.getElementById('shakeSlider');
    if (slider && syncSlider) slider.value = _shakeMultiplier;
}

window.handleSfxVolumeChange = setSfxVolume;
window.handleGraceMusicVolumeChange = setGraceMusicVolume;
window.handleAmbienceVolumeChange = setAmbienceVolume;
window.handleShakeChange = setShakeMultiplier;
window.toggleSettingsPanel = function() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    const opening = panel.classList.contains('hidden');
    const scene = phaserGame && phaserGame.scene && phaserGame.scene.scenes[0];
    if (opening) {
        // Opening the panel: pause the scene if it's not already paused
        try {
            if (scene && !scene.scene.isPaused()) {
                scene.inputLocked = true;
                scene.scene.pause();
                window._settingsPanelPausedScene = true;
            }
        } catch (e) {}
        panel.classList.remove('hidden');
    } else {
        // Closing: resume only if we paused it
        try {
            if (scene && window._settingsPanelPausedScene) {
                scene.scene.resume();
                scene.inputLocked = false;
                window._settingsPanelPausedScene = false;
            }
        } catch (e) {}
        panel.classList.add('hidden');
    }
};
window.toggleVolumePanel = window.toggleSettingsPanel;

document.addEventListener('DOMContentLoaded', () => {
    try {
        setSfxVolume(_sfxVolume, false);
        setGraceMusicVolume(_graceMusicVolume, false);
        setAmbienceVolume(_ambienceVolume, false);
        setShakeMultiplier(_shakeMultiplier, false);
    } catch (e) {}
    // Close settings panel when clicking outside (use toggle to correctly resume scene)
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('settings-panel');
        if (!panel) return;
        if (!panel.classList.contains('hidden') && !e.target.closest('#settings-container')) {
            // call the toggle to ensure resume logic runs if we paused
            try { window.toggleSettingsPanel(); } catch (err) { panel.classList.add('hidden'); }
        }
    });
});

// Global key state so WASD/arrow input is tracked even when the Phaser
// scene is paused or an HTML overlay has focus.
window._globalKeyState = window._globalKeyState || {
    W: false, A: false, S: false, D: false,
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
};

// Register window-level key listeners once
if (!window._globalKeyState._listenersAdded) {
    window.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k in window._globalKeyState) window._globalKeyState[k] = true;
    }, { passive: true });
    window.addEventListener('keyup', (e) => {
        const k = e.key;
        if (k in window._globalKeyState) window._globalKeyState[k] = false;
    }, { passive: true });
    window._globalKeyState._listenersAdded = true;
}

// External movement loop: when the Phaser scene is paused or inputLocked
// (modals/overlays), move the player directly based on the global key state.
// This runs every animation frame and uses the scene's speed scaling.
(function externalMovementLoop() {
    let lastTs = performance.now();
    function frame(ts) {
        const dt = Math.min(50, ts - lastTs); // cap delta to avoid large jumps
        lastTs = ts;
        try {
            const scene = phaserGame && phaserGame.scene && phaserGame.scene.scenes[0];
            if (scene && scene.player) {
                if (scene._defeatTriggered) {
                    lastTs = ts;
                    requestAnimationFrame(frame);
                    return;
                }
                const isPaused = scene.scene.isPaused();
                if (isPaused || scene.inputLocked) {
                    const gs = window._globalKeyState;
                    let vx = 0, vy = 0;
                    if (gs.W || gs.ArrowUp) vy -= 1;
                    if (gs.S || gs.ArrowDown) vy += 1;
                    if (gs.A || gs.ArrowLeft) vx -= 1;
                    if (gs.D || gs.ArrowRight) vx += 1;
                    if (vx !== 0 || vy !== 0) {
                        const speed = 200 * (scene.player.moveSpeedMultiplier || 1);
                        const len = Math.hypot(vx, vy) || 1;
                        const move = speed * (dt / 1000);
                        scene.player.x += (vx / len) * move;
                        scene.player.y += (vy / len) * move;
                        // Keep physics body in sync if present
                        if (scene.player.body && typeof scene.player.body.reset === 'function') {
                            try { scene.player.body.reset(scene.player.x, scene.player.y); } catch (e) { }
                        }
                    }
                }
            }
        } catch (e) {
            // swallow any errors to avoid stopping the loop
            console.error('externalMovementLoop error', e);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();

const waveTemplateBase = [
    {
        title: 'DATA SWARM',
        targetKills: 18,
        enemySpeed: 100,   // was 120
        spawnThreshold: 94,
        enemyColor: 0xff0033,
        description: 'A fast, hungry swarm of corrupted packets.'
    },
    {
        title: 'FIREWALL RUSH',
        targetKills: 24,
        enemySpeed: 115,   // was 160
        spawnThreshold: 92,
        enemyColor: 0xff9933,
        description: 'Stronger defenders close in with greater fury.'
    },
    {
        title: 'VIRUS HIVE',
        targetKills: 30,
        enemySpeed: 130,   // was 180
        spawnThreshold: 91,
        enemyColor: 0x33ccff,
        description: 'The hive mutates. Evade and strike precisely.'
    },
    {
        title: 'SYSTEM CORE',
        targetKills: 36,
        enemySpeed: 145,   // was 210
        spawnThreshold: 90,
        enemyColor: 0xff00ff,
        description: 'Final core defenders spawn relentlessly.'
    }
];

const powerOptionVariants = {
    heal: [
        { label: 'REPAIR (Full Heal)', detail: 'Restore maximum HP' }
    ],
    speed: [
        { label: 'ADRENALINE (-20% reload)', detail: 'Attack faster' },
        { label: 'OVERCLOCK (-25% reload)', detail: 'Your strikes land quicker' },
        { label: 'ADRENALINE (-30% reload)', detail: 'Attack even faster' },
        { label: 'NANO-FLOW (-35% reload)', detail: 'Lightning-fast slashes' }
    ],
    range: [
        { label: 'SHOCKWAVE (+range)', detail: 'Slash reaches farther' },
        { label: 'ARC LASER (+range)', detail: 'Widen your strike arc' },
        { label: 'DISRUPTOR (+range)', detail: 'Expand your attack reach' }
    ],
    shield: [
        { label: 'PHASE SHIELD (+1 hit)', detail: 'Absorb the next hit' },
        { label: 'RESONANCE SHIELD (+2 hits)', detail: 'Withstand more damage' }
    ]
};

const weaponRewardVariants = [
    {
        id: 'shard_launcher',
        label: 'SHARD LAUNCHER',
        detail: 'Arcing shard projectiles fly with each attack. Tier increases count and damage.',
        icon: '🔹'
    },
    {
        id: 'arc_bolt',
        label: 'ARC BOLT',
        detail: 'A fast piercing bolt fires toward the cursor. Tier increases damage and range.',
        icon: '⚡'
    },
    {
        id: 'plasma_orb',
        label: 'PLASMA ORB',
        detail: 'Launches a glowing orb that detonates on enemy hit. Tier increases pulse power.',
        icon: '🟣'
    },
    {
        id: 'rocket_swarm',
        label: 'ROCKET SWARM',
        detail: 'Fires explosive micro-rockets. Tier increases missile count and blast radius.',
        icon: '🚀'
    }
];

const mergeWeaponOption = {
    id: 'merge_weapons',
    label: 'ULTIMATE ARMAMENT',
    detail: 'Merge all four maxed weapon systems into a single devastating arsenal. Sacrifice all relics and lock relic pickups forever.'
};

function getRandomPowerOptions(index) {
    const ids = Object.keys(powerOptionVariants);
    const chosen = [];
    const shouldOfferWeapon = Math.random() < 0.10;

    if (shouldOfferWeapon) {
        const weapon = weaponRewardVariants[Phaser.Math.Between(0, weaponRewardVariants.length - 1)];
        chosen.push(`weapon_${weapon.id}`);
    }

    while (chosen.length < 3) {
        const pick = ids[Math.floor(Math.random() * ids.length)];
        if (!chosen.includes(pick)) chosen.push(pick);
    }

    return chosen.map((id) => {
        if (id.startsWith('weapon_')) {
            const weaponId = id.slice(7);
            const weapon = weaponRewardVariants.find(w => w.id === weaponId);
            return {
                id,
                label: weapon ? weapon.label : 'AUX WEAPON',
                detail: weapon ? weapon.detail : 'Unlock a new weapon system.'
            };
        }

        const variants = powerOptionVariants[id];
        const variant = variants[index % variants.length];
        return { id, label: variant.label, detail: variant.detail };
    });
}

function getWeaponTier(scene, weaponId) {
    return (scene.player.weaponTiers && scene.player.weaponTiers[weaponId]) || 0;
}

function getAvailableWeaponForScene(scene) {
    const choices = weaponRewardVariants.filter(w => getWeaponTier(scene, w.id) < 3);
    if (choices.length === 0) return null;
    return choices[Phaser.Math.Between(0, choices.length - 1)];
}

function hasAllWeaponsMaxed(scene) {
    return weaponRewardVariants.every(w => getWeaponTier(scene, w.id) >= 3);
}

function getEvolveOptions(scene) {
    const options = scene.currentWave.powerOptions.map(option => ({ ...option }));
    if (scene.player.weaponMerged) {
        const ids = Object.keys(powerOptionVariants);
        return options.map(option => {
            if (option.id && option.id.startsWith('weapon_')) {
                const alt = ids[Phaser.Math.Between(0, ids.length - 1)];
                const variant = powerOptionVariants[alt][0];
                return { id: alt, label: variant.label, detail: variant.detail };
            }
            return option;
        });
    }

    if (hasAllWeaponsMaxed(scene)) {
        options[0] = mergeWeaponOption;
        return options;
    }

    options.forEach((option, index) => {
        if (option.id && option.id.startsWith('weapon_')) {
            const weaponId = option.id.slice(7);
            if (getWeaponTier(scene, weaponId) >= 3) {
                const alternate = getAvailableWeaponForScene(scene);
                if (alternate) {
                    options[index] = {
                        id: `weapon_${alternate.id}`,
                        label: alternate.label,
                        detail: `${alternate.detail} Pick it again to upgrade its tier.`
                    };
                } else {
                    options[index] = mergeWeaponOption;
                }
            }
        }
    });

    if (Math.random() < 0.10) {
        const weapon = getAvailableWeaponForScene(scene);
        if (weapon) {
            const option = {
                id: `weapon_${weapon.id}`,
                label: weapon.label,
                detail: `${weapon.detail} Pick it again to upgrade its tier.`
            };
            options[Phaser.Math.Between(0, options.length - 1)] = option;
        }
    }

    return options;
}

function createWaveConfig(index) {
    const template = waveTemplateBase[index % waveTemplateBase.length];
    const phase = Math.floor(index / waveTemplateBase.length);
    const mixedWave = index >= 1; // waves after the first include a variety of enemy types

    // Speed ramps very gradually — +3% per phase cycle (4 waves), hard-capped at 1.35x base.
    // No per-wave jitter (removed index % 4) so speed never randomly jumps.
    const postScalingWave = index >= 5;
    const rawMultiplier = 1 + phase * 0.03;          // 3% per phase, was 7%
    const cappedMultiplier = Math.min(rawMultiplier, 1.35); // cap at +35%, was 1.60
    const speedMultiplier = postScalingWave
        ? cappedMultiplier * 0.88   // 12% relief after HP scaling kicks in (was 20% relief but that caused big swings)
        : cappedMultiplier;
    const spawnThreshold = postScalingWave
        ? Math.min(96, Math.max(87, template.spawnThreshold - phase * 1))
        : Math.max(84, template.spawnThreshold - phase * 1);

    return {
        title: `WAVE ${index + 1}: ${template.title}`,
        targetKills: template.targetKills + phase * 6 + (index % 3) * 2,
        enemySpeed: Math.round(template.enemySpeed * speedMultiplier),
        spawnThreshold,
        enemyColor: template.enemyColor,
        enemyTypes: mixedWave ? [0xff0033, 0xff9933, 0x33ccff, 0xff00ff] : [template.enemyColor],
        description: template.description,
        powerOptions: getRandomPowerOptions(index),
        bossWave: false
    };
}

function generateWaveConfigs() {
    const waves = [];
    for (let i = 0; i < 49; i++) {
        // Wave 10 (index 9) is the Splitter Boss wave — overridden below
        if (i === 9) {
            const defaultWave10 = createWaveConfig(i);
            waves.push({
                title: 'WAVE 10: SPLITTER HORDE',
                targetKills: 0, // cleared by killing the boss brute + all splitters
                enemySpeed: Math.round(defaultWave10.enemySpeed * 1.4),
                spawnThreshold: 0,
                enemyColor: 0xffcc00,
                enemyTypes: [0xffcc00],
                description: 'A brute commander leads a wave of splitting machines. Survive.',
                powerOptions: getRandomPowerOptions(9),
                bossWave: false,
                splitterBossWave: true, // custom flag
                bossMaxHp: 0
            });
            continue;
        }

        // Wave 25 (index 24) — second splitter boss wave, 7 splitters + commander
        if (i === 24) {
            const defaultWave25 = createWaveConfig(i);
            waves.push({
                title: 'WAVE 25: SPLITTER RESURGENCE',
                targetKills: 0,
                enemySpeed: Math.round(defaultWave25.enemySpeed * 1.3),
                spawnThreshold: 0,
                enemyColor: 0xffcc00,
                enemyTypes: [0xffcc00],
                description: 'The splitting machines return in greater numbers. A hardened commander leads them.',
                powerOptions: getRandomPowerOptions(24),
                bossWave: false,
                splitterBossWave: true,
                splitterBossCount: 7, // nerfed: exactly 7 splitters
                bossMaxHp: 0
            });
            continue;
        }

        // Wave 35 (index 34) — Void Maw miniboss: suction + spit + invincible until 2 towers die
        if (i === 34) {
            waves.push({
                title: 'WAVE 35: VOID MAW',
                targetKills: 0,
                enemySpeed: 0,
                spawnThreshold: 0,
                enemyColor: 0x9900ff,
                enemyTypes: [0x9900ff],
                description: 'A monstrous void entity emerges. Destroy its two guardian towers before you can harm it.',
                powerOptions: getRandomPowerOptions(34),
                bossWave: false,
                voidMawWave: true,
                bossMaxHp: 0
            });
            continue;
        }

        // Wave 30 (index 29) is a miniboss wave before the final gauntlet.
        if (i === 29) {
            waves.push({
                title: 'WAVE 30: CORE WARDEN',
                targetKills: 0,
                enemySpeed: 0,
                spawnThreshold: 0,
                enemyColor: 0xff0055,
                enemyTypes: [0xff0055],
                description: 'A hardened guardian emerges with supporting elites. Defeat the warden.',
                powerOptions: getRandomPowerOptions(29),
                bossWave: true,
                bossMaxHp: 95,
                bossColor: 0xff0055
            });
            continue;
        }

        waves.push(createWaveConfig(i));
    }

    waves.push({
        title: 'WAVE 50: OVERLORD ASCENDANT',
        targetKills: 0,
        enemySpeed: 0,
        spawnThreshold: 0,
        enemyColor: 0x7700ff,
        enemyTypes: [0x7700ff],
        description: 'The final major boss awakens. End the corruption or fall.',
        powerOptions: getRandomPowerOptions(49),
        bossWave: true,
        bossMaxHp: 170,
        bossColor: 0x7700ff
    });

    return waves;
}

const waveConfigs = generateWaveConfigs();
// Relic data & helpers are defined in relics.js (loaded before this file)
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Add error handling for asset loading
        this.load.on('loaderror', (file) => {
            console.error(`Failed to load ${file.type}: ${file.key} from ${file.url}`);
        });

        this.load.audio('sword', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
        this.load.audio('hit', 'hit.mp3');
        this.load.audio('relicPickup', 'relicPickup.mp3');
        this.load.image('arena1', 'arena1.png');
        this.load.image('arena2', 'arena2.png');
        this.load.image('arena3', 'arena3.jpg');
        this.load.audio('downtime', 'downtime.mp3');
        this.load.audio('fusion', 'fusion.mp3');
        this.load.audio('ambience', 'ambience.mp3');
        this.load.audio('freeze', 'freeze.mp3');
        this.load.audio('death', 'death.mp3');

        // ── Swordsman spritesheets ─────────────────────────────────────────────
        // All sheets: 64x64px frames, 4 rows = down / left / right / up
        // Sheet widths and frame counts per row:
        //   sw_idle:        768x256  12 cols  → frames 0-11 (down), 12-23 (left), 24-35 (right), 36-47 (up)
        //   sw_walk:        384x256   6 cols  → frames 0-5  (down), 6-11  (left), 12-17 (right), 18-23 (up)
        //   sw_run:         512x256   8 cols  → frames 0-7  (down), 8-15  (left), 16-23 (right), 24-31 (up)
        //   sw_attack:      512x256   8 cols  → frames 0-7  (down), 8-15  (left), 16-23 (right), 24-31 (up)
        //   sw_hurt:        320x256   5 cols  → frames 0-4  (down), 5-9   (left), 10-14 (right), 15-19 (up)
        //   sw_death:       448x256   7 cols  → frames 0-6  (down) — same anim all dirs, play once
        this.load.spritesheet('sw_idle',   'Swordsman_lvl1_Idle_with_shadow.png',   { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('sw_walk',   'Swordsman_lvl1_Walk_with_shadow.png',   { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('sw_run',    'Swordsman_lvl1_Run_with_shadow.png',    { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('sw_attack', 'Swordsman_lvl1_attack_with_shadow.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('sw_hurt',   'Swordsman_lvl1_Hurt_with_shadow.png',   { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('sw_death',  'Swordsman_lvl1_Death_with_shadow.png',  { frameWidth: 64, frameHeight: 64 });
        
        // Log when assets are fully loaded
        this.load.on('complete', () => {
            console.log('All assets loaded successfully');
        });
    }

    create() {
        
       const { width, height } = this.scale;

    // Background — three layers stacked; alpha driven by wave progress
    this.arenaBg = this.add.image(width / 2, height / 2, 'arena1');
    this.arenaBg.setDisplaySize(width, height);
    this.arenaBg.setDepth(-10);

    // Golden-hour layer (arena2) — fades in from wave 8 → 16
    this.arenaBg2 = this.add.image(width / 2, height / 2, 'arena2');
    this.arenaBg2.setDisplaySize(width, height);
    this.arenaBg2.setDepth(-9);
    this.arenaBg2.setAlpha(0);

    // Night layer (arena3) — fades in from wave 16 → 24
    this.arenaBg3 = this.add.image(width / 2, height / 2, 'arena3');
    this.arenaBg3.setDisplaySize(width, height);
    this.arenaBg3.setDepth(-8);
    this.arenaBg3.setAlpha(0);

    this.scale.on('resize', (gameSize) => {
        this.resizeGame(gameSize.width, gameSize.height);
    });

        
        // ── Register directional animations from multi-row spritesheets ─────────
        // Helper: build a frame list for one row of a sheet with `cols` columns.
        const rowFrames = (cols, row) =>
            Array.from({ length: cols }, (_, i) => ({ key: 'sw_' + rowFrames._sheet, frame: row * cols + i }));
        // We pass sheet key via a tiny helper closure instead:
        const makeFrames = (sheet, cols, row) =>
            Array.from({ length: cols }, (_, i) => ({ key: sheet, frame: row * cols + i }));
        

        // Row mapping: 0=down, 1=left, 2=right, 3=up
        const animDefs = [
            // Idle (12 frames per row)
            { key: 'sw_idle_down',  frames: makeFrames('sw_idle',   12, 0), fps: 8 },
            { key: 'sw_idle_left',  frames: makeFrames('sw_idle',   12, 1), fps: 8 },
            { key: 'sw_idle_right', frames: makeFrames('sw_idle',   12, 2), fps: 8 },
            { key: 'sw_idle_up',    frames: makeFrames('sw_idle',   12, 3), fps: 8 },
            // Walk (6 frames per row)
            { key: 'sw_walk_down',  frames: makeFrames('sw_walk',    6, 0), fps: 8 },
            { key: 'sw_walk_left',  frames: makeFrames('sw_walk',    6, 1), fps: 8 },
            { key: 'sw_walk_right', frames: makeFrames('sw_walk',    6, 2), fps: 8 },
            { key: 'sw_walk_up',    frames: makeFrames('sw_walk',    6, 3), fps: 8 },
            // Run (8 frames per row)
            { key: 'sw_run_down',   frames: makeFrames('sw_run',     8, 0), fps: 10 },
            { key: 'sw_run_left',   frames: makeFrames('sw_run',     8, 1), fps: 10 },
            { key: 'sw_run_right',  frames: makeFrames('sw_run',     8, 2), fps: 10 },
            { key: 'sw_run_up',     frames: makeFrames('sw_run',     8, 3), fps: 10 },
            // Hurt (5 frames per row, play once)
            { key: 'sw_hurt_down',  frames: makeFrames('sw_hurt',    5, 0), fps: 10, repeat: 0 },
            { key: 'sw_hurt_left',  frames: makeFrames('sw_hurt',    5, 1), fps: 10, repeat: 0 },
            { key: 'sw_hurt_right', frames: makeFrames('sw_hurt',    5, 2), fps: 10, repeat: 0 },
            { key: 'sw_hurt_up',    frames: makeFrames('sw_hurt',    5, 3), fps: 10, repeat: 0 },
            // Death (7 frames, use row 0, play once)
            { key: 'sw_death',      frames: makeFrames('sw_death',   7, 0), fps: 8,  repeat: 0 },
            // Attack (8 frames per row, play once then return to idle/walk)
            { key: 'sw_attack_down',  frames: makeFrames('sw_attack',  8, 0), fps: 16, repeat: 0 },
            { key: 'sw_attack_left',  frames: makeFrames('sw_attack',  8, 1), fps: 16, repeat: 0 },
            { key: 'sw_attack_right', frames: makeFrames('sw_attack',  8, 2), fps: 16, repeat: 0 },
            { key: 'sw_attack_up',    frames: makeFrames('sw_attack',  8, 3), fps: 16, repeat: 0 },
        ];
        animDefs.forEach(({ key, frames, fps, repeat }) => {
            if (!this.anims.exists(key)) {
                this.anims.create({ key, frames, frameRate: fps, repeat: repeat ?? -1 });
            }
        });

        // Track last facing direction so idle uses the right row
        this._facing = 'down';

        // 1. Player Setup
        // All frames are 64x64px. setScale(2) → rendered at 128x128px on screen.
        this.player = this.physics.add.sprite(width / 2, height / 2, 'sw_idle');
        this.player.setScale(2);
        this.player.setDepth(2);
        this.player.play('sw_idle_down');
        this.player.body.setCollideWorldBounds(true);
        // Physics body: 20x28px hitbox at feet, centred horizontally in the 64px frame
        this.player.body.setSize(20, 28);
        this.player.body.setOffset(22, 32);
        this.player._previousPhaseX = this.player.x;
        this.player._previousPhaseY = this.player.y;
        this.relicCap = 10;
        
        // Player Stats
        this.player.hp = 5;
        this.player.maxHp = 5;
        this.player.invulnerable = false;
        this.player.reloadModifier = 1;
        this.player.shieldCharges = 0;
        this.player.relics = [];       // Track collected relics
        this.player.fusedRelics = [];  // Track fused relics (max 2 per type)
        this.player.secretRelics = []; // Track secret relics (e.g. "It's So Cold It Burns")
        this.player.weaponTiers = {};  // Track acquired weapon systems and their tier
        this.player.weaponMerged = false;
        this.player.noRelicPickup = false;
        this.player.hasDot = false;
        this.player.dotStacks = 0;
        // One-shot mode state (set by "It's So Cold It Burns")
        this._oneShotWavesLeft = 0;
        this.canFire = true;
        // Map of enemy -> { timer, ticksLeft } for DoT tracking
        this._dotEnemies = new Map();

        // Initialize heart display
        setTimeout(() => updateHeartsDisplay(this.player.hp, this.player.maxHp), 100);

        // Player indicator — subtle shadow ring under the sprite
        this._playerRing = this.add.circle(width / 2, height / 2, 14, 0x00ff00, 0);
        this._playerRing.setStrokeStyle(1, 0x00ff88, 0.35);
        this._playerRing.setDepth(1);
        this.tweens.add({
            targets: this._playerRing,
            scaleX: 1.3, scaleY: 1.3,
            alpha: { from: 0.4, to: 0.08 },
            duration: 900,
            yoyo: true,
            loop: -1,
            ease: 'Sine.easeInOut'
        });

        // 2. Enemy Group
        this.enemies = this.physics.add.group();

        // 3. Relics Group
        this.relics = this.physics.add.group();

        // Splitter projectiles group (minor enemy projectiles)
        this.splitterProjectiles = this.physics.add.group();
        this.physics.add.overlap(this.player, this.splitterProjectiles, (p, bullet) => {
            bullet.destroy();
            this.takeDamage();
        });

        // 4. Inputs
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');

        // 5. Weapon Config
        this.currentWeapon = { range: 150, width: 1.2, reload: 400 };

        // Enemy speed modifier (used to temporarily slow enemies after upgrades)
        this.enemySpeedModifier = 1;
        this.inputLocked = false; // true during grace/evolve screens — blocks clicks
        this.bossActive = false;
        this.boss = null;
        this.bossWarningBar = null;
        this.bossAttackTimer = null;
        this.bossProjectiles = this.physics.add.group();
        this.physics.add.overlap(this.player, this.bossProjectiles, (p, bullet) => {
            bullet.destroy();
            this.takeDamage(2); // Boss hits hard — 2 hearts
        });

        this.playerProjectiles = this.physics.add.group();
        this.physics.add.overlap(this.playerProjectiles, this.enemies, (proj, enemy) => {
            if (!proj.active || !enemy.active) return;
            const damage = proj._weaponDamage || 1.5;
            enemy.hp = (enemy.hp || 1) - damage;
            if (enemy.hp <= 0) {
                if (shouldDropRelic()) {
                    this.spawnRelic(enemy.x, enemy.y);
                }
                if (enemy._isBrute && enemy._hpLabel && enemy._hpLabel.active) enemy._hpLabel.destroy();
                if (enemy._isSplitter && enemy._shotTimer) enemy._shotTimer.remove(false);
                enemy.destroy();
                score++;
                this.waveKills++;
                document.getElementById('killCount').innerText = score;
                if (this._splitterBossWaveActive) {
                    const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
                    document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
                    if (remaining === 0) {
                        this._splitterBossWaveActive = false;
                        if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true);
                        this.advanceWave();
                    }
                } else {
                    document.getElementById('waveProgress').innerText = `${this.waveKills} / ${this.currentWave.targetKills}`;
                    if (this.waveKills >= this.currentWave.targetKills) this.advanceWave();
                }
            } else {
                const prevFill = enemy.fillColor;
                if (enemy.setFillStyle) {
                    enemy.setFillStyle(0xffffff);
                    this.time.delayedCall(80, () => {
                        if (enemy && enemy.active && enemy.setFillStyle) enemy.setFillStyle(prevFill);
                    });
                }
            }
            if (!proj._piercing) proj.destroy();
        });

        // 6. Wave System
        this.waveIndex = 0;
        this.currentWave = waveConfigs[this.waveIndex];
        this.waveKills = 0;
        this.updateWaveUI();
        this.startAmbienceMusic();

        // 7. Interaction
        this.input.on('pointerdown', (pointer) => this.handleAttack(pointer));

        // 8. Collision: Enemy hits Player
        this.physics.add.overlap(this.player, this.enemies, (p, enemy) => {
            // Only play hit sound + deal damage when NOT already invulnerable
            if (!this.player.invulnerable) {
                try { this.sound.play('hit', { volume: _sfxVolume }); } catch(e) {}
            }
            // Brutes hit for 2 hearts on contact
            this.takeDamage(enemy._isBrute ? 2 : 1);
        });     

        // 9. Collision: Relic hits Player
        this.physics.add.overlap(this.player, this.relics, (p, relic) => {
            this.pickupRelic(relic);
        });
        
    }

    update() {
        if (!this.player || this.player.hp <= 0) return;

        // Movement Logic
        const speed = 200 * (this.player.moveSpeedMultiplier || 1);
        this.player.body.setVelocity(0);
        const gks = window._globalKeyState || {};
        const movingLeft  = (gks.A || gks.ArrowLeft) || (this.keys && this.keys.A && this.keys.A.isDown) || this.cursors.left.isDown;
        const movingRight = (gks.D || gks.ArrowRight) || (this.keys && this.keys.D && this.keys.D.isDown) || this.cursors.right.isDown;
        const movingUp    = (gks.W || gks.ArrowUp) || (this.keys && this.keys.W && this.keys.W.isDown) || this.cursors.up.isDown;
        const movingDown  = (gks.S || gks.ArrowDown) || (this.keys && this.keys.S && this.keys.S.isDown) || this.cursors.down.isDown;
        const isMoving    = movingLeft || movingRight || movingUp || movingDown;

        if (!this.player._frozen) {
            if (movingLeft)  this.player.body.setVelocityX(-speed);
            if (movingRight) this.player.body.setVelocityX(speed);
            if (movingUp)    this.player.body.setVelocityY(-speed);
            if (movingDown)  this.player.body.setVelocityY(speed);
        }

        // ── Directional animation ─────────────────────────────────────────────
        if (this.player.anims && !this.player._playingHurt && !this.player._playingAttack) {
            // Update facing direction from movement
            if (movingLeft)       this._facing = 'left';
            else if (movingRight) this._facing = 'right';
            else if (movingUp)    this._facing = 'up';
            else if (movingDown)  this._facing = 'down';

            const dir = this._facing || 'down';

            let targetAnim;
            if (!isMoving || this.player._frozen) {
                targetAnim = `sw_idle_${dir}`;
            } else {
                targetAnim = `sw_walk_${dir}`;
            }

            if (this.player.anims.currentAnim?.key !== targetAnim) {
                this.player.play(targetAnim, true);
            }
        }

        // Keep aegis ring centered on player
        if (this._aegisRing && this._aegisRing.active) {
            this._aegisRing.x = this.player.x;
            this._aegisRing.y = this.player.y;
        }

        // Keep player indicator ring centered
        if (this._playerRing && this._playerRing.active) {
            this._playerRing.x = this.player.x;
            this._playerRing.y = this.player.y;
        }

        if (!this.player._frozen && this.player.phaseStride) {
            const prevX = this.player._previousPhaseX ?? this.player.x;
            const prevY = this.player._previousPhaseY ?? this.player.y;
            const movedDistance = Phaser.Math.Distance.Between(this.player.x, this.player.y, prevX, prevY);
            if (movedDistance > 30) {
                this._leaveAfterImage(prevX, prevY);
                this.player._previousPhaseX = this.player.x;
                this.player._previousPhaseY = this.player.y;
            }
        } else {
            this.player._previousPhaseX = this.player.x;
            this.player._previousPhaseY = this.player.y;
        }

        // Enemy Spawning (Random chance per frame) — disabled during splitter boss wave and void maw wave
        if (!this.bossActive && !this.currentWave.bossWave && !this._splitterBossWaveActive && !this._voidMawWaveActive && Phaser.Math.Between(0, 100) > this.currentWave.spawnThreshold) {
            this.spawnEnemy();
        }

        // Thaw player if freeze duration elapsed (timestamp — survives scene pause)
        if (this.player._frozen && this.player._frozenUntil && Date.now() >= this.player._frozenUntil) {
            this.player._frozen = false;
            this.player._frozenUntil = 0;
            this.player.clearTint();
        }

        // Enemy AI: Follow Player (respect temporary modifier; skip frozen enemies)
        this.enemies.getChildren().forEach(enemy => {
            // Track brute HP label position
            if (enemy._isBrute && enemy._hpLabel && enemy._hpLabel.active) {
                enemy._hpLabel.x = enemy.x;
                enemy._hpLabel.y = enemy.y - 34;
            }
            // Thaw enemy if freeze duration elapsed (timestamp — survives scene pause)
            if (enemy._frozen && enemy._frozenUntil && Date.now() >= enemy._frozenUntil) {
                enemy._frozen = false;
                enemy._frozenUntil = 0;
                if (enemy.setFillStyle && enemy._origColor !== undefined) {
                    enemy.setFillStyle(enemy._origColor);
                }
            }
            if (enemy._frozen) {
                if (enemy.body) enemy.body.setVelocity(0);
                // Cryo Burst: shatter check while frozen
                if (enemy._cryoBurst && !enemy._shatterChecked) {
                    enemy._shatterChecked = true;
                    if (Math.random() < 0.55) {
                        this.time.delayedCall(Phaser.Math.Between(300, 900), () => {
                            if (enemy && enemy.active && enemy._frozen) {
                                this.cryoBurstShatter(enemy);
                            }
                        });
                    }
                }
                return;
            }
            // Reset shatter check when thawed so it can trigger next freeze
            if (enemy._cryoBurst) enemy._shatterChecked = false;

            const speed = this.currentWave.enemySpeed * (this.enemySpeedModifier || 1);
            // Cryo burst enemies move slightly faster; Brutes are very slow
            let spd = speed;
            if (enemy._cryoBurst) spd = speed * 1.2;
            if (enemy._isBrute)   spd = Math.min(speed * 0.32, 68); // capped slow
            if (enemy._isBrute && enemy._bruteSpeedBoost) spd = Math.min(spd * enemy._bruteSpeedBoost, 90);
            this.physics.moveToObject(enemy, this.player, spd);
        });
    }

    handleAttack(pointer) {
        if (this.inputLocked) return;  // grace / evolve screens are open
        if (!this.canFire) return;
        this.canFire = false;

        // Sound effect
        this.sound.play('sword', { volume: 0.4 * _sfxVolume });

        // Update facing toward click before playing attack anim
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        const deg = Phaser.Math.RadToDeg(angle);
        if (deg > -45 && deg <= 45)        this._facing = 'right';
        else if (deg > 45 && deg <= 135)   this._facing = 'down';
        else if (deg > 135 || deg <= -135) this._facing = 'left';
        else                               this._facing = 'up';

        // Play directional attack animation (play once, then resume movement anim)
        const attackAnim = `sw_attack_${this._facing}`;
        this.player._playingAttack = true;
        this.player.play(attackAnim, true);
        this.player.once('animationcomplete', () => {
            this.player._playingAttack = false;
        });
        
        // Slash Visual — blue/purple arc with particle burst
        const arc = this.add.graphics();

        // Outer glow layer (purple tint) — kept subtle so rapid clicks don't stack blindingly
        arc.fillStyle(0x6600ff, 0.10);
        arc.slice(this.player.x, this.player.y, this.currentWeapon.range, angle - this.currentWeapon.width / 2, angle + this.currentWeapon.width / 2);
        arc.fillPath();

        // Inner core layer (electric blue)
        arc.fillStyle(0x44aaff, 0.28);
        arc.slice(this.player.x, this.player.y, this.currentWeapon.range * 0.7, angle - this.currentWeapon.width / 2, angle + this.currentWeapon.width / 2);
        arc.fillPath();

        // Bright edge highlight
        arc.lineStyle(1.5, 0xaaddff, 0.7);
        arc.beginPath();
        arc.arc(this.player.x, this.player.y, this.currentWeapon.range, angle - this.currentWeapon.width / 2, angle + this.currentWeapon.width / 2);
        arc.strokePath();

        // Auxiliary weapon projectiles
        if (this.player.weaponTiers && Object.keys(this.player.weaponTiers).length > 0) {
            this.fireAuxProjectiles(angle);
        }

        // Particle burst — reduced count so rapid fire stays readable
        const particleColors = [0x4488ff, 0x7733ff, 0xaaddff, 0x9900ff, 0x00ccff];
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const t = i / (particleCount - 1);
            const spreadAngle = (angle - this.currentWeapon.width / 2) + t * this.currentWeapon.width;
            const dist = Phaser.Math.Between(this.currentWeapon.range * 0.3, this.currentWeapon.range * 0.85);
            const px = this.player.x + Math.cos(spreadAngle) * dist;
            const py = this.player.y + Math.sin(spreadAngle) * dist;
            const size = Phaser.Math.Between(2, 4);
            const col = particleColors[Phaser.Math.Between(0, particleColors.length - 1)];
            const p = this.add.circle(px, py, size, col, 0.75);
            p.setDepth(5);

            const driftX = Math.cos(spreadAngle) * Phaser.Math.Between(6, 18);
            const driftY = Math.sin(spreadAngle) * Phaser.Math.Between(6, 18);
            this.tweens.add({
                targets: p,
                x: px + driftX,
                y: py + driftY,
                alpha: 0,
                scaleX: 0.1,
                scaleY: 0.1,
                duration: Phaser.Math.Between(100, 200),
                ease: 'Power2',
                onComplete: () => p.destroy()
            });
        }

        // Hit Detection
        this.enemies.getChildren().forEach(enemy => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            let diff = Math.abs(Phaser.Math.Angle.Wrap(angle - angleToEnemy));

            if (dist < this.currentWeapon.range && diff < this.currentWeapon.width / 2) {
                // Base damage 1.5 + any bonus from Fracture Lens (max +2)
                let dmg = 1.5 + (this.player.bonusDamage || 0);
                // ONE-SHOT MODE: "It's So Cold It Burns" active
                if (this._oneShotWavesLeft > 0) dmg = 99999;
                enemy.hp = (enemy.hp || 1) - dmg;

                // Cryo Shard: freeze the enemy on slash hit
                if (this.player.hasCryo && !enemy._frozen && !enemy._immuneToFreeze) {
                    this.applyCryoToEnemy(enemy);
                }

                // Cryo Burst: if already frozen when slashed, shatter immediately
                if (enemy._cryoBurst && enemy._frozen) {
                    this.cryoBurstShatter(enemy);
                    return;
                }

                // Voltfire Matrix DoT: apply burn on slash hit (not on contact)
                if (this.player.hasDot && !this._dotEnemies.has(enemy)) {
                    this.applyDotToEnemy(enemy);
                }

                // Flash white on hit
                if (enemy.hp > 0) {
                    const prevFill = enemy.fillColor;
                    enemy.setFillStyle(0xffffff);
                    this.time.delayedCall(80, () => { if (enemy.active) enemy.setFillStyle(prevFill); });
                    // Update brute HP label
                    if (enemy._isBrute && enemy._hpLabel && enemy._hpLabel.active) {
                        enemy._hpLabel.setText(`HP: ${Math.max(0, Math.ceil(enemy.hp))}`);
                        enemy._hpLabel.x = enemy.x;
                        enemy._hpLabel.y = enemy.y - 34;
                    }
                    return; // still alive
                }

                // Enemy dies
                if (shouldDropRelic()) {
                    this.spawnRelic(enemy.x, enemy.y);
                }

                // Brute death: clean up label and slam timer
                if (enemy._isBrute) {
                    if (enemy._slamTimer) enemy._slamTimer.remove(false);
                    if (enemy._hpLabel && enemy._hpLabel.active) enemy._hpLabel.destroy();
                    // Death shockwave
                    this._bruteDeathExplosion(enemy.x, enemy.y);
                }

                // Splitter: clean up shot timer and spawn 2 fragments
                if (enemy._isSplitter) {
                    if (enemy._shotTimer) enemy._shotTimer.remove(false);
                    this._spawnSplitterFragments(enemy.x, enemy.y);
                }

                enemy.destroy();
                score++;
                this.waveKills++;
                document.getElementById('killCount').innerText = score;

                // Splitter Boss Wave: advance only when every enemy is dead
                if (this._splitterBossWaveActive) {
                    const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
                    document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
                    if (remaining === 0) {
                        this._splitterBossWaveActive = false;
                        if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true);
                        this.advanceWave();
                    }
                    return;
                }

                document.getElementById('waveProgress').innerText = `${this.waveKills} / ${this.currentWave.targetKills}`;

                if (this.waveKills >= this.currentWave.targetKills) {
                    this.advanceWave();
                }
            }
        });

        if (this.bossActive && this.boss && this.boss.active) {
            const bossDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
            const angleToBoss = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
            const bossDiff = Math.abs(Phaser.Math.Angle.Wrap(angle - angleToBoss));

            if (bossDist < this.currentWeapon.range && bossDiff < this.currentWeapon.width / 2) {
                let bossDmg = 6;
                if (this._oneShotWavesLeft > 0) {
                    // Deal 25% of boss max HP, then disable one-shot (consumed on boss hit)
                    bossDmg = Math.ceil((this.boss.maxHp || 70) * 0.25);
                    this._oneShotWavesLeft = 0;
                    updateSecretRelicHUD();
                    this._showOneShotExpiredNotice('Used on boss: -25% MAX HP!');
                }
                this.damageBoss(bossDmg);
            }
        }

        // Phase 2: slash hits minibosses
        if (this._bossPhase2Active && this._phase2Bosses) {
            this._phase2Bosses.forEach(mb => {
                if (!mb || !mb.active) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, mb.x, mb.y);
                const ang2 = Phaser.Math.Angle.Between(this.player.x, this.player.y, mb.x, mb.y);
                const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - ang2));
                if (dist < this.currentWeapon.range && diff < this.currentWeapon.width / 2) {
                    let dmg = 6 + (this.player.bonusDamage || 0);
                    if (this._oneShotWavesLeft > 0) dmg = 99999;
                    this._damageMiniBoss(mb, dmg);
                }
            });
        }

        // Void Maw wave: slash hits towers and the maw itself
        if (this._voidMawWaveActive) {
            // Hit towers
            if (this._voidMawTowers) {
                this._voidMawTowers.forEach(tower => {
                    if (!tower || !tower.active) return;
                    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tower.x, tower.y);
                    const ang2 = Phaser.Math.Angle.Between(this.player.x, this.player.y, tower.x, tower.y);
                    const diff = Math.abs(Phaser.Math.Angle.Wrap(angle - ang2));
                    if (dist < this.currentWeapon.range + 20 && diff < this.currentWeapon.width / 2) {
                        let dmg = 6 + (this.player.bonusDamage || 0);
                        if (this._oneShotWavesLeft > 0) dmg = 99999;
                        tower.hp -= dmg;
                        // Flash tower
                        tower.setFillStyle(0xffffff);
                        this.time.delayedCall(100, () => { if (tower && tower.active) tower.setFillStyle(0x6600aa); });
                        if (tower._hpLabel) tower._hpLabel.setText(`TOWER ${tower._towerIdx + 1}: ${Math.max(0, tower.hp)}`);
                        if (tower.hp <= 0) {
                            this._onVoidTowerDeath(tower);
                            // Remove from towers array
                            if (this._voidMawTowers) {
                                const idx = this._voidMawTowers.indexOf(tower);
                                if (idx !== -1) this._voidMawTowers.splice(idx, 1);
                            }
                        }
                    }
                });
            }
            // Hit the Void Maw itself
            if (this._voidMaw && this._voidMaw.active) {
                const mawDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this._voidMaw.x, this._voidMaw.y);
                const mawAng = Phaser.Math.Angle.Between(this.player.x, this.player.y, this._voidMaw.x, this._voidMaw.y);
                const mawDiff = Math.abs(Phaser.Math.Angle.Wrap(angle - mawAng));
                if (mawDist < this.currentWeapon.range + 40 && mawDiff < this.currentWeapon.width / 2) {
                    let dmg = 6 + (this.player.bonusDamage || 0);
                    if (this._oneShotWavesLeft > 0) dmg = 99999;
                    this._damageVoidMaw(dmg);
                }
            }
        }

        // Fade Slash — quick fade so stacked arcs don't linger
        this.tweens.add({ targets: arc, alpha: 0, duration: 120, onComplete: () => arc.destroy() });

        // Cooldown
        this.time.delayedCall(this.currentWeapon.reload * this.player.reloadModifier, () => {
            this.canFire = true;
        });
    }

    fireAuxProjectiles(angle) {
        const tiers = this.player.weaponTiers || {};
        const merged = this.player.weaponMerged;
        const originX = this.player.x;
        const originY = this.player.y;

        if (merged) {
            const proj = this.add.circle(originX, originY, 10, 0xffdd66, 1);
            this.physics.add.existing(proj);
            proj.body.setVelocity(Math.cos(angle) * 520, Math.sin(angle) * 520);
            proj.body.setAllowGravity(false);
            proj.body.setCircle(10);
            proj._weaponDamage = 4.5;
            proj._piercing = true;
            proj.setDepth(5);
            this.playerProjectiles.add(proj);
            this.time.delayedCall(600, () => { if (proj && proj.active) proj.destroy(); });
            return;
        }

        weaponRewardVariants.forEach((weapon) => {
            const tier = tiers[weapon.id] || 0;
            if (tier === 0) return;
            const count = Math.min(1 + tier, 4);
            const speed = 340 + tier * 40;
            const baseDamage = 1.2 + tier * 0.5;
            const spread = 0.18 + tier * 0.04;
            for (let i = 0; i < count; i++) {
                const offset = (i - (count - 1) / 2) * spread;
                const projAngle = angle + offset;
                const color = weapon.id === 'rocket_swarm' ? 0xff8844 : weapon.id === 'plasma_orb' ? 0x9966ff : weapon.id === 'arc_bolt' ? 0x66ccff : 0x88eeff;
                const size = weapon.id === 'plasma_orb' ? 10 : 6;
                const proj = this.add.circle(originX, originY, size, color, 0.95);
                this.physics.add.existing(proj);
                proj.body.setAllowGravity(false);
                proj.body.setVelocity(Math.cos(projAngle) * speed, Math.sin(projAngle) * speed);
                proj.body.setCircle(size);
                proj._weaponDamage = baseDamage + (weapon.id === 'rocket_swarm' ? 0.5 : 0);
                proj._piercing = weapon.id === 'arc_bolt';
                proj.setDepth(5);
                this.playerProjectiles.add(proj);
                this.time.delayedCall(600 + tier * 80, () => { if (proj && proj.active) proj.destroy(); });
            }
        });
    }

    _leaveAfterImage(x, y) {
        const trail = this.add.circle(x, y, 14, 0xffcc66, 0.28);
        trail.setDepth(1);
        this.tweens.add({
            targets: trail,
            alpha: 0,
            scaleX: 0.4,
            scaleY: 0.4,
            duration: 260,
            ease: 'Power1',
            onComplete: () => trail.destroy()
        });

        const damage = 1 * Math.max(1, this.player.phaseStrideStacks || 1);
        this.enemies.getChildren().forEach(enemy => {
            if (!enemy || !enemy.active) return;
            const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
            if (dist <= 24) {
                this._damageEnemyFromAfterImage(enemy, damage);
            }
        });
    }

    _damageEnemyFromAfterImage(enemy, amount) {
        if (!enemy || !enemy.active) return;

        enemy.hp = Math.max(0, (enemy.hp || 1) - amount);
        const prevColor = enemy.fillColor;
        if (enemy.setFillStyle) {
            enemy.setFillStyle(0xffffff);
            this.time.delayedCall(80, () => {
                if (enemy && enemy.active && enemy.setFillStyle) enemy.setFillStyle(prevColor);
            });
        }

        if (enemy.hp <= 0) {
            if (shouldDropRelic()) this.spawnRelic(enemy.x, enemy.y);
            if (enemy._shotTimer) enemy._shotTimer.remove(false);
            if (enemy._isSplitter) this._spawnSplitterFragments(enemy.x, enemy.y);
            if (enemy._isBrute) {
                if (enemy._slamTimer) enemy._slamTimer.remove(false);
                if (enemy._hpLabel && enemy._hpLabel.active) enemy._hpLabel.destroy();
                this._bruteDeathExplosion(enemy.x, enemy.y);
            }
            enemy.destroy();
            score++;
            this.waveKills++;
            document.getElementById('killCount').innerText = score;

            if (this._splitterBossWaveActive) {
                const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
                document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
                if (remaining === 0) {
                    this._splitterBossWaveActive = false;
                    if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true);
                    this.advanceWave();
                }
            } else {
                document.getElementById('waveProgress').innerText = `${this.waveKills} / ${this.currentWave.targetKills}`;
                if (this.waveKills >= this.currentWave.targetKills) this.advanceWave();
            }
        }
    }

    spawnEnemy() {
        // After wave 2: 28% chance to spawn a Cryo Burst enemy instead of a normal one
        if (this.waveIndex >= 2 && Math.random() < 0.28) {
            return this.spawnCryoBurstEnemy();
        }

        const spawnAngle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(spawnAngle) * 400;
        const y = this.player.y + Math.sin(spawnAngle) * 400;
        
        const enemyColor = this.currentWave.enemyTypes && this.currentWave.enemyTypes.length
            ? Phaser.Math.RND.pick(this.currentWave.enemyTypes)
            : this.currentWave.enemyColor;
        const enemy = this.add.circle(x, y, 8, enemyColor);
        this.enemies.add(enemy);
        this.physics.add.existing(enemy);
        this._shrinkEnemyHitbox(enemy, 8, 0.65);

        // HP scaling: every 5 waves enemies gain +1 max HP
        // Wave 1-4 = 1hp, Wave 5-9 = 2hp, Wave 10-14 = 3hp, etc.
        const hpTier = Math.floor(this.waveIndex / 5);
        enemy.hp = 1 + hpTier;
        enemy.maxHp = enemy.hp;

        // Visual indicator for tankier enemies: stroke thickness grows with HP
        if (hpTier > 0) {
            const strokeColor = hpTier >= 3 ? 0xffffff : hpTier >= 2 ? 0xffcc00 : 0xaaaaaa;
            enemy.setStrokeStyle(1 + hpTier, strokeColor);
        }
    }

    _shrinkEnemyHitbox(enemy, radius, scale = 0.6) {
        if (!enemy || !enemy.body) return;
        const body = enemy.body;
        const diameter = radius * 2 * scale;
        if (body.setCircle) {
            body.setCircle(radius * scale, radius - (diameter / 2), radius - (diameter / 2));
        } else {
            body.setSize(diameter, diameter);
            body.setOffset(radius - diameter / 2, radius - diameter / 2);
        }
    }

    spawnRelic(x, y) {
        // Cap: max 5 relics on the ground at once — keeps the arena readable
        if (this.relics.getChildren().length >= 5) return;

        // Get random relic for current wave
        const relic = getRandomRelicForWave(this.waveIndex);
        
        // Create relic visual
        const relicSprite = this.add.circle(x, y, 12, relic.color);
        relicSprite.setStrokeStyle(2, 0xffffff);
        
        // Store relic data
        relicSprite.relicData = relic;
        
        this.relics.add(relicSprite);
        this.physics.add.existing(relicSprite);
        
        // Add pulsing animation
        this.tweens.add({
            targets: relicSprite,
            scale: { from: 1, to: 1.3 },
            duration: 600,
            yoyo: true,
            loop: -1
        });

        // Remove relic after 10 seconds if not picked up
        this.time.delayedCall(10000, () => {
            if (relicSprite && relicSprite.active) {
                relicSprite.destroy();
            }
        });
    }

    // ── SPLITTER ENEMY ──────────────────────────────────────────
    // Weaker echo of the boss split — 2 HP, fires 2 slow aimed shots,
    // fractures into 2 tiny fragment enemies on death.
    // Spawns in groups of 2-3 every 6 waves.
    spawnSplitterEnemy() {
        const { width, height } = this.scale;
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        if (edge === 0)      { x = Phaser.Math.Between(40, width - 40); y = 40; }
        else if (edge === 1) { x = Phaser.Math.Between(40, width - 40); y = height - 40; }
        else if (edge === 2) { x = 40; y = Phaser.Math.Between(40, height - 40); }
        else                 { x = width - 40; y = Phaser.Math.Between(40, height - 40); }

        const splitter = this.add.circle(x, y, 17, 0xffcc00);
        splitter.setStrokeStyle(3, 0xffffff);
        splitter.setDepth(2);
        this.enemies.add(splitter);
        this.physics.add.existing(splitter);
        splitter.body.setCollideWorldBounds(true);
        this._shrinkEnemyHitbox(splitter, 17, 0.65);
        // HP scales with wave tier but always at least 5 — noticeably tankier than normals
        const splitterTier = Math.floor(this.waveIndex / 5);
        splitter.hp = 5 + splitterTier * 2;
        splitter.maxHp = splitter.hp;
        splitter._isSplitter = true;
        splitter._origColor = 0xffcc00;

        // Pulsing glow to distinguish from normal enemies
        this.tweens.add({
            targets: splitter, scaleX: 1.18, scaleY: 1.18,
            duration: 450, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
        });

        // Fire 3 spread shots every 1.4–2s
        const shotTimer = this.time.addEvent({
            delay: 1400 + Phaser.Math.Between(0, 600),
            loop: true,
            callback: () => {
                if (!splitter || !splitter.active) { shotTimer.remove(false); return; }
                this._splitterFireShot(splitter, 0);
                this.time.delayedCall(180, () => {
                    if (splitter && splitter.active) this._splitterFireShot(splitter, 0.22);
                });
                this.time.delayedCall(360, () => {
                    if (splitter && splitter.active) this._splitterFireShot(splitter, -0.22);
                });
            }
        });
        splitter._shotTimer = shotTimer;

        return splitter;
    }

    _splitterFireShot(splitter, angleOffset) {
        const baseAngle = Phaser.Math.Angle.Between(splitter.x, splitter.y, this.player.x, this.player.y);
        const a = baseAngle + angleOffset;
        const proj = this.add.circle(splitter.x, splitter.y, 5, 0xffee00);
        proj.setStrokeStyle(1, 0xffffff);
        this.splitterProjectiles.add(proj);
        this.physics.add.existing(proj);
        proj.body.setAllowGravity(false);
        proj.body.setCollideWorldBounds(true);
        const spd = 185 + Phaser.Math.Between(0, 40); // deliberately slow
        proj.body.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
        this.time.delayedCall(5000, () => { if (proj && proj.active) proj.destroy(); });
    }

    _spawnSplitterFragments(x, y) {
        for (let i = 0; i < 2; i++) {
            const ang = (Math.PI * 2 / 2) * i + Math.random() * 0.6;
            const fx = x + Math.cos(ang) * 20;
            const fy = y + Math.sin(ang) * 20;
            const frag = this.add.circle(fx, fy, 6, 0xffaa00);
            frag.setStrokeStyle(1, 0xffffff);
            frag.setDepth(2);
            this.enemies.add(frag);
            this.physics.add.existing(frag);
            frag.body.setCollideWorldBounds(true);
            this._shrinkEnemyHitbox(frag, 6, 0.65);
            frag.hp = 2;
            frag.maxHp = 2;
            frag._isSplitterFrag = true;
            const spd = 160;
            frag.body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
            this.time.delayedCall(320, () => {
                if (frag && frag.active) frag.body.setVelocity(0, 0);
            });
        }
    }

    // ── CRYO BURST ENEMY ────────────────────────────────────────
    // Crystalline enemy. When frozen by Cryo Shard (55% chance),
    // it SHATTERS — AoE ice shards hit nearby enemies and may freeze the player.
    _bruteDeathExplosion(x, y) {
        const colors = [0xff4400, 0xff8800, 0xffffff, 0xcc2200];
        for (let i = 0; i < 16; i++) {
            const ang = (Math.PI * 2 / 16) * i;
            const spark = this.add.circle(x, y, 5, colors[i % colors.length]);
            spark.setDepth(6);
            this.tweens.add({
                targets: spark,
                x: x + Math.cos(ang) * 60, y: y + Math.sin(ang) * 60,
                alpha: 0, scaleX: 0.2, scaleY: 0.2,
                duration: 550, ease: 'Power2',
                onComplete: () => spark.destroy()
            });
        }
        this.cameras.main.shake(300, 0.018 * _shakeMultiplier);
    }

    spawnCryoBurstEnemy() {
        const spawnAngle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(spawnAngle) * 420;
        const y = this.player.y + Math.sin(spawnAngle) * 420;

        const cryo = this.add.circle(x, y, 10, 0x88eeff);
        cryo.setStrokeStyle(2, 0xffffff);
        cryo.setDepth(2);
        this.enemies.add(cryo);
        this.physics.add.existing(cryo);
        cryo.body.setCollideWorldBounds(true);
        this._shrinkEnemyHitbox(cryo, 10, 0.65);
        const hpTier = Math.floor(this.waveIndex / 5);
        cryo.hp = 1 + hpTier;
        cryo.maxHp = cryo.hp;
        cryo._cryoBurst = true;
        cryo._shatterChecked = false;
        cryo._origColor = 0x88eeff;

        // Crystalline spin animation
        this.tweens.add({
            targets: cryo, angle: 360,
            duration: 1800, loop: -1, ease: 'Linear'
        });

        return cryo;
    }

    // Called when a cryo-burst enemy shatters while frozen
    cryoBurstShatter(enemy) {
        if (!enemy || !enemy.active) return;
        const x = enemy.x, y = enemy.y;

        // Kill the enemy (counts as a kill)
        if (shouldDropRelic()) this.spawnRelic(x, y);
        if (enemy._shotTimer) enemy._shotTimer.remove(false);
        enemy.destroy();
        score++;
        this.waveKills++;
        document.getElementById('killCount').innerText = score;
        if (this._splitterBossWaveActive) {
            const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
            document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
            if (remaining === 0) { this._splitterBossWaveActive = false; if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true); this.advanceWave(); }
            return;
        }
        document.getElementById('waveProgress').innerText = `${this.waveKills} / ${this.currentWave.targetKills}`;
        if (this.waveKills >= this.currentWave.targetKills) { this.advanceWave(); return; }

        // ── Shatter burst visual ─────────────────────────────────
        const SHARD_RADIUS = 130;
        const shardCount = 8;
        for (let i = 0; i < shardCount; i++) {
            const ang = (Math.PI * 2 / shardCount) * i;
            const shard = this.add.circle(x, y, 4, 0xaaeeff, 1);
            shard.setDepth(6);
            this.tweens.add({
                targets: shard,
                x: x + Math.cos(ang) * SHARD_RADIUS,
                y: y + Math.sin(ang) * SHARD_RADIUS,
                alpha: 0, scaleX: 0.3, scaleY: 0.3,
                duration: 420, ease: 'Power2',
                onComplete: () => shard.destroy()
            });
        }
        // Expanding ring
        const ring = this.add.circle(x, y, 10, 0x88eeff, 0);
        ring.setStrokeStyle(2, 0xaaeeff);
        ring.setDepth(5);
        this.tweens.add({
            targets: ring, scaleX: SHARD_RADIUS / 10, scaleY: SHARD_RADIUS / 10,
            alpha: 0, duration: 380, ease: 'Power1',
            onComplete: () => ring.destroy()
        });

        // ── AoE: damage + freeze nearby enemies ──────────────────
        this.enemies.getChildren().forEach(other => {
            if (!other || !other.active) return;
            const dist = Phaser.Math.Distance.Between(x, y, other.x, other.y);
            if (dist < SHARD_RADIUS) {
                other.hp -= 2;
                if (!other._frozen) this.applyCryoToEnemy(other);
                if (other.hp <= 0) {
                    if (shouldDropRelic()) this.spawnRelic(other.x, other.y);
                    if (other._shotTimer) other._shotTimer.remove(false);
                    other.destroy();
                    score++;
                    this.waveKills++;
                    document.getElementById('killCount').innerText = score;
                    if (this._splitterBossWaveActive) {
                        const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
                        document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
                        if (remaining === 0) { this._splitterBossWaveActive = false; if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true); this.advanceWave(); return; }
                    } else {
                        document.getElementById('waveProgress').innerText = `${this.waveKills} / ${this.currentWave.targetKills}`;
                        if (this.waveKills >= this.currentWave.targetKills) { this.advanceWave(); return; }
                    }
                } else {
                    const prev = other.fillColor;
                    other.setFillStyle(0xaaeeff);
                    this.time.delayedCall(100, () => { if (other.active) other.setFillStyle(prev); });
                }
            }
        });

        // ── 35% chance to FREEZE the player if close enough ──────
        const playerDist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (playerDist < SHARD_RADIUS && Math.random() < 0.25) {
            this._freezePlayer();
        }
    }

    // Briefly stuns/freezes the player (can't move for 1.2s)
    _freezePlayer() {
        if (this.player._frozen || this.player.invulnerable) return;
        this.player._frozen = true;
        this.player._frozenUntil = Date.now() + 1200;

        // Sprite uses tint, not setFillStyle
        this.player.setTint(0x88eeff);

        const txt = this.add.text(this.player.x, this.player.y - 28, '❄ FROZEN!',
            { fontFamily: 'VT323', fontSize: '20px', color: '#88eeff',
              stroke: '#000', strokeThickness: 3 });
        txt.setOrigin(0.5).setDepth(10);
        this.tweens.add({ targets: txt, alpha: 0, y: txt.y - 22,
            duration: 900, onComplete: () => txt.destroy() });
    }

    // ── BRUTE ENEMY ──────────────────────────────────────────────
    // Massive, very slow juggernaut. Spawns after wave 10.
    // High HP, hits for 2 hearts on contact. Cannot be frozen.
    // Telegraphs a ground slam — screen shake + shockwave ring warning.
    spawnBruteEnemy() {
        const { width, height } = this.scale;
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        if (edge === 0)      { x = Phaser.Math.Between(60, width - 60); y = 60; }
        else if (edge === 1) { x = Phaser.Math.Between(60, width - 60); y = height - 60; }
        else if (edge === 2) { x = 60; y = Phaser.Math.Between(60, height - 60); }
        else                 { x = width - 60; y = Phaser.Math.Between(60, height - 60); }

        const brute = this.add.circle(x, y, 24, 0xcc2200);
        brute.setStrokeStyle(4, 0xff6600);
        brute.setDepth(3);
        this.enemies.add(brute);
        this.physics.add.existing(brute);
        brute.body.setCollideWorldBounds(true);
        this._shrinkEnemyHitbox(brute, 24, 0.75);

        // HP: substantial — scales up with wave
        const bruteTier = Math.floor((this.waveIndex - 10) / 5);
        brute.hp = 12 + bruteTier * 4;
        brute.maxHp = brute.hp;
        brute._isBrute = true;
        brute._origColor = 0xcc2200;
        // Brutes are immune to freeze
        brute._immuneToFreeze = true;

        // Slow, ominous pulsing — grows slightly as it approaches
        this.tweens.add({
            targets: brute, scaleX: 1.08, scaleY: 1.08,
            duration: 700, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
        });

        // Ground slam: every 4s, telegraph then shockwave outward
        const slamTimer = this.time.addEvent({
            delay: 4000 + Phaser.Math.Between(0, 1000),
            loop: true,
            callback: () => {
                if (!brute || !brute.active) { slamTimer.remove(false); return; }
                this._bruteGroundSlam(brute);
            }
        });
        brute._slamTimer = slamTimer;

        // Floating HP label above brute
        const hpLabel = this.add.text(brute.x, brute.y - 34, `HP: ${brute.hp}`,
            { fontFamily: 'VT323', fontSize: '16px', color: '#ff8888', stroke: '#000', strokeThickness: 3 });
        hpLabel.setOrigin(0.5).setDepth(8);
        brute._hpLabel = hpLabel;

        return brute;
    }

    _bruteGroundSlam(brute) {
        // 1. Telegraph: orange expanding warning ring
        const warnRing = this.add.circle(brute.x, brute.y, 12, 0xff6600, 0);
        warnRing.setStrokeStyle(3, 0xff6600);
        warnRing.setDepth(4);
        this.tweens.add({
            targets: warnRing, scaleX: 12, scaleY: 12, alpha: 0,
            duration: 600, ease: 'Power1',
            onComplete: () => warnRing.destroy()
        });

        // 2. After short delay: actual shockwave — damages player if close
        this.time.delayedCall(650, () => {
            if (!brute || !brute.active) return;
            const SLAM_RADIUS = 100;

            const slamRing = this.add.circle(brute.x, brute.y, 10, 0xff4400, 0);
            slamRing.setStrokeStyle(4, 0xff4400);
            slamRing.setDepth(5);
            this.tweens.add({
                targets: slamRing, scaleX: SLAM_RADIUS / 10, scaleY: SLAM_RADIUS / 10, alpha: 0,
                duration: 300, ease: 'Power2',
                onComplete: () => slamRing.destroy()
            });

            // Camera shake for weight
            this.cameras.main.shake(180, 0.012 * _shakeMultiplier);

            // If player is in range, deal 2 hearts
            const dist = Phaser.Math.Distance.Between(brute.x, brute.y, this.player.x, this.player.y);
            if (dist < SLAM_RADIUS + 20) {
                this.takeDamage(2);
            }
        });
    }

    // ── VOID MAW (Wave 35 Miniboss) ──────────────────────────────
    // A colossal void entity. Sucks the player toward it, then spits them across
    // the arena. Immune to damage until both guardian towers are destroyed.
    _spawnVoidMaw() {
        const { width, height } = this.scale;
        const cx = width / 2;
        const cy = height / 2;

        // ── Show intro banner
        this._showWaveAlert('👁 THE VOID MAW AWAKENS', '#9900ff');
        this.time.delayedCall(1200, () => this._showWaveAlert('⚠ DESTROY BOTH TOWERS FIRST', '#ff4444'));

        // ── Spawn the Void Maw body ────────────────────────────
        const maw = this.add.circle(cx, cy, 48, 0x330066);
        maw.setStrokeStyle(5, 0x9900ff);
        maw.setDepth(4);
        this.physics.add.existing(maw, true); // static body — it doesn't move
        maw.isVoidMaw = true;
        maw.maxHp = 200;
        maw.hp = 200;
        maw._invincible = true; // starts invincible until towers die
        maw._towersAlive = 2;
        this._voidMaw = maw;

        // Inner void pupil
        const pupil = this.add.circle(cx, cy, 20, 0x000000);
        pupil.setStrokeStyle(3, 0xcc00ff);
        pupil.setDepth(5);
        maw._pupil = pupil;

        // Pulsing aura
        this.tweens.add({
            targets: maw, scaleX: 1.1, scaleY: 1.1,
            duration: 800, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
        });

        // Floating HP label
        const hpLabel = this.add.text(cx, cy - 66, `HP: ${maw.hp} | 🔒 TOWERS ALIVE: 2`,
            { fontFamily: 'VT323', fontSize: '18px', color: '#cc88ff', stroke: '#000', strokeThickness: 3 });
        hpLabel.setOrigin(0.5).setDepth(10);
        maw._hpLabel = hpLabel;

        // ── Spawn 2 guardian towers at opposite corners ────────
        const towerPositions = [
            { x: 120, y: 120 },
            { x: width - 120, y: height - 120 }
        ];
        this._voidMawTowers = [];

        towerPositions.forEach((pos, idx) => {
            const tower = this.add.rectangle(pos.x, pos.y, 36, 36, 0x6600aa);
            tower.setStrokeStyle(3, 0xcc00ff);
            tower.setDepth(3);
            this.physics.add.existing(tower, true);
            this.enemies.add(tower);
            tower.hp = 45;
            tower.maxHp = 45;
            tower._isVoidTower = true;
            tower._towerIdx = idx;
            tower._origColor = 0x6600aa;

            // Tower HP label
            const tLabel = this.add.text(pos.x, pos.y - 28, `TOWER ${idx + 1}: ${tower.hp}`,
                { fontFamily: 'VT323', fontSize: '15px', color: '#cc88ff', stroke: '#000', strokeThickness: 3 });
            tLabel.setOrigin(0.5).setDepth(10);
            tower._hpLabel = tLabel;

            // Tower glow pulse
            this.tweens.add({
                targets: tower, scaleX: 1.12, scaleY: 1.12,
                duration: 600 + idx * 200, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
            });

            // Tower fires aimed 3-shot bursts at the player every 2s
            const towerTimer = this.time.addEvent({
                delay: 1800 + idx * 400,
                loop: true,
                callback: () => {
                    if (!tower || !tower.active || !this._voidMawWaveActive) return;
                    this._voidTowerFireBurst(tower);
                }
            });
            tower._atkTimer = towerTimer;

            this._voidMawTowers.push(tower);
        });

        // ── Suction + Spit attack loop ─────────────────────────
        // Every 6s the Maw sucks the player in for 2.5s then spits them away
        this._voidMawAttackTimer = this.time.addEvent({
            delay: 6000,
            loop: true,
            callback: () => {
                if (!maw || !maw.active || !this._voidMawWaveActive) return;
                this._voidMawSuckAndSpit(maw);
            }
        });

        // ── Overlap: player touching maw body deals damage ────
        this.physics.add.overlap(this.player, maw, () => {
            if (!maw || !maw.active || !this._voidMawWaveActive) return;
            if (!this._voidMawContactCooldown) {
                this._voidMawContactCooldown = true;
                this.takeDamage(1);
                this.time.delayedCall(1000, () => { this._voidMawContactCooldown = false; });
            }
        });
    }

    _voidTowerFireBurst(tower) {
        // Fire 3 spread shots aimed at the player
        const baseAngle = Phaser.Math.Angle.Between(tower.x, tower.y, this.player.x, this.player.y);
        const offsets = [-0.25, 0, 0.25];
        offsets.forEach(off => {
            const ang = baseAngle + off;
            const proj = this.add.circle(tower.x, tower.y, 6, 0xcc00ff);
            proj.setDepth(4);
            this.physics.add.existing(proj);
            proj.body.setVelocity(Math.cos(ang) * 240, Math.sin(ang) * 240);
            proj.body.setAllowGravity(false);
            // Use bossProjectiles group for overlap with player
            this.bossProjectiles.add(proj);
            // Auto-destroy after 3s
            this.time.delayedCall(3000, () => { if (proj && proj.active) proj.destroy(); });
        });
    }

    _voidMawSuckAndSpit(maw) {
        if (!this.player || !this._voidMawWaveActive) return;

        const SUCK_DURATION = 2500;
        const SUCK_FORCE = 380;

        // Visual warning: maw eye flashes
        if (maw._pupil) {
            this.tweens.add({
                targets: maw._pupil, scaleX: 2.5, scaleY: 2.5, alpha: 0.4,
                duration: 300, yoyo: true, repeat: 3
            });
        }
        this._showWaveAlert('☠ VOID PULL!', '#cc00ff');

        // Suction phase: pull player toward maw each tick
        this._voidSucking = true;
        const suckTicker = this.time.addEvent({
            delay: 50,
            loop: true,
            callback: () => {
                if (!this._voidSucking || !this.player || !maw.active) return;
                const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, maw.x, maw.y);
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, maw.x, maw.y);
                // Pull harder when farther away
                const pullStrength = Math.min(SUCK_FORCE, SUCK_FORCE * (dist / 120));
                this.player.x += Math.cos(angle) * pullStrength * 0.05;
                this.player.y += Math.sin(angle) * pullStrength * 0.05;
                if (this.player.body) {
                    try { this.player.body.reset(this.player.x, this.player.y); } catch(e) {}
                }
            }
        });

        // After suck duration, spit the player to a random edge
        this.time.delayedCall(SUCK_DURATION, () => {
            this._voidSucking = false;
            suckTicker.remove(false);
            if (!this.player || !this._voidMawWaveActive) return;

            this._showWaveAlert('💥 VOID SPIT!', '#ff44ff');

            // Deal 1 damage on spit
            this.takeDamage(1);

            // Camera shake on spit
            this.cameras.main.shake(400, 0.022 * _shakeMultiplier);

            // Launch player toward a random edge of the arena
            const { width, height } = this.scale;
            const edge = Phaser.Math.Between(0, 3);
            let targetX, targetY;
            if      (edge === 0) { targetX = Phaser.Math.Between(60, width - 60); targetY = 60; }
            else if (edge === 1) { targetX = Phaser.Math.Between(60, width - 60); targetY = height - 60; }
            else if (edge === 2) { targetX = 60; targetY = Phaser.Math.Between(60, height - 60); }
            else                 { targetX = width - 60; targetY = Phaser.Math.Between(60, height - 60); }

            // Tween player across the arena
            this.tweens.add({
                targets: this.player,
                x: targetX, y: targetY,
                duration: 350, ease: 'Power3',
                onComplete: () => {
                    if (this.player && this.player.body) {
                        try { this.player.body.reset(this.player.x, this.player.y); } catch(e) {}
                    }
                }
            });
        });
    }

    // Called when a Void Tower is killed — unlocks Maw if both are gone
    _onVoidTowerDeath(tower) {
        if (tower._hpLabel) { tower._hpLabel.destroy(); tower._hpLabel = null; }
        if (tower._atkTimer) { tower._atkTimer.remove(false); tower._atkTimer = null; }
        tower.destroy();

        const maw = this._voidMaw;
        if (!maw) return;
        maw._towersAlive = Math.max(0, (maw._towersAlive || 2) - 1);

        if (maw._towersAlive <= 0 && maw._invincible) {
            // Unlock the Maw
            maw._invincible = false;
            this._showWaveAlert('🔓 VOID MAW VULNERABLE!', '#00ff88');
            // Make the maw visually "open" — change colors
            maw.setFillStyle(0x660033);
            maw.setStrokeStyle(5, 0xff00aa);
            if (maw._pupil) maw._pupil.setFillStyle(0xff0066);
            if (maw._hpLabel) maw._hpLabel.setText(`HP: ${maw.hp}`);
            // Shake to signal the moment
            this.cameras.main.shake(500, 0.03 * _shakeMultiplier);
        } else if (maw._towersAlive > 0) {
            this._showWaveAlert(`🔒 ${maw._towersAlive} TOWER${maw._towersAlive > 1 ? 'S' : ''} REMAINING`, '#ffaa00');
            if (maw._hpLabel) maw._hpLabel.setText(`HP: ${maw.hp} | 🔒 TOWERS ALIVE: ${maw._towersAlive}`);
        }
    }

    // Damage the Void Maw — respects invincibility
    _damageVoidMaw(dmg) {
        const maw = this._voidMaw;
        if (!maw || !maw.active) return;
        if (maw._invincible) {
            // Show a "blocked" effect
            this._showWaveAlert('🛡 TOWERS PROTECT IT!', '#ff4444');
            return;
        }
        maw.hp -= dmg;
        if (maw._hpLabel) maw._hpLabel.setText(`HP: ${maw.hp}`);

        // Flash the maw
        maw.setFillStyle(0xffffff);
        this.time.delayedCall(120, () => { if (maw && maw.active) maw.setFillStyle(0x660033); });

        if (maw.hp <= 0) {
            this._voidMawDeath();
        }
    }

    _voidMawDeath() {
        const maw = this._voidMaw;
        if (!maw) return;

        // Stop suction
        this._voidSucking = false;
        if (this._voidMawAttackTimer) { this._voidMawAttackTimer.remove(false); this._voidMawAttackTimer = null; }

        // Death explosion
        const { width, height } = this.scale;
        const colors = [0x9900ff, 0xcc00ff, 0xff00cc, 0xffffff, 0x6600aa];
        for (let i = 0; i < 24; i++) {
            const ang = (Math.PI * 2 / 24) * i;
            const spark = this.add.circle(maw.x, maw.y, 8, colors[i % colors.length]);
            spark.setDepth(8);
            this.tweens.add({
                targets: spark,
                x: maw.x + Math.cos(ang) * 120, y: maw.y + Math.sin(ang) * 120,
                alpha: 0, scaleX: 0.2, scaleY: 0.2,
                duration: 800, ease: 'Power2',
                onComplete: () => spark.destroy()
            });
        }
        this.cameras.main.shake(600, 0.04 * _shakeMultiplier);

        // Flash screen purple
        const flash = this.add.rectangle(width / 2, height / 2, width, height, 0x9900ff, 0);
        flash.setDepth(20);
        this.tweens.add({ targets: flash, alpha: 0.6, duration: 100, yoyo: true, repeat: 4, onComplete: () => flash.destroy() });

        const banner = this.add.text(width / 2, height / 2 - 60, '💀 VOID MAW SLAIN! 💀', {
            fontFamily: 'VT323', fontSize: '48px', color: '#ff88ff',
            stroke: '#000', strokeThickness: 5
        });
        banner.setOrigin(0.5).setDepth(25);
        this.tweens.add({ targets: banner, alpha: 0, y: banner.y - 60, duration: 350, delay: 1600, onComplete: () => banner.destroy() });

        if (maw._hpLabel) { maw._hpLabel.destroy(); maw._hpLabel = null; }
        if (maw._pupil) { maw._pupil.destroy(); maw._pupil = null; }
        maw.destroy();
        this._voidMaw = null;

        this._voidMawWaveActive = false;
        this.time.delayedCall(1800, () => { this.advanceWave(); });
    }

    _showWaveAlert(msg, color) {
        const col = color || '#ffcc00';
        const { width, height } = this.scale;
        const txt = this.add.text(width / 2, height / 2 - 90, msg,
            { fontFamily: 'VT323', fontSize: '30px', color: col,
              stroke: '#000000', strokeThickness: 4 });
        txt.setOrigin(0.5).setDepth(20);
        txt.setAlpha(0);
        this.tweens.add({
            targets: txt, alpha: 1, y: txt.y - 16, duration: 280, ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(2000, () => {
                    this.tweens.add({ targets: txt, alpha: 0, duration: 380, onComplete: () => txt.destroy() });
                });
            }
        });
    }

    pickupRelic(relicSprite) {
        const relic = relicSprite.relicData;

        // Immediately destroy so overlap doesn't re-fire
        relicSprite.destroy();

        if (this.player.noRelicPickup) {
            this._showWaveAlert('Weapon merge blocks relic pickups.', '#ff9999');
            return;
        }

        // Hard cap: once the player holds the current relic capacity, extras are ignored
        if (this.player.relics.length >= this.relicCap) return;

        // Buffer relic — never interrupt combat. It will be offered as a
        // pick-one-of-N draft card on the grace screen after the wave ends.
        if (!this._pendingRelics) this._pendingRelics = [];

        // Deduplicate: don't queue the same relic instance twice
        const alreadyQueued = this._pendingRelics.some(r => r === relic);
        if (alreadyQueued) return;

        this._pendingRelics.push(relic);

        // Play pickup sound
        try { if (this.sound) this.sound.play('relicPickup', { volume:0.4}); } catch (e) {}

        // Unobtrusive wave alert — never pauses or locks the scene
        try { this._showWaveAlert(`+ ${relic.icon || '?'} ${relic.name}`, '#00ff99'); } catch (e) {}
    }

    // Reset enemies and player after picking an upgrade so they can react easier
    resetAfterUpgrade() {
        // Clear existing enemies
        try { this.enemies.clear(true, true); } catch (e) { /* ignore if not present */ }
        try { if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true); } catch (e) {}

        // Clean up Void Maw if active
        try {
            if (this._voidMaw) { if (this._voidMaw._hpLabel) this._voidMaw._hpLabel.destroy(); if (this._voidMaw._pupil) this._voidMaw._pupil.destroy(); this._voidMaw.destroy(); this._voidMaw = null; }
            if (this._voidMawTowers) { this._voidMawTowers.forEach(t => { if (t && t.active) { if (t._hpLabel) t._hpLabel.destroy(); if (t._atkTimer) t._atkTimer.remove(false); t.destroy(); } }); this._voidMawTowers = null; }
            if (this._voidMawAttackTimer) { this._voidMawAttackTimer.remove(false); this._voidMawAttackTimer = null; }
            this._voidSucking = false;
            this._voidMawWaveActive = false;
        } catch(e) {}

        // Reposition player to center
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        this.player.x = cx;
        this.player.y = cy;
        if (this.player.body && this.player.body.reset) {
            try { this.player.body.reset(cx, cy); } catch (e) { /* ignore */ }
        }

        // Give brief invulnerability so player can react
        this.player.invulnerable = true;
        this.time.delayedCall(2000, () => { this.player.invulnerable = false; });

        // Temporarily slow enemies so they are easier to react to
        this.enemySpeedModifier = 0.65;
        this.time.delayedCall(4000, () => { this.enemySpeedModifier = 1; });

        // WAVE 10 / WAVE 25: Splitter Boss Wave — lots of splitters + one slightly-fast brute commander
        if (this._pendingSplitterBossWave) {
            this._pendingSplitterBossWave = false;
            this._splitterBossWaveActive = true;
            this._splitterBossKillTarget = 0; // counted when brute dies
            this._showWaveAlert('⚠ SPLITTER HORDE INCOMING', '#ffcc00');

            // Spawn configurable splitter count (default 5-6, wave 25 uses 7)
            const configCount = this.currentWave.splitterBossCount;
            const splitterCount = configCount != null ? configCount : Phaser.Math.Between(5, 6);
            for (let i = 0; i < splitterCount; i++) {
                this.time.delayedCall(400 + i * 600, () => {
                    const s = this.spawnSplitterEnemy();
                    s._splitterBossWaveEnemy = true;
                });
            }

            // Spawn the brute commander after a short delay — slightly faster than normal
            this.time.delayedCall(2200, () => {
                const brute = this.spawnBruteEnemy();
                brute._isBossWaveBrute = true;
                // Speed boost: significantly faster than its normal value
                if (brute.body) {
                    brute._bruteSpeedBoost = 1.8;
                }
                // Make it visually distinct — red-orange tint
                brute.setFillStyle(0xff4400);
                brute.setStrokeStyle(4, 0xffcc00);
                brute._origColor = 0xff4400;
                // Update label text
                if (brute._hpLabel) brute._hpLabel.setStyle({ color: '#ffcc00' });
                this._showWaveAlert('☠ COMMANDER APPROACHES', '#ff4444');
            });

            // Wire advance: wave ends when the brute dies
            // (handled in the existing enemy kill code — we just count the kill)
        }

        // WAVE 35: Void Maw Wave — giant suction beast + 2 guardian towers
        if (this._pendingVoidMawWave) {
            this._pendingVoidMawWave = false;
            this._voidMawWaveActive = true;
            this._spawnVoidMaw();
        }

        // Splitter squad: 2-3 spawn at wave edges, each fires 2 slow projectiles
        if (this._pendingSplitterSpawn) {
            this._pendingSplitterSpawn = false;
            const count = Phaser.Math.Between(2, 3);
            for (let i = 0; i < count; i++) {
                this.time.delayedCall(600 + i * 500, () => {
                    this.spawnSplitterEnemy();
                });
            }
            this._showWaveAlert('⚠ SPLITTERS INCOMING', '#ffcc00');
        }

        // Cryo Burst wave seed
        if (this._pendingCryoBurstWave) {
            this._pendingCryoBurstWave = false;
            const cryoCount = Phaser.Math.Between(3, 4);
            for (let i = 0; i < cryoCount; i++) {
                this.time.delayedCall(800 + i * 450, () => {
                    this.spawnCryoBurstEnemy();
                });
            }
            this._showWaveAlert('❄ CRYO SHARDS DETECTED', '#88eeff');
        }

        // Brute squad: 1-2 per wave after wave 10 — slow juggernauts, 2-heart contact
        if (this._pendingBruteSpawn) {
            this._pendingBruteSpawn = false;
            const bruteCount = this.waveIndex >= 18 ? 2 : 1;
            for (let i = 0; i < bruteCount; i++) {
                this.time.delayedCall(1000 + i * 1200, () => {
                    this.spawnBruteEnemy();
                });
            }
            this._showWaveAlert('☠ BRUTE INCOMING', '#ff4444');
        }
    }

    updateRelicsDisplay() {
        const relicsContainer = document.getElementById('relics-container');
        if (relicsContainer) relicsContainer.innerHTML = '';

        // Count badge: normal + fused + secret relics
        const total = this.player.relics.length + this.player.fusedRelics.length + (this.player.secretRelics ? this.player.secretRelics.length : 0);
        const countEl = document.getElementById('relic-count');
        if (countEl) countEl.innerText = total;

        // Update secret relic HUD button visibility
        updateSecretRelicHUD();
    }

    // ── Secret Relic Activation ────────────────────────────────
    activateSecretRelic() {
        const sr = this.player.secretRelics && this.player.secretRelics.find(r => r.id === 'cold_burns' && r.charges > 0);
        if (!sr) return;

        sr.charges--;
        this._oneShotWavesLeft = 5;
        updateSecretRelicHUD();

        // Play freeze sound
        try { this.sound.play('freeze', { volume: _sfxVolume }); } catch(e) {}

        // Full-screen rainbow flash
        this._doRainbowFlash();

        // Notification banner
        this._showSecretActivationBanner();
    }

    _doRainbowFlash() {
        const { width, height } = this.scale;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0);
        overlay.setDepth(20);

        // Cycle through hues with tweens
        const colors = [0xff0000, 0xff7700, 0xffff00, 0x00ff00, 0x0099ff, 0x9900ff, 0xff00ff, 0xffffff];
        let step = 0;
        const flash = () => {
            if (!overlay.active) return;
            overlay.setFillStyle(colors[step % colors.length], 0.35);
            step++;
            if (step < 14) {
                this.time.delayedCall(80, flash);
            } else {
                this.tweens.add({ targets: overlay, alpha: 0, duration: 300, onComplete: () => overlay.destroy() });
            }
        };
        flash();

        // Also freeze every current enemy instantly as bonus flair
        this.enemies.getChildren().forEach(enemy => {
            if (enemy && enemy.active) {
                enemy.setFillStyle(0x88eeff);
                enemy._frozen = true;
                enemy._frozenUntil = Date.now() + 800;
                this.time.delayedCall(800, () => {
                    if (enemy && enemy.active) { enemy._frozen = false; }
                });
            }
        });
    }

    _showSecretActivationBanner() {
        const { width, height } = this.scale;
        const txt = this.add.text(width / 2, height / 2 - 60,
            "❄️🔥 IT'S SO COLD IT BURNS! 🔥❄️\n5 WAVES OF ONE-SHOT POWER!",
            {
                fontFamily: 'VT323',
                fontSize: '38px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
                align: 'center',
                shadow: { offsetX: 0, offsetY: 0, color: '#00ffff', blur: 18, fill: true }
            }
        );
        txt.setOrigin(0.5);
        txt.setDepth(25);
        txt.setAlpha(0);

        this.tweens.add({
            targets: txt, alpha: 1, y: height / 2 - 80,
            duration: 300, ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(2000, () => {
                    this.tweens.add({ targets: txt, alpha: 0, duration: 400, onComplete: () => txt.destroy() });
                });
            }
        });
    }

    _showOneShotExpiredNotice(msg) {
        const { width, height } = this.scale;
        const txt = this.add.text(width / 2, height / 2 - 40,
            msg || '❄️ ONE-SHOT POWER EXPIRED',
            { fontFamily: 'VT323', fontSize: '28px', color: '#aaddff', align: 'center',
              stroke: '#000', strokeThickness: 3 }
        );
        txt.setOrigin(0.5);
        txt.setDepth(25);
        this.tweens.add({
            targets: txt, alpha: 0, y: txt.y - 30,
            duration: 1500, delay: 1000,
            onComplete: () => txt.destroy()
        });
    }

    /**
     * Burns an enemy with damage-over-time from the Voltfire Matrix fused relic.
     * Each stack adds an independent burn application.
     * @param {object} enemy – Phaser circle game object
     */

    applyCryoToEnemy(enemy) {
        if (!enemy || !enemy.active || enemy._frozen) return;

        const stacks = this.player.cryoStacks || 1;
        const freezeDuration = stacks * 1000; // 1s per stack, up to 3s

        enemy._frozen = true;
        // Timestamp-based thaw — survives scene pause (delayedCall does not)
        enemy._frozenUntil = Date.now() + freezeDuration;

        // Visual: turn enemy icy blue and stop movement
        if (enemy.setFillStyle) enemy.setFillStyle(0x88eeff);
        if (enemy.body) enemy.body.setVelocity(0);

        // Ice particle burst
        for (let i = 0; i < 5; i++) {
            const ang = (Math.PI * 2 / 5) * i;
            const ix = enemy.x + Math.cos(ang) * 12;
            const iy = enemy.y + Math.sin(ang) * 12;
            const shard = this.add.circle(ix, iy, 3, 0xaaeeff, 1);
            shard.setDepth(6);
            this.tweens.add({
                targets: shard, alpha: 0, scaleX: 0.2, scaleY: 0.2,
                x: ix + Math.cos(ang) * 10, y: iy + Math.sin(ang) * 10,
                duration: 400, ease: 'Power2',
                onComplete: () => shard.destroy()
            });
        }
        // Thaw is handled by the update() loop via _frozenUntil timestamp
    }

    applyDotToEnemy(enemy) {
        if (!enemy || !enemy.active) return;

        // Count Voltfire Matrix stacks: 1 = burn 20% of enemy max HP, 2 = 40%
        const voltfireStacks = this.player.fusedRelics.filter(r => r.id === 'voltfire_matrix').length;
        if (voltfireStacks === 0) return;

        // Don't stack a second burn on an already-burning enemy
        if (this._dotEnemies.has(enemy)) return;

        const TICKS = 3;
        const TICK_INTERVAL = 800; // ~2.4s total burn
        const burnPct = voltfireStacks >= 2 ? 0.40 : 0.20;

        const enemyMaxHp = enemy.maxHp || enemy.hp || 1;
        const dmgPerTick = (enemyMaxHp * burnPct) / TICKS;

        // Sync dot HP tracker with current HP (slash may have already reduced it)
        if (enemy._dotHp === undefined) enemy._dotHp = enemy.hp;

        let ticksDone = 0;

        // Set initial burn colour: orange-red
        const origColor = enemy.fillColor;
        if (enemy.setFillStyle) enemy.setFillStyle(0xff2200);

        const dotTimer = this.time.addEvent({
            delay: TICK_INTERVAL,
            repeat: TICKS - 1,
            callback: () => {
                if (!enemy || !enemy.active) {
                    dotTimer.remove(false);
                    this._dotEnemies.delete(enemy);
                    return;
                }

                // Deal tick damage
                enemy._dotHp -= dmgPerTick;
                enemy.hp = enemy._dotHp;

                // Bright red flash on this tick, then settle back to orange-red burn colour
                if (enemy.setFillStyle) {
                    enemy.setFillStyle(0xff0000);
                    this.time.delayedCall(130, () => {
                        if (enemy && enemy.active && enemy.setFillStyle)
                            enemy.setFillStyle(0xff2200);
                    });
                }

                // Spark particle burst
                const spark = this.add.circle(enemy.x, enemy.y, 5, 0xff2200, 1);
                spark.setDepth(6);
                this.tweens.add({
                    targets: spark, alpha: 0, scaleX: 2.5, scaleY: 2.5,
                    y: enemy.y - 14, duration: 350, ease: 'Power2',
                    onComplete: () => spark.destroy()
                });

                // Rising damage number
                const numTxt = this.add.text(
                    enemy.x + Phaser.Math.Between(-6, 6), enemy.y - 10,
                    '-' + Math.ceil(dmgPerTick) + ' DOT',
                    { fontFamily: 'VT323', fontSize: '14px', color: '#ff4400' }
                );
                numTxt.setDepth(7);
                this.tweens.add({
                    targets: numTxt, alpha: 0, y: numTxt.y - 20, duration: 600,
                    onComplete: () => numTxt.destroy()
                });

                ticksDone++;

                if (enemy._dotHp <= 0) {
                    if (shouldDropRelic()) this.spawnRelic(enemy.x, enemy.y);
                    if (enemy._shotTimer) enemy._shotTimer.remove(false);
                    if (enemy._isSplitter) this._spawnSplitterFragments(enemy.x, enemy.y);
                    if (enemy._isBrute) {
                        if (enemy._slamTimer) enemy._slamTimer.remove(false);
                        if (enemy._hpLabel && enemy._hpLabel.active) enemy._hpLabel.destroy();
                        this._bruteDeathExplosion(enemy.x, enemy.y);
                    }
                    enemy.destroy();
                    score++;
                    this.waveKills++;
                    document.getElementById('killCount').innerText = score;
                    if (this._splitterBossWaveActive) {
                        const remaining = this.enemies.getChildren().filter(e => e && e.active).length;
                        document.getElementById('waveProgress').innerText = `${remaining} ENEMIES LEFT`;
                        if (remaining === 0) { this._splitterBossWaveActive = false; if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true); this.advanceWave(); }
                    } else {
                        document.getElementById('waveProgress').innerText = this.waveKills + ' / ' + this.currentWave.targetKills;
                        if (this.waveKills >= this.currentWave.targetKills) this.advanceWave();
                    }
                    dotTimer.remove(false);
                    this._dotEnemies.delete(enemy);
                } else if (ticksDone >= TICKS) {
                    // Burn expired -- restore original colour
                    if (enemy.active && enemy.setFillStyle) enemy.setFillStyle(origColor);
                    this._dotEnemies.delete(enemy);
                }
            }
        });

        this._dotEnemies.set(enemy, dotTimer);
    }
    damageBoss(amount) {
        if (!this.bossActive || !this.boss) return;

        this.boss.hp -= amount;
        this.updateBossHealthUI();

        if (this.boss.hp <= 0) {
            this.boss.destroy();
            this.boss = null;

            // Stop main boss attack timer
            if (this.bossAttackTimer) {
                this.bossAttackTimer.remove(false);
                this.bossAttackTimer = null;
            }

            // Check if we're already in phase 2 (minibosses alive)
            if (this._bossPhase2Active) {
                this._bossPhase2Count = (this._bossPhase2Count || 0) + 1;
                if (this._bossPhase2Count >= 4) {
                    // All 4 minibosses dead — victory
                    this._endBossPhase2();
                    this.showVictory();
                }
                return;
            }

            // ── PHASE 2: Main boss just died — spawn 4 frenzied minibosses ──
            this._triggerBossPhase2();
        }
    }

    _triggerBossPhase2() {
        this._bossPhase2Active = true;
        this._bossPhase2Count = 0;
        this._phase2Bosses = [];

        // Clear stray projectiles
        this.bossProjectiles.clear(true, true);
        if (this.bossWarningBar) { this.bossWarningBar.destroy(); this.bossWarningBar = null; }

        // Flash screen red to signal the split
        const { width, height } = this.scale;
        const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xff0000, 0);
        flash.setDepth(20);
        this.tweens.add({
            targets: flash, alpha: 0.5, duration: 120, yoyo: true, repeat: 3,
            onComplete: () => flash.destroy()
        });

        // Banner text
        const banner = this.add.text(width / 2, height / 2 - 60,
            '💀 IT SPLITS! 💀', {
                fontFamily: 'VT323', fontSize: '52px', color: '#ff4444',
                stroke: '#000', strokeThickness: 5,
                shadow: { blur: 20, color: '#ff0000', fill: true }
            });
        banner.setOrigin(0.5);
        banner.setDepth(25);
        this.tweens.add({
            targets: banner, alpha: 0, y: banner.y - 50,
            duration: 300, delay: 1400, onComplete: () => banner.destroy()
        });

        // Spawn positions: corners of arena
        const margin = 80;
        const spawnPoints = [
            { x: margin,         y: margin },
            { x: width - margin, y: margin },
            { x: margin,         y: height - margin },
            { x: width - margin, y: height - margin }
        ];

        const miniBossMaxHp = Math.ceil((this.currentWave.bossMaxHp || 70) * 0.25);

        spawnPoints.forEach((pt, i) => {
            this.time.delayedCall(i * 180, () => {
                const mb = this._spawnMiniBoss(pt.x, pt.y, miniBossMaxHp);
                this._phase2Bosses.push(mb);
            });
        });

        // Update boss health bar to show combined miniboss pool
        this._phase2TotalHp = miniBossMaxHp * 4;
        this._phase2HpRemaining = this._phase2TotalHp;
    }

    _spawnMiniBoss(x, y, maxHp) {
        // Unique pulsing color per mini-boss: red, orange, magenta, yellow
        const colors = [0xff2222, 0xff8800, 0xff00ff, 0xffcc00];
        const idx = this._phase2Bosses ? this._phase2Bosses.length : 0;
        const col = colors[idx % colors.length];

        const mb = this.add.circle(x, y, 18, col);
        mb.setStrokeStyle(3, 0xffffff);
        mb.setDepth(3);
        this.physics.add.existing(mb);
        mb.body.setImmovable(false);
        mb.body.setAllowGravity(false);
        mb.body.setCollideWorldBounds(true);
        mb.body.bounce.set(0.4);
        mb.maxHp = maxHp;
        mb.hp = maxHp;
        mb.isMiniBoss = true;
        mb._origColor = col;

        // Register in the boss group so slashes can hit it
        this._registerMiniBossOverlap(mb);

        // Spawn-in scale pop
        mb.setScale(0.1);
        this.tweens.add({ targets: mb, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.easeOut' });

        // ── Attack pattern: SPIRAL BURST ─────────────────────────
        // Every 1.8s fires a ring of 8 projectiles outward
        const spiralTimer = this.time.addEvent({
            delay: 1800 + Phaser.Math.Between(0, 600),
            loop: true,
            callback: () => {
                if (!mb || !mb.active || !this._bossPhase2Active) return;
                this._spawnSpiralBurst(mb);
            }
        });
        mb._atkTimer1 = spiralTimer;

        // ── Attack pattern: AIMED TRIPLE SHOT ────────────────────
        // Every 2.5s fires 3 bullets aimed at player spread slightly
        const tripleTimer = this.time.addEvent({
            delay: 2500 + Phaser.Math.Between(0, 800),
            loop: true,
            callback: () => {
                if (!mb || !mb.active || !this._bossPhase2Active) return;
                this._spawnTripleShot(mb);
            }
        });
        mb._atkTimer2 = tripleTimer;

        // ── Movement: erratic dashing ─────────────────────────────
        const dashTimer = this.time.addEvent({
            delay: 1200 + Phaser.Math.Between(0, 500),
            loop: true,
            callback: () => {
                if (!mb || !mb.active) return;
                // 60% chance: dash toward player; 40%: dash random
                if (Math.random() < 0.6) {
                    const angle = Phaser.Math.Angle.Between(mb.x, mb.y, this.player.x, this.player.y);
                    const speed = 320 + Phaser.Math.Between(0, 100);
                    mb.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                    this.time.delayedCall(250, () => {
                        if (mb && mb.active) mb.body.setVelocity(0, 0);
                    });
                } else {
                    const randAngle = Math.random() * Math.PI * 2;
                    const speed = 260;
                    mb.body.setVelocity(Math.cos(randAngle) * speed, Math.sin(randAngle) * speed);
                    this.time.delayedCall(300, () => {
                        if (mb && mb.active) mb.body.setVelocity(0, 0);
                    });
                }
            }
        });
        mb._dashTimer = dashTimer;

        // Pulse glow animation
        this.tweens.add({
            targets: mb, scaleX: 1.15, scaleY: 1.15,
            duration: 400, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
        });

        return mb;
    }

    _registerMiniBossOverlap(mb) {
        // Player contact damages player
        this.physics.add.overlap(this.player, mb, () => {
            this.takeDamage();
        });
    }

    _spawnSpiralBurst(mb) {
        const count = 8;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const proj = this.add.circle(mb.x, mb.y, 6, mb._origColor || 0xff4400);
            this.bossProjectiles.add(proj);
            this.physics.add.existing(proj);
            proj.body.setAllowGravity(false);
            proj.body.setCollideWorldBounds(true);
            proj.body.onWorldBounds = true;
            const spd = 300 + Phaser.Math.Between(0, 60);
            proj.body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
            this.time.delayedCall(4000, () => { if (proj && proj.active) proj.destroy(); });
        }
    }

    _spawnTripleShot(mb) {
        const baseAngle = Phaser.Math.Angle.Between(mb.x, mb.y, this.player.x, this.player.y);
        const offsets = [-0.25, 0, 0.25]; // slight spread
        offsets.forEach((off, i) => {
            this.time.delayedCall(i * 80, () => {
                if (!mb || !mb.active) return;
                const a = baseAngle + off;
                const proj = this.add.circle(mb.x, mb.y, 7, 0xffffff);
                proj.setStrokeStyle(2, mb._origColor || 0xff4400);
                this.bossProjectiles.add(proj);
                this.physics.add.existing(proj);
                proj.body.setAllowGravity(false);
                proj.body.setCollideWorldBounds(true);
                proj.body.onWorldBounds = true;
                const spd = 440 + Phaser.Math.Between(0, 80);
                proj.body.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
                this.time.delayedCall(4500, () => { if (proj && proj.active) proj.destroy(); });
            });
        });
    }

    _damageMiniBoss(mb, amount) {
        if (!mb || !mb.active) return;
        mb.hp -= amount;

        // Apply DoT on slash if Voltfire equipped
        if (this.player.hasDot && !this._dotEnemies.has(mb)) {
            // Reuse applyDotToEnemy — miniboss has hp/maxHp just like regular enemies
            this.applyDotToEnemy(mb);
        }

        // Flash white
        if (mb.hp > 0) {
            const prev = mb._origColor;
            mb.setFillStyle(0xffffff);
            this.time.delayedCall(80, () => { if (mb.active) mb.setFillStyle(prev); });
            return;
        }

        // Miniboss dies
        mb.setActive(false).setVisible(false);
        if (mb.body) mb.body.setEnable(false);
        if (mb._atkTimer1) mb._atkTimer1.remove(false);
        if (mb._atkTimer2) mb._atkTimer2.remove(false);
        if (mb._dashTimer) mb._dashTimer.remove(false);

        // Death explosion
        const colors = [mb._origColor, 0xffffff, 0xff0000];
        for (let i = 0; i < 12; i++) {
            const ang = (Math.PI * 2 / 12) * i;
            const spark = this.add.circle(mb.x, mb.y, 4, colors[i % colors.length]);
            spark.setDepth(6);
            this.tweens.add({
                targets: spark, x: mb.x + Math.cos(ang) * 40, y: mb.y + Math.sin(ang) * 40,
                alpha: 0, duration: 500, ease: 'Power2', onComplete: () => spark.destroy()
            });
        }
        mb.destroy();

        this._bossPhase2Count = (this._bossPhase2Count || 0) + 1;

        if (this._bossPhase2Count >= 4) {
            this._endBossPhase2();
            this.showVictory();
        } else {
            // Update health bar to show remaining mini-bosses
            const remaining = 4 - this._bossPhase2Count;
            const healthFill = document.getElementById('boss-health-fill');
            if (healthFill) healthFill.style.width = ((remaining / 4) * 100) + '%';

            // Banner: how many left
            const { width, height } = this.scale;
            const txt = this.add.text(width / 2, height / 3,
                `${remaining} FRAGMENT${remaining !== 1 ? 'S' : ''} REMAIN`,
                { fontFamily: 'VT323', fontSize: '36px', color: '#ff8888', stroke: '#000', strokeThickness: 4 });
            txt.setOrigin(0.5).setDepth(25);
            this.tweens.add({
                targets: txt, alpha: 0, y: txt.y - 40, duration: 300, delay: 1200,
                onComplete: () => txt.destroy()
            });
        }
    }

    _endBossPhase2() {
        this._bossPhase2Active = false;
        this.bossActive = false;
        this.bossProjectiles.clear(true, true);
        if (this.bossWarningBar) { this.bossWarningBar.destroy(); this.bossWarningBar = null; }

        // Hide boss health bar
        document.getElementById('boss-health-container').classList.add('hidden');
        document.getElementById('bossHealthLabel').classList.add('hidden');
    }

    startBossWave() {
        if (!this.currentWave.bossWave || this.bossActive) return;

        this.bossActive = true;
        this.enemies.clear(true, true);
        this.relics.clear(true, true);
        if (this.splitterProjectiles) this.splitterProjectiles.clear(true, true);

        if (this.bossWarningBar) {
            this.bossWarningBar.destroy();
            this.bossWarningBar = null;
        }

        const x = this.scale.width / 2;
        const y = 120;
        this.boss = this.add.circle(x, y, 28, this.currentWave.bossColor || 0xff0000);
        this.boss.setStrokeStyle(4, 0xffffff);
        this.physics.add.existing(this.boss);
        this.boss.body.setImmovable(true);
        this.boss.body.setAllowGravity(false);
        this.boss.maxHp = this.currentWave.bossMaxHp || 70;
        this.boss.hp = this.boss.maxHp;

        this.updateBossHealthUI();

        if (this.bossAttackTimer) {
            this.bossAttackTimer.remove(false);
        }

        this.bossAttackTimer = this.time.addEvent({
            delay: 3000,
            loop: true,
            callback: () => {
                if (this.player.hp > 0 && this.bossActive) {
                    this.showBossWarning();
                }
            }
        });

        this.showBossWarning();
    }

    showBossWarning() {
        if (!this.bossActive) return;
        this.spawnBossProjectile();
    }

    spawnBossProjectile() {
        if (!this.bossActive || !this.boss) return;

        const projectile = this.add.circle(this.boss.x, this.boss.y, 8, 0xff9900);
        this.bossProjectiles.add(projectile);
        this.physics.add.existing(projectile);
        projectile.body.setAllowGravity(false);
        projectile.body.setCollideWorldBounds(true);
        projectile.body.onWorldBounds = true;

        const targetX = this.player.x;
        const targetY = this.player.y;
        this.physics.moveTo(projectile, targetX, targetY, 420);

        this.time.delayedCall(5000, () => {
            if (projectile && projectile.active) {
                projectile.destroy();
            }
        });
    }

    updateBossHealthUI() {
        const healthFill = document.getElementById('boss-health-fill');
        if (!healthFill) return;

        const percent = this.boss && this.boss.maxHp ? Math.max(0, Math.min(100, (this.boss.hp / this.boss.maxHp) * 100)) : 100;
        healthFill.style.width = percent + '%';
    }

    showRelicModal(relic) {
        const modal = document.getElementById('relic-modal');
        // If a queue is attached to the modal, use the queued index as current
        if (modal._queue && typeof modal._queueIndex === 'number') {
            const idx = modal._queueIndex;
            const current = modal._queue[idx];
            if (!current) return;
            modal._pendingRelic = current;
            document.getElementById('modal-icon').innerText = current.icon;
            document.getElementById('modal-title').innerText = current.name || 'RELIC FOUND';
            document.getElementById('modal-description').innerText = current.description;
            const countEl = document.getElementById('modal-index');
            if (countEl) countEl.innerText = `${idx + 1} / ${modal._queue.length}`;
            // enable/disable prev/next
            const prevBtn = document.getElementById('modal-prev-btn');
            const nextBtn = document.getElementById('modal-next-btn');
            if (prevBtn) prevBtn.disabled = (idx <= 0);
            if (nextBtn) nextBtn.disabled = (idx >= modal._queue.length - 1);
            modal.classList.remove('hidden');
            return;
        }

        // Fallback: single relic modal
        document.getElementById('modal-icon').innerText = relic.icon;
        document.getElementById('modal-title').innerText = 'RELIC FOUND';
        document.getElementById('modal-description').innerText = relic.description;
        // Store pending relic for accept/decline
        modal._pendingRelic = relic;
        modal._queue = null;
        modal._queueIndex = null;
        const countEl = document.getElementById('modal-index');
        if (countEl) countEl.innerText = '1 / 1';
        const prevBtn = document.getElementById('modal-prev-btn');
        const nextBtn = document.getElementById('modal-next-btn');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        modal.classList.remove('hidden');
    }

    takeDamage(amount) {
        if (this.player.invulnerable) return;
        const dmg = amount || 1;

        if (this.player.shieldCharges > 0) {
            // Shield absorbs one "hit" regardless of damage amount
            this.player.shieldCharges--;
            this.updateAegisVisual();

            // Brief iframes after each shield hit — same enemy can't drain multiple
            // charges in the same physics frame or burst of frames
            this.player.invulnerable = true;
            // Flash the ring white to signal absorption
            if (this._aegisRing && this._aegisRing.active) {
                const prevStroke = this._aegisRing.strokeColor;
                this._aegisRing.setStrokeStyle(6, 0xffffff);
                this.time.delayedCall(120, () => {
                    if (this._aegisRing && this._aegisRing.active) {
                        this.updateAegisVisual(); // restore correct color
                    }
                });
            }
            this.time.delayedCall(500, () => { this.player.invulnerable = false; });
            return;
        }
        
        this.player.hp -= dmg;
        this.player.invulnerable = true;
        
        // Update heart display
        updateHeartsDisplay(this.player.hp, this.player.maxHp);

        // Red Flash + Hurt animation
        const hurtAnim = `sw_hurt_${this._facing || 'down'}`;
        this.player._playingHurt = true;
        this.player.play(hurtAnim, true);
        this.player.once('animationcomplete', () => {
            this.player._playingHurt = false;
        });
        this.tweens.add({
            targets: this.player, alpha: 0.3, duration: 80, yoyo: true, repeat: 2,
            onComplete: () => { this.player.invulnerable = false; this.player.alpha = 1; }
        });

        if (this.player.hp <= 0) {
            this.showDefeatScreen();
        }
    }

    // ── Aegis Core visual shield ring ────────────────────────
    updateAegisVisual() {
        // Only show ring if the Aegis Core fused relic is active
        const hasAegis = this.player.fusedRelics && this.player.fusedRelics.some(r => r.id === 'aegis_core');
        if (!hasAegis) {
            if (this._aegisRing) { this._aegisRing.destroy(); this._aegisRing = null; }
            return;
        }

        const charges = this.player.shieldCharges || 0;

        if (charges <= 0) {
            // Shield broken — destroy ring and start 30s recharge
            if (this._aegisRing) { this._aegisRing.destroy(); this._aegisRing = null; }
            this._startAegisRecharge();
            return;
        }

        // Create or update the ring
        if (!this._aegisRing || !this._aegisRing.active) {
            this._aegisRing = this.add.circle(this.player.x, this.player.y, 22, 0x00ccff, 0);
            this._aegisRing.setStrokeStyle(3, 0x00ccff);
            this._aegisRing.setDepth(4);
        }
        // Recolor based on remaining charges: 4=cyan, 3=blue, 2=yellow, 1=red
        const colors = [0xff3333, 0xffcc00, 0x4488ff, 0x00ccff];
        const col = colors[Math.min(charges - 1, 3)];
        this._aegisRing.setStrokeStyle(2 + charges, col);
        // Pulse tween
        if (!this._aegisTween || !this._aegisTween.isPlaying()) {
            this._aegisTween = this.tweens.add({
                targets: this._aegisRing,
                scaleX: 1.12, scaleY: 1.12,
                duration: 700, yoyo: true, loop: -1, ease: 'Sine.easeInOut'
            });
        }
    }

    _startAegisRecharge() {
        if (this._aegisRecharging) return;
        this._aegisRecharging = true;

        // Show a small recharge label above the player position via DOM
        const hudEl = document.getElementById('aegis-recharge-hud');
        if (hudEl) {
            hudEl.classList.remove('hidden');
            let t = 30;
            hudEl.innerText = `🛡 RECHARGING ${t}s`;
            const iv = setInterval(() => {
                t--;
                if (hudEl) hudEl.innerText = `🛡 RECHARGING ${t}s`;
                if (t <= 0) {
                    clearInterval(iv);
                    this._aegisRecharging = false;
                    if (hudEl) hudEl.classList.add('hidden');
                    // Restore 4 shield charges and re-draw ring
                    this.player.shieldCharges = 4;
                    this.updateAegisVisual();
                }
            }, 1000);
        } else {
            // Fallback: use Phaser timer if HUD element missing
            this.time.delayedCall(30000, () => {
                this._aegisRecharging = false;
                this.player.shieldCharges = 4;
                this.updateAegisVisual();
            });
        }
    }

    advanceWave() {
        // Tick down the one-shot power counter when a wave ends
        if (this._oneShotWavesLeft > 0) {
            this._oneShotWavesLeft--;
            if (this._oneShotWavesLeft === 0) {
                this._showOneShotExpiredNotice('❄️ ONE-SHOT POWER EXPIRED');
            }
            updateSecretRelicHUD();
        }

        this.waveIndex++;
        if (this.waveIndex >= waveConfigs.length) {
            this.showVictory();
            return;
        }

        this.currentWave = waveConfigs[this.waveIndex];
        this.waveKills = 0;
        this.updateWaveUI();

        // Wave 10: Splitter Boss Wave — handled entirely in resetAfterUpgrade
        if (this.currentWave.splitterBossWave) {
            this._pendingSplitterBossWave = true;
        }

        // Wave 35: Void Maw wave — handled entirely in resetAfterUpgrade
        if (this.currentWave.voidMawWave) {
            this._pendingVoidMawWave = true;
        }

        // Every 6 waves: spawn a squad of 2-3 Splitter enemies at wave start
        if (this.waveIndex > 0 && this.waveIndex % 6 === 0 && !this.currentWave.bossWave && !this.currentWave.splitterBossWave && !this.currentWave.voidMawWave) {
            this._pendingSplitterSpawn = true; // spawned after grace ends in resetAfterUpgrade
        }

        // Every 3 waves (offset by 1): seed the wave with Cryo Burst enemies
        if (this.waveIndex > 1 && (this.waveIndex + 1) % 3 === 0 && !this.currentWave.bossWave && !this.currentWave.voidMawWave) {
            this._pendingCryoBurstWave = true;
        }

        // After wave 10: spawn 1-2 Brutes each wave
        if (this.waveIndex >= 10 && !this.currentWave.bossWave && !this.currentWave.voidMawWave) {
            this._pendingBruteSpawn = true;
        }

        // Stop ambience while the grace period screen is active
        try {
            if (this.music) { this.music.stop(); this.music.destroy(); this.music = null; }
        } catch(e) {}

        // Play downtime music during grace period
        try {
            if (this.downtimeMusic) { this.downtimeMusic.stop(); this.downtimeMusic.destroy(); }
            this.downtimeMusic = this.sound.add('downtime', { loop: true, volume: _graceMusicVolume });
            this.downtimeMusic.play();
        } catch(e) {}

        // Show grace period screen before evolve
        this.inputLocked = true;
        this.scene.pause();
        showGracePeriod(this);
    }

    stopDowntimeMusic() {
        try {
            if (this.downtimeMusic) {
                this.downtimeMusic.stop();
                this.downtimeMusic.destroy();
                this.downtimeMusic = null;
            }
        } catch(e) {}
    }

    startAmbienceMusic() {
        try {
            if (this.music) {
                this.music.stop();
                this.music.destroy();
                this.music = null;
            }
            this.music = this.sound.add('ambience', { loop: true, volume: _ambienceVolume });
            this.music.play();
        } catch(e) {}
    }

    stopAmbienceMusic() {
        try {
            if (this.music) {
                this.music.stop();
                this.music.destroy();
                this.music = null;
            }
        } catch(e) {}
    }

    resizeGame(width, height) {
        if (!width || !height) return;
        if (this.arenaBg) {
            this.arenaBg.setPosition(width / 2, height / 2);
            this.arenaBg.setDisplaySize(width, height);
        }
        if (this.arenaBg2) {
            this.arenaBg2.setPosition(width / 2, height / 2);
            this.arenaBg2.setDisplaySize(width, height);
        }
        if (this.arenaBg3) {
            this.arenaBg3.setPosition(width / 2, height / 2);
            this.arenaBg3.setDisplaySize(width, height);
        }
        if (this.cameras && this.cameras.main) {
            this.cameras.main.setViewport(0, 0, width, height);
        }
        if (this.physics && this.physics.world) {
            this.physics.world.setBounds(0, 0, width, height);
        }
        if (this.player) {
            const px = Phaser.Math.Clamp(this.player.x, 0, width);
            const py = Phaser.Math.Clamp(this.player.y, 0, height);
            this.player.setPosition(px, py);
            if (this.player.body && typeof this.player.body.reset === 'function') {
                this.player.body.reset(px, py);
            }
        }
    }

    updateWaveUI() {
        document.getElementById('killCount').innerText = score;
        document.getElementById('waveNumber').innerText = this.currentWave.title;
        document.getElementById('waveProgress').innerText = this.currentWave.bossWave ? 'BOSS FIGHT' : this.currentWave.splitterBossWave ? 'CLEAR ALL ENEMIES' : this.currentWave.voidMawWave ? 'DEFEAT THE VOID MAW' : `${this.waveKills} / ${this.currentWave.targetKills}`;
        document.getElementById('waveHint').innerText = this.currentWave.description;
        document.getElementById('bossHealthLabel').classList.toggle('hidden', !this.currentWave.bossWave);
        document.getElementById('boss-health-container').classList.toggle('hidden', !this.currentWave.bossWave);

        if (this.currentWave.bossWave && !this.boss) {
            document.getElementById('boss-health-fill').style.width = '100%';
        }

        // Update day/night cycle visuals
        this.updateDayCycle();
    }

    updateDayCycle() {
        // waveIndex 0-7:  full day (arena1 only)
        // waveIndex 8-15: golden hour fades in (arena2 alpha 0→1)
        // waveIndex 16-24: night fades in (arena3 alpha 0→1, arena2 stays at 1)
        const w = this.waveIndex;
        const TOTAL_WAVES = 24;

        let alpha2 = 0;
        let alpha3 = 0;

        if (w >= 8 && w < 16) {
            // Phase 1: day → golden hour
            alpha2 = (w - 8) / 8; // 0 at wave 8, 1 at wave 16
        } else if (w >= 16) {
            // Phase 2: golden hour → night (smooth crossfade)
            const phaseProgress = (w - 16) / 8; // 0 at wave 16, 1 at wave 24
            alpha2 = 1 - phaseProgress; // 1 at wave 16, fades to 0 at wave 24
            alpha3 = phaseProgress; // 0 at wave 16, fades to 1 at wave 24
        }

        const tweenDuration = 1800;

        if (this.arenaBg2) {
            this.tweens.add({
                targets: this.arenaBg2,
                alpha: alpha2,
                duration: tweenDuration,
                ease: 'Sine.easeInOut'
            });
        }
        if (this.arenaBg3) {
            this.tweens.add({
                targets: this.arenaBg3,
                alpha: alpha3,
                duration: tweenDuration,
                ease: 'Sine.easeInOut'
            });
        }
    }

    showEvolveScreen() {
        this.inputLocked = true;
        document.getElementById('levelUpTitle').innerText = 'EVOLVE FOR ' + this.currentWave.title;
        document.getElementById('evolveDescription').innerText = this.currentWave.description;

        const buttons = [
            document.getElementById('powerBtn1'),
            document.getElementById('powerBtn2'),
            document.getElementById('powerBtn3')
        ];

        const evolveOptions = getEvolveOptions(this);
        evolveOptions.forEach((option, index) => {
            const button = buttons[index];
            button.textContent = option.label;
            button.dataset.power = option.id;
            button.title = option.detail;
            button.classList.remove('hidden');
        });

        document.getElementById('levelUpScreen').classList.remove('hidden');
    }

    // ── Defeat Screen ─────────────────────────────────────────
    showDefeatScreen() {
        if (this._defeatTriggered) return;
        this._defeatTriggered = true;
        this.inputLocked = true;

        // Clean up Void Maw if active
        try {
            this._voidSucking = false;
            if (this._voidMawAttackTimer) { this._voidMawAttackTimer.remove(false); this._voidMawAttackTimer = null; }
            if (this._voidMaw) { if (this._voidMaw._hpLabel) this._voidMaw._hpLabel.destroy(); if (this._voidMaw._pupil) this._voidMaw._pupil.destroy(); this._voidMaw.destroy(); this._voidMaw = null; }
            if (this._voidMawTowers) { this._voidMawTowers.forEach(t => { if (t && t.active) { if (t._hpLabel) t._hpLabel.destroy(); if (t._atkTimer) t._atkTimer.remove(false); t.destroy(); } }); this._voidMawTowers = null; }
        } catch(e) {}
    

        // Stop any active music
        try {
            if (this.music)        { this.music.stop();        this.music.destroy();        this.music = null; }
            if (this.downtimeMusic){ this.downtimeMusic.stop(); this.downtimeMusic.destroy(); this.downtimeMusic = null; }
        } catch(e) {}

        // Play death SFX (best-effort)
        try { this.sound.play('death', { volume: _sfxVolume }); } catch (e) {}

        // ── 1. Play death animation on the player sprite ─────
        if (this.player.body) this.player.body.setVelocity(0);
        this.player.play('sw_death');

        // ── 2. Scatter all living enemies outward ─────────────
        this.enemies.getChildren().forEach(enemy => {
            if (!enemy || !enemy.active) return;
            // Angle directly away from player
            const angle = Phaser.Math.Angle.Between(
                this.player.x, this.player.y, enemy.x, enemy.y
            );
            const speed = Phaser.Math.Between(80, 180);
            if (enemy.body) {
                enemy.body.setVelocity(
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed
                );
                // Slow to a stop over 1.5s
                this.tweens.add({
                    targets: enemy.body.velocity,
                    x: 0, y: 0,
                    duration: 1500,
                    ease: 'Quad.easeOut'
                });
            }
            // Fade enemy out after scatter
            this.tweens.add({
                targets: enemy,
                alpha: 0,
                delay: 1000,
                duration: 800,
                ease: 'Linear'
            });
        });

        // ── 3. Darken backdrop after a beat ──────────────────
        const defeatScreen = document.getElementById('defeatScreen');
        defeatScreen.classList.remove('hidden');
        defeatScreen.classList.add('active');

        window.setTimeout(() => {
            document.getElementById('defeat-backdrop').classList.add('dark');
        }, 400);

        // ── 4. Populate and reveal UI after death anim (~0.9s) ─
        // Death anim = 7 frames @ 8fps ≈ 875ms
        window.setTimeout(() => {
            // Fill stats
            document.getElementById('defeat-kills').innerText = score;
            document.getElementById('defeat-wave').innerText  = this.waveIndex + 1;

            const allRelics = [
                ...(this.player.relics       || []),
                ...(this.player.fusedRelics   || []),
                ...(this.player.secretRelics  || [])
            ];
            document.getElementById('defeat-relics').innerText = allRelics.length;

            // Relic icon chips
            const iconsEl = document.getElementById('defeat-relic-icons');
            iconsEl.innerHTML = '';
            allRelics.forEach(r => {
                const chip = document.createElement('span');
                chip.className = 'defeat-relic-chip';
                chip.title     = r.name;
                chip.textContent = r.icon || '?';
                iconsEl.appendChild(chip);
            });

            // Reveal UI panel and pause the scene once the defeat screen is visible.
            document.getElementById('defeat-ui').classList.remove('hidden');
            this.scene.pause();
        });
    }

    showVictory() {
        document.getElementById('levelUpTitle').innerText = 'SYSTEM RESTORED';
        document.getElementById('evolveDescription').innerText = 'You cleared every wave. Restart to fight again.';

        document.getElementById('powerBtn1').textContent = 'RESTART';
        document.getElementById('powerBtn1').dataset.power = 'restart';
        document.getElementById('powerBtn2').classList.add('hidden');
        document.getElementById('powerBtn3').classList.add('hidden');

        document.getElementById('levelUpScreen').classList.remove('hidden');
        this.scene.pause();
    }
}

// Global Config
const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container',
        width: window.innerWidth,
        height: window.innerHeight
    },
    backgroundColor: '#050505',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [GameScene]
};

// Bridge functions
function restartFromDefeat() {
    // Hard reload — cleanest way to reset all Phaser state and globals
    location.reload();
}

function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    phaserGame = new Phaser.Game(config);
    window.addEventListener('resize', () => {
        if (phaserGame && phaserGame.scale) {
            phaserGame.scale.resize(window.innerWidth, window.innerHeight);
        }
    });
    const target = document.documentElement;
    if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
    } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
    } else if (target.msRequestFullscreen) {
        target.msRequestFullscreen();
    }
    // Hearts will be initialized after create() runs; set a small delay
    setTimeout(() => {
        const scene = phaserGame.scene.scenes[0];
        if (scene && scene.player) updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
    }, 500);
}

function playFusionSound() {
    try {
        const scene = phaserGame && phaserGame.scene.scenes[0];
        if (scene && scene.sound) scene.sound.play('fusion', { volume: _sfxVolume });
    } catch(e) {}
}

function activateSecretRelicBtn() {
    const scene = phaserGame && phaserGame.scene.scenes[0];
    if (scene && scene.activateSecretRelic) scene.activateSecretRelic();
}

function toggleFullscreen() {
    const button = document.getElementById('fullscreen-btn');
    const target = document.documentElement;
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        if (button) button.innerText = '⛶ FULLSCREEN';
        return;
    }
    if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
    } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
    } else if (target.msRequestFullscreen) {
        target.msRequestFullscreen();
    }
}

document.addEventListener('fullscreenchange', () => {
    const button = document.getElementById('fullscreen-btn');
    if (!button) return;
    if (document.fullscreenElement) {
        button.innerText = '❎ EXIT FULLSCREEN';
    } else {
        button.innerText = '⛶ FULLSCREEN';
    }
});

/** Updates the secret relic HUD button — shows charges remaining, hides when none. */
function updateSecretRelicHUD() {
    const scene = phaserGame && phaserGame.scene.scenes[0];
    const btn = document.getElementById('secret-relic-btn');
    if (!btn) return;

    const sr = scene && scene.player && scene.player.secretRelics &&
               scene.player.secretRelics.find(r => r.id === 'cold_burns');
    const wavesLeft = (scene && scene._oneShotWavesLeft) || 0;

    if (!sr) {
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');

    if (wavesLeft > 0) {
        btn.disabled = true;
        btn.innerHTML = `❄️🔥 <span id="secret-relic-label">ACTIVE — ${wavesLeft} WAVE${wavesLeft !== 1 ? 'S' : ''} LEFT</span>`;
        btn.style.setProperty('--sr-glow', '#00ffff');
    } else if (sr.charges > 0) {
        btn.disabled = false;
        btn.innerHTML = `❄️🔥 <span id="secret-relic-label">IT'S SO COLD IT BURNS</span>`;
        btn.style.setProperty('--sr-glow', '#ff00ff');
    } else {
        btn.disabled = true;
        btn.innerHTML = `❄️🔥 <span id="secret-relic-label">SPENT</span>`;
        btn.style.setProperty('--sr-glow', '#444');
    }
}

function applyPowerUp(type) {
    const scene = phaserGame.scene.scenes[0];

    if (type === 'restart') {
        location.reload();
        return;
    }

    if (type === 'heal') {
        scene.player.hp = scene.player.maxHp;
        updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
    } else if (type === 'speed') {
        scene.player.reloadModifier *= 0.8;
    } else if (type === 'range') {
        scene.currentWeapon.range += 30;
    } else if (type === 'shield') {
        scene.player.shieldCharges += 1;
    } else if (type === 'merge_weapons') {
        applyWeaponMerge(scene);
    } else if (type && type.startsWith('weapon_')) {
        const weaponId = type.slice(7);
        upgradeWeaponTier(scene, weaponId);
    }

    document.getElementById('levelUpScreen').classList.add('hidden');
    scene.inputLocked = false;
    scene.canFire = true;   // always restore attack ability after the upgrade screen
    scene.updateWaveUI();
    // Reset positions and temporarily slow enemies so player can react
    if (scene.resetAfterUpgrade) scene.resetAfterUpgrade();
    scene.scene.resume();
    // Clear any stuck keyboard state from keys held during the popup
    if (scene.input && scene.input.keyboard) scene.input.keyboard.resetKeys();
    if (scene.currentWave.bossWave) {
        scene.startBossWave();
    }
}

function upgradeWeaponTier(scene, weaponId) {
    if (!scene.player.weaponTiers) scene.player.weaponTiers = {};
    const currentTier = scene.player.weaponTiers[weaponId] || 0;
    const nextTier = Math.min(3, currentTier + 1);
    scene.player.weaponTiers[weaponId] = nextTier;

    const weapon = weaponRewardVariants.find(w => w.id === weaponId);
    const tierLabel = nextTier === 3 ? 'MAXED' : `Tier ${nextTier}`;
    scene._showWaveAlert(
        `${weapon ? weapon.icon : '⚙️'} ${weapon ? weapon.label : 'Weapon'} ${tierLabel} acquired!`,
        '#00ff99'
    );
}

function applyWeaponMerge(scene) {
    scene.player.weaponMerged = true;
    scene.player.noRelicPickup = true;
    scene.player.weaponTiers = scene.player.weaponTiers || {};
    weaponRewardVariants.forEach(w => scene.player.weaponTiers[w.id] = 3);

    // Sacrifice all relics and cancel any pending relic queues
    scene.player.relics = [];
    scene.player.fusedRelics = [];
    scene.player.secretRelics = [];
    scene._pendingRelics = [];
    scene._pendingRelic = null;
    if (scene.updateRelicsDisplay) scene.updateRelicsDisplay();

    scene.currentWeapon.range += 40;
    scene.player.reloadModifier *= 0.88;

    scene._showWaveAlert('⚡ ULTIMATE ARMAMENT ENGAGED — relic pickups disabled', '#ffcc00');
}

function getMergedWeaponEffectBonus(scene) {
    return scene.player.weaponMerged ? 1.25 : 1;
}

function acceptRelic() {
    const modal = document.getElementById('relic-modal');
    const relic = modal._pendingRelic;
    modal._pendingRelic = null;
    modal._queue = null;
    modal._queueIndex = null;
    modal.classList.add('hidden');

    // Grace period: relics are handled by the draft system now — never resume here
    if (_graceScene) return;

    if (relic && pausedScene) {
        const scene = pausedScene;
        if (scene.player.relics.length < 10) {
            const atStack = relic.maxStack
                ? scene.player.relics.filter(r => r.id === relic.id).length >= relic.maxStack
                : false;
            if (!atStack) {
                scene.player.relics.push(relic);
                relic.effect(scene.player, scene.currentWeapon, scene);
                scene.updateRelicsDisplay();
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            }
        }
    }

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.canFire = true;
        pausedScene.scene.resume();
        if (pausedScene.input && pausedScene.input.keyboard) pausedScene.input.keyboard.resetKeys();
        pausedScene = null;
    }
}

function declineRelic() {
    const modal = document.getElementById('relic-modal');
    modal._pendingRelic = null;
    modal._queue = null;
    modal._queueIndex = null;
    modal.classList.add('hidden');

    // Grace period: relics are handled by the draft system now — never resume here
    if (_graceScene) return;

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.canFire = true;
        pausedScene.scene.resume();
        if (pausedScene.input && pausedScene.input.keyboard) pausedScene.input.keyboard.resetKeys();
        pausedScene = null;
    }
}

// Legacy alias
function closeRelicModal() { acceptRelic(); }

// ── Fusion Modal ──────────────────────────────────────────────
/**
 * Show the fusion offer modal. Game is already paused at this point
 * (pausedScene is set). The player can accept or decline the fusion.
 */
function getFusionRewardChoices(scene) {
    if ((scene.player.fusedRelics || []).length >= MAX_FUSED_RELICS) {
        return [];
    }
    const choices = fusionRecipes
        .map(recipe => recipe.result)
        .filter(result => {
            const owned = (scene.player.fusedRelics || []).filter(r => r.id === result.id).length;
            return owned < (result.maxStack || 2);
        });
    return choices.sort(() => Math.random() - 0.5).slice(0, 3);
}

function showFusionRewardModal(options) {
    const modal = document.getElementById('fusion-reward-modal');
    const container = document.getElementById('fusion-reward-options');
    if (!modal || !container) return;

    container.innerHTML = options.map((option, idx) => {
        return `
            <div class="fusion-reward-card" onclick="acceptFusionReward(${idx})" style="width:140px;padding:14px;border:1px solid rgba(255,255,255,0.18);border-radius:16px;background:rgba(0,0,0,0.32);cursor:pointer;transition:transform 0.18s;">
                <div style="font-size:34px;line-height:1;">${option.icon}</div>
                <div style="font-size:18px;font-weight:bold;margin:10px 0 6px;color:#fff;">${option.name}</div>
                <div style="font-size:13px;line-height:1.4;color:#ccc;min-height:60px;">${option.description}</div>
            </div>`;
    }).join('');

    modal.classList.remove('hidden');
    playFusionSound();
}

function acceptFusionReward(index) {
    if (!_graceScene || !_graceScene._fusionRewardOptions) return;
    const scene = _graceScene;
    const option = scene._fusionRewardOptions[index];
    if (!option) return;

    if ((scene.player.fusedRelics || []).length >= MAX_FUSED_RELICS) {
        // Show red X overlay on the clicked card
        const container = document.getElementById('fusion-reward-options');
        const cards = container ? container.querySelectorAll('.fusion-reward-card') : [];
        if (cards[index]) {
            const card = cards[index];
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 80px;
                color: #ff3333;
                pointer-events: none;
                font-weight: bold;
                animation: fadeOutScale 0.6s ease-out forwards;
                z-index: 9999;
            `;
            overlay.innerText = '✕';
            card.style.position = 'relative';
            card.appendChild(overlay);
            setTimeout(() => overlay.remove(), 600);
        }
        if (typeof scene._showWaveAlert === 'function') {
            scene._showWaveAlert('⚗️ Fusion relic capacity reached', '#ffcc66');
        }
        scene._fusionRewardOptions = null;
        document.getElementById('fusion-reward-modal').classList.add('hidden');
        return;
    }

    const reward = { ...option };
    scene.player.fusedRelics.push(reward);
    recalculatePlayerStats(scene);
    scene.updateRelicsDisplay();
    updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
    if (typeof scene._showWaveAlert === 'function') {
        scene._showWaveAlert(`✅ Reward selected: ${reward.name}`, '#00ff99');
    }

    scene._graceRewardPending = false;
    scene._fusionRewardOptions = null;
    document.getElementById('fusion-reward-modal').classList.add('hidden');
}

function declineFusionReward() {
    if (_graceScene) {
        _graceScene._graceRewardPending = false;
        _graceScene._fusionRewardOptions = null;
    }
    const modal = document.getElementById('fusion-reward-modal');
    if (modal) modal.classList.add('hidden');
}

let _fusionRecipesAvailable = [];
let _fusionRecipeIndex = 0;

function _displayFusionRecipe(index) {
    if (_fusionRecipesAvailable.length === 0) return;
    _fusionRecipeIndex = Math.max(0, Math.min(index, _fusionRecipesAvailable.length - 1));
    const recipe = _fusionRecipesAvailable[_fusionRecipeIndex];
    const fused = recipe.result;
    const isAegis = fused.id === 'aegis_core';
    const modal = document.getElementById('fusion-modal');
    const content = modal.querySelector('.fusion-modal-content');

    modal.classList.toggle('fusion-aegis', isAegis);
    if (content) content.classList.toggle('fusion-aegis', isAegis);

    document.getElementById('fusion-icon').innerText = fused.icon;
    document.getElementById('fusion-title').innerText = '⚗️ FUSION AVAILABLE';
    document.getElementById('fusion-ingredients').innerText =
        recipe.requires
            .map(id => {
                const r = relicPool.find(x => x.id === id);
                return r ? `${r.icon} ${r.name}` : id;
            })
            .join('  +  ');
    document.getElementById('fusion-name').innerText = fused.name;
    document.getElementById('fusion-description').innerText = fused.description;
    const riskNote = document.getElementById('fusion-risk-note');
    if (riskNote) riskNote.innerText = '⚠️ 5-10% chance to fail and destroy all ingredients when attempting this fusion.';
    const resultNote = document.getElementById('fusion-result-note');
    if (resultNote) {
        resultNote.innerText = '';
        resultNote.style.display = 'none';
    }

    // Update counter
    const counter = document.getElementById('fusion-recipe-counter');
    if (counter) counter.innerText = `${_fusionRecipeIndex + 1} / ${_fusionRecipesAvailable.length}`;

    // Update arrow buttons
    const prevBtn = document.getElementById('fusion-prev-btn');
    const nextBtn = document.getElementById('fusion-next-btn');
    if (prevBtn) prevBtn.style.opacity = _fusionRecipeIndex === 0 ? '0.4' : '1';
    if (nextBtn) nextBtn.style.opacity = _fusionRecipeIndex === _fusionRecipesAvailable.length - 1 ? '0.4' : '1';

    // Store recipe on modal for accept/decline
    document.getElementById('fusion-modal')._pendingRecipe = recipe;
}

function fusionNextRecipe() {
    if (_fusionRecipeIndex < _fusionRecipesAvailable.length - 1) {
        _displayFusionRecipe(_fusionRecipeIndex + 1);
    }
}

function fusionPrevRecipe() {
    if (_fusionRecipeIndex > 0) {
        _displayFusionRecipe(_fusionRecipeIndex - 1);
    }
}

function showFusionModal(recipe, scene) {
    _fusionRecipesAvailable = checkAllFusionsAvailable(scene.player.relics);
    _fusionRecipeIndex = 0;
    const modal = document.getElementById('fusion-modal');
    modal.classList.remove('hidden');
    _displayFusionRecipe(0);
    playFusionSound();
}

function setFusionResultMessage(message, success) {
    const statusEl = document.getElementById('grace-fusion-status');
    if (statusEl) {
        statusEl.innerText = message || '';
        statusEl.style.display = message ? 'block' : 'none';
        statusEl.style.color = success ? '#00ff99' : '#ffaaaa';
    }
    const resultNote = document.getElementById('fusion-result-note');
    if (resultNote) {
        resultNote.innerText = message || '';
        resultNote.style.display = message ? 'block' : 'none';
        resultNote.style.color = success ? '#00ff99' : '#ffaaaa';
    }
}

function fusionDidFail() {
    const failChance = 0.05 + Math.random() * 0.05; // 5-10% failure range
    return Math.random() < failChance;
}

function removeFusionIngredients(scene, recipe) {
    if (!scene || !recipe) return;
    if (recipe.requires) {
        recipe.requires.forEach(reqId => {
            const idx = scene.player.relics.findIndex(r => r.id === reqId);
            if (idx !== -1) scene.player.relics.splice(idx, 1);
        });
    }
    if (recipe.requiresNormal) {
        recipe.requiresNormal.forEach(reqId => {
            const idx = scene.player.relics.findIndex(r => r.id === reqId);
            if (idx !== -1) scene.player.relics.splice(idx, 1);
        });
    }
    if (recipe.requiresFused) {
        recipe.requiresFused.forEach(reqId => {
            const idx = scene.player.fusedRelics.findIndex(r => r.id === reqId);
            if (idx !== -1) scene.player.fusedRelics.splice(idx, 1);
        });
    }
}

function showFusionResult(scene, success, message) {
    if (scene && typeof scene._showWaveAlert === 'function') {
        scene._showWaveAlert(message, success ? '#00ff99' : '#ff4444');
    } else {
        console.log(message);
    }
}

function acceptFusion() {
    const modal = document.getElementById('fusion-modal');
    const recipe = modal._pendingRecipe;
    modal._pendingRecipe = null;
    modal.classList.add('hidden');

    // Grace-fusion mode: scene is already paused by advanceWave; don't resume it
    if (_graceScene && _graceScene._graceFusionPending) {
        _graceScene._graceFusionPending = false;
        if (recipe) {
            const scene = _graceScene;
            
            // Check fusion relic cap
            if ((scene.player.fusedRelics || []).length >= MAX_FUSED_RELICS) {
                if (typeof scene._showWaveAlert === 'function') {
                    scene._showWaveAlert('⚗️ Fusion relic capacity reached', '#ffcc66');
                }
                setFusionResultMessage('⚗️ Fusion relic capacity reached. Cannot craft another fusion relic.', false);
                const btn = document.getElementById('grace-fusion-btn');
                if (btn) { btn.classList.add('hidden'); btn._recipe = null; }
                return;
            }
            
            const failed = fusionDidFail();
            removeFusionIngredients(scene, recipe);
            if (failed) {
                scene.updateRelicsDisplay();
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
                showFusionResult(scene, false, '⚠️ Fusion failed! Ingredients were destroyed.');
                setFusionResultMessage('⚠️ Fusion failed! Ingredients were destroyed.', false);
            } else {
                const fusedRelic = { ...recipe.result };
                scene.player.fusedRelics.push(fusedRelic);
                recalculatePlayerStats(scene);
                fusedRelic.effect(scene.player, scene.currentWeapon, scene);
                scene.updateRelicsDisplay();
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
                showFusionResult(scene, true, '✅ Fusion succeeded! The new relic has been forged.');
                setFusionResultMessage('✅ Fusion succeeded! The new relic has been forged.', true);
            }
            const btn = document.getElementById('grace-fusion-btn');
            if (btn) { btn.classList.add('hidden'); btn._recipe = null; }
        }
        return;
    }

    // Fallback mid-game fusion (safety path -- normally only grace screen triggers fusion)
    if (recipe && pausedScene) {
        const scene = pausedScene;
        
        // Check fusion relic cap
        if ((scene.player.fusedRelics || []).length >= MAX_FUSED_RELICS) {
            if (typeof scene._showWaveAlert === 'function') {
                scene._showWaveAlert('⚗️ Fusion relic capacity reached', '#ffcc66');
            }
            setFusionResultMessage('⚗️ Fusion relic capacity reached. Cannot craft another fusion relic.', false);
            return;
        }
        
        const failed = fusionDidFail();
        removeFusionIngredients(scene, recipe);
        if (failed) {
            scene.updateRelicsDisplay();
            updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            showFusionResult(scene, false, '⚠️ Fusion failed! Ingredients were destroyed.');
            setFusionResultMessage('⚠️ Fusion failed! Ingredients were destroyed.', false);
        } else {
            const fusedRelic = { ...recipe.result };
            scene.player.fusedRelics.push(fusedRelic);
            recalculatePlayerStats(scene);
            fusedRelic.effect(scene.player, scene.currentWeapon, scene);
            scene.updateRelicsDisplay();
            updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            showFusionResult(scene, true, '✅ Fusion succeeded! The new relic has been forged.');
            setFusionResultMessage('✅ Fusion succeeded! The new relic has been forged.', true);
        }
    }

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.scene.resume();
        pausedScene = null;
    }
}
function declineFusion() {
    const modal = document.getElementById('fusion-modal');
    modal._pendingRecipe = null;
    modal.classList.add('hidden');

    // Grace-fusion mode: just close modal, leave scene paused
    if (_graceScene && _graceScene._graceFusionPending) {
        _graceScene._graceFusionPending = false;
        return;
    }

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.scene.resume();
        pausedScene = null;
    }
}
document.getElementById('game-container').addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
// ===== HEART HEALTH BAR =====
function updateHeartsDisplay(currentHp, maxHp) {
    const container = document.getElementById('hearts-container');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < maxHp; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart' + (i >= currentHp ? ' empty' : '');
        heart.innerText = '❤️';
        if (i === currentHp - 1 && currentHp < maxHp) {
            // Pulse on the heart that just got lost — actually pulse last full heart
        }
        container.appendChild(heart);
    }
}

// ===== RELIC INVENTORY MODAL =====
function openRelicInventory() {
    const scene = phaserGame && phaserGame.scene.scenes[0];
    const relics = (scene && scene.player) ? scene.player.relics : [];
    const fusedRelics = (scene && scene.player) ? scene.player.fusedRelics : [];
    const secretRelics = (scene && scene.player) ? (scene.player.secretRelics || []) : [];
    const cap = (scene && scene.relicCap) ? scene.relicCap : 10;

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    const allRelics = [...relics, ...fusedRelics, ...secretRelics];
    const weaponTiers = scene.player.weaponTiers || {};
    const weapons = weaponRewardVariants.map(w => ({ ...w, tier: weaponTiers[w.id] || 0 })).filter(w => w.tier > 0 || scene.player.weaponMerged);

    if (allRelics.length === 0 && weapons.length === 0) {
        grid.innerHTML = '<div class="inv-empty">No relics or weapon systems collected yet.<br>Defeat enemies to find them!</div>';
    } else {
        if (weapons.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;color:#a0d8ff;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;';
            header.innerText = 'Weapon Systems';
            grid.appendChild(header);
            weapons.forEach(weapon => grid.appendChild(makeWeaponCard(weapon, scene.player.weaponMerged)));
        }

        // Section header for normal relics
        if (relics.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;color:#aaa;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;';
            header.innerText = `Normal Relics (${relics.length}/${cap})`;
            grid.appendChild(header);
            relics.forEach(relic => grid.appendChild(makeRelicCard(relic, false)));
        }

        // Section header for fused relics
        if (fusedRelics.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;color:#ff6666;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px;';
            header.innerText = `⚗️ Fused Relics (${fusedRelics.length}/${MAX_FUSED_RELICS})`;
            grid.appendChild(header);
            fusedRelics.forEach(relic => grid.appendChild(makeRelicCard(relic, true)));
        }

        // Section header for secret relics
        if (secretRelics.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px;background:linear-gradient(90deg,#ff00ff,#00ffff,#ff00ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;';
            header.innerText = `🌈 Secret Relics`;
            grid.appendChild(header);
            secretRelics.forEach(relic => grid.appendChild(makeRelicCard(relic, false, true)));
        }
    }

    document.getElementById('inventory-modal').classList.remove('hidden');
}

function makeRelicCard(relic, isFused, isSecret) {
    const card = document.createElement('div');
    card.className = 'inv-relic-card' + (isFused ? ' inv-relic-fused' : '') + (isSecret ? ' inv-relic-secret' : '');
    card.title = 'Click for more info';
    const glowCol = isSecret ? '#ff00ff' : (relic.glowColor || '#ffffff');
    card.style.borderColor = glowCol;
    card.style.boxShadow = `0 0 ${isFused ? 14 : isSecret ? 18 : 8}px ${glowCol}${isFused ? '88' : isSecret ? 'cc' : '44'}`;
    if (isFused) card.style.background = 'rgba(120,0,0,0.25)';
    if (isSecret) card.style.background = 'rgba(80,0,80,0.3)';
    const tag = isFused
        ? ' <span style="color:#ff6666;font-size:10px;">FUSED</span>'
        : isSecret
            ? ' <span style="color:#ff00ff;font-size:10px;">SECRET</span>'
            : '';
    card.innerHTML = `
        <span class="inv-relic-icon${isSecret ? ' rainbow-icon' : ''}">${relic.icon || '?'}</span>
        <div class="inv-relic-name">${relic.name}${tag}</div>
        <div class="inv-relic-desc">${relic.description}</div>
        <button class="inv-discard-btn" title="Discard relic" onclick="event.stopPropagation(); confirmDiscardRelic('${relic.id}', ${isFused}, ${isSecret ? 'true' : 'false'})">🗑</button>
    `;
    card.addEventListener('click', () => openRelicDetailModal(relic));
    return card;
}

function makeWeaponCard(weapon, isMerged) {
    const card = document.createElement('div');
    card.className = 'inv-relic-card';
    card.title = 'Click for more info';
    const tierLabel = isMerged ? 'Merged Ultimate' : `Tier ${weapon.tier}`;
    const color = isMerged ? '#ffcc00' : '#66ccff';
    card.style.borderColor = color;
    card.style.boxShadow = `0 0 12px ${color}88`;
    card.innerHTML = `
        <span class="inv-relic-icon">${weapon.icon || '⚙️'}</span>
        <div class="inv-relic-name">${weapon.label} <span style="color:#aadfff;font-size:11px;">${tierLabel}</span></div>
        <div class="inv-relic-desc">${weapon.detail}</div>
    `;
    card.addEventListener('click', () => openRelicDetailModal({
        icon: weapon.icon,
        name: weapon.label,
        description: `${weapon.detail} \n\nCurrent Tier: ${weapon.tier}${isMerged ? ' (Merged Ultimate)' : ''}`
    }));
    return card;
}

let _pendingDiscard = null;
function confirmDiscardRelic(relicId, isFused, isSecret) {
    _pendingDiscard = { relicId, isFused, isSecret: !!isSecret };
    const scene = phaserGame && phaserGame.scene.scenes[0];
    const pool = isSecret
        ? (scene && scene.player.secretRelics) || []
        : isFused
            ? (scene && scene.player.fusedRelics) || []
            : (scene && scene.player.relics) || [];
    const relic = pool.find(r => r.id === relicId);
    const name = relic ? relic.name : relicId;

    document.getElementById('discard-relic-name').innerText = name;
    document.getElementById('discard-modal').classList.remove('hidden');
}

function confirmDiscard() {
    document.getElementById('discard-modal').classList.add('hidden');
    if (_pendingDiscard) {
        throwRelic(_pendingDiscard.relicId, _pendingDiscard.isFused, _pendingDiscard.isSecret);
        _pendingDiscard = null;
    }
}

function cancelDiscard() {
    _pendingDiscard = null;
    document.getElementById('discard-modal').classList.add('hidden');
}

function openRelicDetailModal(relic) {
    const modal = document.getElementById('inventory-detail-modal');
    document.getElementById('detail-modal-icon').innerText = relic.icon || '?';
    document.getElementById('detail-modal-title').innerText = relic.name || 'RELIC DETAILS';
    document.getElementById('detail-modal-description').innerText = relic.description || 'No description available.';
    modal.classList.remove('hidden');
}

function closeInventoryDetailModal() {
    document.getElementById('inventory-detail-modal').classList.add('hidden');
}

function closeInventoryDetailOnBackdrop(e) {
    if (e.target === document.getElementById('inventory-detail-modal')) closeInventoryDetailModal();
}


function closeInventoryModal() {
    document.getElementById('inventory-modal').classList.add('hidden');
}

function closeInventoryOnBackdrop(e) {
    if (e.target === document.getElementById('inventory-modal')) closeInventoryModal();
}

// ===== THROW / DISCARD RELIC =====
function throwRelic(relicId, isFused, isSecret) {
    const scene = phaserGame && phaserGame.scene.scenes[0];
    if (!scene || !scene.player) return;

    if (isSecret) {
        const idx = scene.player.secretRelics ? scene.player.secretRelics.findIndex(r => r.id === relicId) : -1;
        if (idx !== -1) scene.player.secretRelics.splice(idx, 1);
        // Also cancel one-shot if active
        if (scene._oneShotWavesLeft > 0) scene._oneShotWavesLeft = 0;
    } else if (isFused) {
        const idx = scene.player.fusedRelics.findIndex(r => r.id === relicId);
        if (idx !== -1) scene.player.fusedRelics.splice(idx, 1);
    } else {
        const idx = scene.player.relics.findIndex(r => r.id === relicId);
        if (idx !== -1) scene.player.relics.splice(idx, 1);
    }

    scene.updateRelicsDisplay();
    updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
    // Refresh the inventory grid in place
    openRelicInventory();
}

// ===== RELIC TUTORIAL =====
let _tutorialSeen = false;      // flips to true after first dismissal
let _tutorialStep = 0;
let _tutorialGraceFrozen = false; // true while tutorial blocks the grace timer

const TUTORIAL_SLIDES = 3;

/**
 * Opens the relic tutorial overlay and freezes the grace-period countdown.
 * Called automatically on the first grace period only.
 */
function showRelicTutorial() {
    _tutorialStep = 0;
    _tutorialGraceFrozen = true;

    // Reset to slide 0
    for (let i = 0; i < TUTORIAL_SLIDES; i++) {
        const slide = document.getElementById('tslide-' + i);
        const dot   = document.getElementById('tdot-'   + i);
        if (slide) slide.classList.toggle('hidden', i !== 0);
        if (dot)   dot.classList.toggle('active',  i === 0);
    }
    _syncTutorialBtn();

    document.getElementById('relic-tutorial-overlay').classList.remove('hidden');
}

/** Advance to next slide, or close on the last slide. */
function relicTutorialNext() {
    _tutorialStep++;
    if (_tutorialStep >= TUTORIAL_SLIDES) {
        relicTutorialClose();
        return;
    }

    for (let i = 0; i < TUTORIAL_SLIDES; i++) {
        const slide = document.getElementById('tslide-' + i);
        const dot   = document.getElementById('tdot-'   + i);
        if (slide) slide.classList.toggle('hidden', i !== _tutorialStep);
        if (dot)   dot.classList.toggle('active',  i === _tutorialStep);
    }
    _syncTutorialBtn();
}

/** Skip straight to close. */
function relicTutorialSkip() {
    relicTutorialClose();
}

/** Close the overlay and resume the grace countdown. */
function relicTutorialClose() {
    document.getElementById('relic-tutorial-overlay').classList.add('hidden');
    _tutorialSeen = true;
    _tutorialGraceFrozen = false;
    // Resume the grace-period timer — re-invoke the pending tick loop
    if (_graceTimer !== null) {
        // Timer is already ticking (was paused by the frozen flag)
        // nothing more to do — the tick loop will now advance normally
    }
}

/** Update the Next button label on the last slide. */
function _syncTutorialBtn() {
    const btn       = document.getElementById('relic-tutorial-next-btn');
    const arrowSpan = document.getElementById('relic-tutorial-btn-arrow');
    if (!btn) return;
    if (_tutorialStep === TUTORIAL_SLIDES - 1) {
        btn.childNodes[0].textContent = 'GOT IT ';
        if (arrowSpan) arrowSpan.textContent = '✔';
    } else {
        btn.childNodes[0].textContent = 'NEXT ';
        if (arrowSpan) arrowSpan.textContent = '▶';
    }
}

// ===== GRACE PERIOD =====
let _graceTimer = null;
let _graceScene = null;

function showGracePeriod(scene) {
    _graceScene = scene;
    const prevWaveIndex = scene.waveIndex - 1;
    const nextWave = scene.currentWave;
    

    // Populate stats
    document.getElementById('grace-wave-title').innerText = `WAVE ${prevWaveIndex + 1} COMPLETE`;
    document.getElementById('grace-next-wave').innerText = `NEXT: ${nextWave.title}`;

    const player = scene.player;
    const statsEl = document.getElementById('grace-stats');
    statsEl.innerHTML = `
        <div class="grace-stat"><span class="grace-stat-label">KILLS</span><span class="grace-stat-value">${score}</span></div>
        <div class="grace-stat"><span class="grace-stat-label">HP</span><span class="grace-stat-value">${player.hp} / ${player.maxHp}</span></div>
        <div class="grace-stat"><span class="grace-stat-label">RELICS</span><span class="grace-stat-value">${player.relics.length + (scene._pendingRelics ? scene._pendingRelics.length : 0)} / ${scene.relicCap || 10}</span></div>
        <div class="grace-stat"><span class="grace-stat-label">SHIELDS</span><span class="grace-stat-value">${player.shieldCharges || 0}</span></div>
    `;

    // Show fusion button if a recipe is available and not yet at stack cap or global cap
    const fusionBtn = document.getElementById('grace-fusion-btn');
    const fusionNote = document.getElementById('grace-fusion-note');
    const fusionStatus = document.getElementById('grace-fusion-status');
    if (fusionBtn) {
        // Check if global fusion relic cap is reached
        if ((player.fusedRelics || []).length >= MAX_FUSED_RELICS) {
            fusionBtn.classList.add('hidden');
            fusionBtn._recipe = null;
            if (fusionNote) {
                fusionNote.style.display = 'block';
                fusionNote.innerText = '⚗️ Fusion relic capacity reached (max 3)';
            }
        } else {
            const availableRecipes = checkAllFusionsAvailable(player.relics);
            const fusableRecipes = availableRecipes.filter(recipe =>
                player.fusedRelics.filter(r => r.id === recipe.result.id).length < (recipe.result.maxStack || 2)
            );
            if (fusableRecipes.length > 0) {
                fusionBtn.classList.remove('hidden');
                fusionBtn._recipe = fusableRecipes[0];
                if (fusionNote) {
                    fusionNote.style.display = 'block';
                    fusionNote.innerText = `⚠️ ${fusableRecipes.length} fusion${fusableRecipes.length > 1 ? 's' : ''} available (5-10% fail chance)`;
                }
            } else {
                fusionBtn.classList.add('hidden');
                fusionBtn._recipe = null;
                if (fusionNote) fusionNote.style.display = 'none';
            }
        }
    }
    if (fusionStatus) {
        fusionStatus.style.display = 'none';
        fusionStatus.innerText = '';
    }

    // Check for secret fusion (available after wave 10)
    const secretFusionBtn = document.getElementById('grace-secret-fusion-btn');
    if (secretFusionBtn) {
        const secretRecipeMatch = checkSecretFusionAvailable(
            player.relics, player.fusedRelics, scene.waveIndex
        );
        // Also check player doesn't already have it in secretRelics
        const alreadyHasSecret = player.secretRelics && player.secretRelics.some(r => r.id === 'cold_burns');
        if (secretRecipeMatch && !alreadyHasSecret) {
            secretFusionBtn.classList.remove('hidden');
            secretFusionBtn._recipe = secretRecipeMatch;
        } else {
            secretFusionBtn.classList.add('hidden');
            secretFusionBtn._recipe = null;
        }
    }

    // After wave 10, give a reward choice of a fusion relic.
    if (scene.waveIndex === 10 && !scene._wave10RewardOffered) {
        scene._wave10RewardOffered = true;
        const rewardOptions = getFusionRewardChoices(scene);
        if (rewardOptions.length > 0) {
            scene._graceRewardPending = true;
            scene._fusionRewardOptions = rewardOptions;
            showFusionRewardModal(rewardOptions);
        }
    }

    // After wave 20, increase relic capacity and alert the player.
    if (scene.waveIndex === 20 && scene.relicCap === 10) {
        scene.relicCap = 12;
        if (typeof scene._showWaveAlert === 'function') {
            scene._showWaveAlert('🎒 Relic capacity increased to 12!', '#00ff99');
        }
    }

    // Timer
    let timeLeft = 20;
    document.getElementById('grace-countdown').innerText = timeLeft;
    document.getElementById('grace-timer-fill').style.width = '100%';

    document.getElementById('graceScreen').classList.remove('hidden');
    setSfxVolume(_sfxVolume, false);
    setGraceMusicVolume(_graceMusicVolume, false);

    // Show relic tutorial on the very first grace period
    if (!_tutorialSeen && prevWaveIndex === 0) {
        showRelicTutorial();
    }

    // Animate timer bar shrinking
    // Use requestAnimationFrame for smooth bar
    const startTime = performance.now();
    const duration = 20000;
    let frozenElapsed = 0;   // accumulated time spent frozen (tutorial open)
    let lastFrozenCheck = null;

    function tick(now) {
        // Pause the countdown while the tutorial overlay is visible
        if (_tutorialGraceFrozen) {
            lastFrozenCheck = now;
            _graceTimer = requestAnimationFrame(tick);
            return;
        }
        // If we just came out of a freeze, absorb the frozen gap
        if (lastFrozenCheck !== null) {
            frozenElapsed += now - lastFrozenCheck;
            lastFrozenCheck = null;
        }

        const elapsed = now - startTime - frozenElapsed;
        const remaining = Math.max(0, duration - elapsed);
        const pct = (remaining / duration) * 100;
        const fillEl = document.getElementById('grace-timer-fill');
        if (fillEl) fillEl.style.width = pct + '%';
        const cdEl = document.getElementById('grace-countdown');
        if (cdEl) cdEl.innerText = Math.ceil(remaining / 1000);

        if (remaining > 0 && document.getElementById('graceScreen') && !document.getElementById('graceScreen').classList.contains('hidden')) {
            _graceTimer = requestAnimationFrame(tick);
        } else if (remaining <= 0) {
            endGracePeriod();
        }
    }
    _graceTimer = requestAnimationFrame(tick);

    // Render any buffered relics as inline draft cards on the grace screen
    renderRelicDraft(scene);
}

/**
 * Renders buffered relics as pick-one draft cards directly inside the grace screen.
 * No modal, no scene.resume() — the player browses and clicks to keep or discard.
 * This is the ONLY path for applying relics during the grace period.
 */
function renderRelicDraft(scene) {
    const container = document.getElementById('grace-relic-draft');
    if (!container) return;

    const pending = (scene && scene._pendingRelics) ? scene._pendingRelics : [];

    if (pending.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Build stack counts for owned relics so we can show 2x, 3x etc.
    const ownedCounts = {};
    (scene.player.relics || []).forEach(r => {
        ownedCounts[r.id] = (ownedCounts[r.id] || 0) + 1;
    });

    let html = `<div class="relic-draft-header">
        <span class="relic-draft-title">⬇ RELICS FOUND</span>
        <span class="relic-draft-count">${pending.length} available</span>
    </div>
    <div class="relic-draft-grid">`;

    pending.forEach((relic, idx) => {
        const overCap = scene.player.relics.length + idx >= scene.relicCap;
        const atStack = relic.maxStack
            ? (scene.player.relics.filter(r => r.id === relic.id).length >= relic.maxStack)
            : false;
        const disabled = overCap || atStack;
        const disabledMsg = overCap ? `Full` : atStack ? `Max` : '';

        const currentStack = ownedCounts[relic.id] || 0;
        const stackBadge = currentStack > 0
            ? `<span class="relic-grid-stack-badge">${currentStack + 1}×</span>`
            : '';

        html += `<div class="relic-grid-card${disabled ? ' relic-grid-disabled' : ''}"
            style="--relic-glow: ${relic.glowColor || '#ffffff'};">
            <div class="relic-grid-icon">${relic.icon || '?'}</div>
            <div class="relic-grid-name">${relic.name}</div>
            ${stackBadge}
            ${disabled ? `<div class="relic-grid-disabled-msg">${disabledMsg}</div>` : `
                <div class="relic-grid-buttons">
                    <button class="relic-grid-take" onclick="event.stopPropagation(); draftTakeRelic(${idx})">✔</button>
                    <button class="relic-grid-leave" onclick="event.stopPropagation(); draftLeaveRelic(${idx})">✖</button>
                </div>
                <div class="relic-grid-desc">${relic.description}</div>
            `}
        </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function toggleRelicDraftExpand(row, idx) {
    const desc = row.querySelector('.relic-draft-row-desc');
    const chevron = row.querySelector('.relic-draft-chevron');
    if (!desc) return;
    const isOpen = row.dataset.expanded === 'true';
    row.dataset.expanded = isOpen ? 'false' : 'true';
    desc.classList.toggle('hidden', isOpen);
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}

/** Called when player clicks TAKE IT on a draft card. */
function draftTakeRelic(idx) {
    if (!_graceScene) return;
    const scene = _graceScene;
    const pending = scene._pendingRelics;
    if (!pending || idx >= pending.length) return;

    const relic = pending[idx];

    // Enforce caps
    if (scene.player.relics.length >= scene.relicCap) {
        pending.splice(idx, 1);
        renderRelicDraft(scene);
        return;
    }
    if (relic.maxStack) {
        const count = scene.player.relics.filter(r => r.id === relic.id).length;
        if (count >= relic.maxStack) {
            pending.splice(idx, 1);
            renderRelicDraft(scene);
            return;
        }
    }

    // Apply the relic
    scene.player.relics.push(relic);
    relic.effect(scene.player, scene.currentWeapon, scene);

    // Siphon Circuit: instant heal on pickup
    if (relic.id === 'siphon_circuit') {
        scene.player.hp = Math.min(scene.player.hp + 1, scene.player.maxHp);
    }
    // Titanium Shell: instant partial heal
    if (relic.id === 'titanium_shell') {
        scene.player.shieldCharges = (scene.player.shieldCharges || 0) + 1;
        scene.player.hp = Math.min(scene.player.hp + 1, scene.player.maxHp);
    }

    scene.updateRelicsDisplay();
    updateHeartsDisplay(scene.player.hp, scene.player.maxHp);

    // Remove from pending and re-render
    pending.splice(idx, 1);
    renderRelicDraft(scene);
}

/** Called when player clicks LEAVE IT on a draft card. */
function draftLeaveRelic(idx) {
    if (!_graceScene) return;
    const scene = _graceScene;
    if (!scene._pendingRelics) return;
    scene._pendingRelics.splice(idx, 1);
    renderRelicDraft(scene);
}

/**
 * Called by the ⚗️ FUSE button on the grace screen.
 * The scene is already paused — we just show the fusion modal.
 * We set a special flag so acceptFusion/declineFusion know NOT
 * to call scene.resume() (endGracePeriod will do that later).
 */
function offerGraceFusion() {
    const btn = document.getElementById('grace-fusion-btn');
    const recipe = btn && btn._recipe;
    if (!recipe || !_graceScene) return;

    // Mark that we're in grace-fusion mode
    _graceScene._graceFusionPending = true;

    const fused = recipe.result;
    const isAegis = fused.id === 'aegis_core';
    const modal = document.getElementById('fusion-modal');
    const content = modal.querySelector('.fusion-modal-content');
    modal.classList.toggle('fusion-aegis', isAegis);
    if (content) content.classList.toggle('fusion-aegis', isAegis);

    document.getElementById('fusion-icon').innerText = fused.icon;
    document.getElementById('fusion-title').innerText = '⚗️ FUSION AVAILABLE';
    document.getElementById('fusion-ingredients').innerText =
        recipe.requires
            .map(id => {
                const r = relicPool.find(x => x.id === id);
                return r ? `${r.icon} ${r.name}` : id;
            })
            .join('  +  ');
    document.getElementById('fusion-name').innerText = fused.name;
    document.getElementById('fusion-description').innerText = fused.description;
    const riskNote = document.getElementById('fusion-risk-note');
    if (riskNote) riskNote.innerText = '⚠️ 5-10% chance to fail and destroy all ingredients when attempting this fusion.';
    const resultNote = document.getElementById('fusion-result-note');
    if (resultNote) {
        resultNote.innerText = '';
        resultNote.style.display = 'none';
    }
    document.getElementById('fusion-modal')._pendingRecipe = recipe;
    document.getElementById('fusion-modal').classList.remove('hidden');
    playFusionSound();
}

/** Process queued relics (shows relic modal sequentially during grace period). */
function processPendingRelics(scene) {
    if (!scene) return;
    const queue = scene._pendingRelics || [];
    if (!queue || queue.length === 0) {
        // nothing to do
        if (_graceScene === scene) _graceScene = null;
        pausedScene = null;
        return;
    }

    // Attach the queue to the modal for browsing
    const modal = document.getElementById('relic-modal');
    if (!modal) return;
    modal._queue = queue;
    modal._queueIndex = 0;
    pausedScene = scene;
    showRelicModal();
}

function nextPendingRelic() {
    const modal = document.getElementById('relic-modal');
    if (!modal || !modal._queue) return;
    if (modal._queueIndex < modal._queue.length - 1) {
        modal._queueIndex++;
        showRelicModal();
    }
}

function prevPendingRelic() {
    const modal = document.getElementById('relic-modal');
    if (!modal || !modal._queue) return;
    if (modal._queueIndex > 0) {
        modal._queueIndex--;
        showRelicModal();
    }
}

/**
 * Offer the secret ??? relic fusion from the grace screen.
 */
function offerGraceSecretFusion() {
    const btn = document.getElementById('grace-secret-fusion-btn');
    if (!btn || !btn._recipe || !_graceScene) return;

    _graceScene._graceSecretFusionPending = true;

    // Show the secret fusion modal
    const modal = document.getElementById('secret-fusion-modal');
    if (!modal) return;
    modal._pendingRecipe = btn._recipe;
    document.getElementById('secret-fusion-modal').classList.remove('hidden');

    // Play fusion sound
    playFusionSound();
}

function acceptSecretFusion() {
    const modal = document.getElementById('secret-fusion-modal');
    const recipe = modal && modal._pendingRecipe;
    if (modal) { modal._pendingRecipe = null; modal.classList.add('hidden'); }

    if (_graceScene && _graceScene._graceSecretFusionPending) {
        _graceScene._graceSecretFusionPending = false;
        if (recipe && _graceScene.player) {
            const scene = _graceScene;
            const failed = fusionDidFail();
            removeFusionIngredients(scene, recipe);
            if (failed) {
                scene.updateRelicsDisplay();
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
                updateSecretRelicHUD();
                showFusionResult(scene, false, '⚠️ Secret fusion failed! Ingredients were destroyed.');
                setFusionResultMessage('⚠️ Secret fusion failed! Ingredients were destroyed.', false);
            } else {
                const newSR = { ...recipe.result, charges: 1 };
                scene.player.secretRelics = scene.player.secretRelics || [];
                scene.player.secretRelics.push(newSR);
                recalculatePlayerStats(scene);
                scene.updateRelicsDisplay();
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
                updateSecretRelicHUD();
                showFusionResult(scene, true, '✅ Secret fusion succeeded! The legendary relic is yours.');
                setFusionResultMessage('✅ Secret fusion succeeded! The legendary relic is yours.', true);
            }

            // Hide secret fusion button
            const sfBtn = document.getElementById('grace-secret-fusion-btn');
            if (sfBtn) { sfBtn.classList.add('hidden'); sfBtn._recipe = null; }
        }
    }
}

function declineSecretFusion() {
    const modal = document.getElementById('secret-fusion-modal');
    if (modal) { modal._pendingRecipe = null; modal.classList.add('hidden'); }
    if (_graceScene) _graceScene._graceSecretFusionPending = false;
}

// ===== DOWNSIDE CARD SYSTEM =====
const DOWNSIDE_OPTIONS = [
    {
        id: 'lose_heart',
        icon: '💔',
        label: 'CORRUPTED BLOOD',
        detail: 'Lose 1 maximum heart permanently.',
        apply(scene) {
            if (scene.player.maxHp > 1) {
                scene.player.maxHp -= 1;
                scene.player.hp = Math.min(scene.player.hp, scene.player.maxHp);
                updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            }
        }
    },
    {
        id: 'cooldown',
        icon: '⏳',
        label: 'NEURAL LAG',
        detail: '+10% attack cooldown. Your reflexes degrade.',
        apply(scene) {
            scene.player.reloadModifier *= 1.10;
        }
    },
    {
        id: 'range_nerf',
        icon: '📉',
        label: 'SIGNAL DECAY',
        detail: '-7% weapon range. Your reach shrinks.',
        apply(scene) {
            scene.currentWeapon.range *= 0.93;
        }
    }
];

let _downsideScene = null;

function showDownsideScreen(scene) {
    _downsideScene = scene;

    const el = document.getElementById('downsideScreen');
    const waveNum = scene.waveIndex; // wave just completed

    document.getElementById('downside-wave-label').innerText = `AFTER WAVE ${waveNum} — SYSTEM CORRUPTION`;
    document.getElementById('downside-subtitle').innerText = 'The system fights back. Choose your punishment.';

    const container = document.getElementById('downside-cards');
    container.innerHTML = '';

    DOWNSIDE_OPTIONS.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'downside-card';
        btn.innerHTML = `
            <span class="downside-icon">${opt.icon}</span>
            <span class="downside-label">${opt.label}</span>
            <span class="downside-detail">${opt.detail}</span>
        `;
        btn.addEventListener('click', () => applyDownside(opt.id));
        container.appendChild(btn);
    });

    el.classList.remove('hidden');
}

function applyDownside(id) {
    const scene = _downsideScene;
    _downsideScene = null;

    document.getElementById('downsideScreen').classList.add('hidden');

    if (scene) {
        const option = DOWNSIDE_OPTIONS.find(o => o.id === id);
        if (option) option.apply(scene);
        
        // FIX: Instead of resuming the scene here and skipping the power-up,
        // we now transition directly into the evolve/power-up selection screen.
        scene.showEvolveScreen();
    }
}

function endGracePeriod() {
    if (_graceTimer) { cancelAnimationFrame(_graceTimer); _graceTimer = null; }
    document.getElementById('graceScreen').classList.add('hidden');
    closeInventoryModal();

    if (!_graceScene) return;
    const scene = _graceScene;
    _graceScene = null;

    // Flush any relics the player chose not to pick — they are discarded
    if (scene._pendingRelics) scene._pendingRelics = [];

    // Ensure canFire is restored — grace period can't leave it false
    scene.canFire = true;

    // Stop downtime music — combat is about to resume
    if (scene.stopDowntimeMusic) scene.stopDowntimeMusic();
    if (scene.startAmbienceMusic) scene.startAmbienceMusic();

    // Every 4th completed wave (waveIndex is already incremented), show a downside card
    // Skip for the boss wave -- it goes straight to evolve then boss fight
    if (scene.waveIndex > 0 && scene.waveIndex % 4 === 0 && !scene.currentWave.bossWave) {
        showDownsideScreen(scene);
        return; // showDownsideScreen will now safely chain into showEvolveScreen when completed
    }

    // Show evolve/power-up screen normally for non-corrupted waves
    scene.showEvolveScreen();
}
