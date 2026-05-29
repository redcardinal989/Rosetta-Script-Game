// =============================================================
//  RELIC SYSTEM  —  relics.js
//  All relic definitions, the fused relic, drop logic,
//  and fusion detection live here.
// =============================================================

// ── Drop chance ───────────────────────────────────────────────
/**
 * Returns true ~20% of the time — controls whether a dead
 * enemy drops a relic.
 */
function shouldDropRelic() {
    return Math.random() < 0.20;
}

// ── Base relic pool ───────────────────────────────────────────
/**
 * Every normal relic the player can find in the world.
 * Keep `name` values stable — the fusion check uses them.
 */
const relicPool = [
    {
        id: 'overclock_core',
        name: 'Overclock Core',
        icon: '⚡',
        description: 'Permanent +15% attack speed.',
        color: 0xffd700,
        glowColor: '#ffd700',
        isFused: false,
        effect(player, weapon, scene) {
            player.reloadModifier *= 0.85;
        }
    },
    {
        id: 'titanium_shell',
        name: 'Titanium Shell',
        icon: '🛡️',
        description: 'Increases Maximum HP by 1 and grants a shield charge.',
        color: 0x888888,
        glowColor: '#888888',
        isFused: false,
        effect(player, weapon, scene) {
            player.maxHp += 1;
            // Instant healing is handled during the pickup event to prevent stacking on reload loops
        }
    },
    {
        id: 'plasma_extender',
        name: 'Plasma Extender',
        icon: '📏',
        description: 'Extends attack reach by +25 units.',
        color: 0x00ffff,
        glowColor: '#00ffff',
        isFused: false,
        effect(player, weapon, scene) {
            weapon.range += 25;
        }
    },
    {
        id: 'siphon_circuit',
        name: 'Siphon Circuit',
        icon: '🧪',
        description: 'Heals 1 HP instantly upon pickup.',
        color: 0x33cc33,
        glowColor: '#33cc33',
        isFused: false,
        effect(player, weapon, scene) {
            // Instant heal handled structurally during pickup
        }
    },
    {
        id: 'fracture_lens',
        name: 'Fracture Lens',
        icon: '🔷',
        description: 'Your slashes hit harder — +1 damage per swing. Max 2 stacks.',
        color: 0xff6600,
        glowColor: '#ff6600',
        isFused: false,
        maxStack: 2,
        effect(player, weapon, scene) {
            player.bonusDamage = Math.min((player.bonusDamage || 0) + 1, 2);
        }
    },
    {
        id: 'swift_boots',
        name: 'Swift Boots',
        icon: '👟',
        description: 'Permanent +5% movement speed. Stacks with no cap (beyond the 10-relic limit).',
        color: 0x00ff99,
        glowColor: '#00ff99',
        isFused: false,
        effect(player, weapon, scene) {
            // Each stack multiplies base speed by 1.05
            player.moveSpeedMultiplier = (player.moveSpeedMultiplier || 1) * 1.05;
        }
    },
    {
        id: 'cryo_shard',
        name: 'Cryo Shard',
        icon: '❄️',
        description: 'Enemies that touch you are frozen for 1 second per Cryo Shard stack (max 3 shards = 3s freeze).',
        color: 0x88eeff,
        glowColor: '#88eeff',
        isFused: false,
        maxStack: 3,
        effect(player, weapon, scene) {
            player.cryoStacks = (player.cryoStacks || 0) + 1;
            player.hasCryo = true;
        }
    }
];

// ── Fused relic definitions ───────────────────────────────────
/**
 * Each entry describes one fusion recipe.
 * requires  – the exact relic IDs that must both be in inventory
 * result    – the fused relic object granted to the player
 */
const fusionRecipes = [
    {
        requires: ['overclock_core', 'plasma_extender'],
        result: {
            id: 'voltfire_matrix',
            name: 'Voltfire Matrix',
            icon: '🔴',
            description:
                'Fusion of speed and reach. Enemies that touch you are scorched ' +
                '(3 ticks, ~2.4s). 1 stack burns 20% of enemy max HP; 2 stacks burn 40%. Max 2 stacks.',
            color: 0xcc0000,
            glowColor: '#cc0000',
            isFused: true,
            maxStack: 2,
            dotDamage: 1,
            dotInterval: 2000,
            dotDuration: 6000,
            effect(player, weapon, scene) {
                player.hasDot = true;
                player.dotStacks = (player.dotStacks || 0) + 1;
            }
        }
    },
    {
        requires: ['titanium_shell', 'siphon_circuit'],
        result: {
            id: 'aegis_core',
            name: 'Aegis Core',
            icon: '🔵',
            description:
                'A visible energy shield surrounds you, absorbing up to 4 hits before ' +
                'shattering. Automatically recharges after 30 seconds. Max 1 of this relic.',
            color: 0x00ccff,
            glowColor: '#00ccff',
            isFused: true,
            maxStack: 1,
            shieldHits: 4,
            rechargeSecs: 30,
            effect(player, weapon, scene) {
                if (scene && scene.updateAegisVisual) scene.updateAegisVisual();
            }
        }
    }
    ,
    {
        requires: ['swift_boots', 'fracture_lens'],
        result: {
            id: 'phase_stride',
            name: 'Phase Stride',
            icon: '💨',
            description: 'Combines haste and precision. Grants +12% movement speed and leaves a damaging afterimage when moving. Max 2 stacks.',
            color: 0xffa500,
            glowColor: '#ffb366',
            isFused: true,
            maxStack: 2,
            effect(player, weapon, scene) {
                player.moveSpeedMultiplier = (player.moveSpeedMultiplier || 1) * 1.12;
                player.phaseStride = true;
                player.phaseStrideStacks = (player.phaseStrideStacks || 0) + 1;
            }
        }
    },
    {
        requires: ['cryo_shard', 'plasma_extender'],
        result: {
            id: 'glacial_arc',
            name: 'Glacial Arc',
            icon: '❄️',
            description: 'Freezing energy empowers your reach: melee range +15 and attacks can briefly freeze enemies. Max 2 stacks.',
            color: 0x88ccff,
            glowColor: '#88ddff',
            isFused: true,
            maxStack: 2,
            effect(player, weapon, scene) {
                weapon.range = (weapon.range || 150) + 15;
                player.attackFreezes = true;
                player.attackFreezeDuration = Math.max(player.attackFreezeDuration || 0, 600);
                player.glacialStacks = (player.glacialStacks || 0) + 1;
            }
        }
    }
];

// ── Secret relic definition ───────────────────────────────────
/**
 * "It's So Cold It Burns" — secret combo relic.
 * Requires: fracture_lens (normal) + cryo_shard (normal) + voltfire_matrix (fused).
 * Only available after wave 10. Max 1.
 * Activatable button relic: one-shots all regular enemies for 5 waves,
 * or deals 25% of boss max HP instantly.
 */
const SECRET_RELIC = {
    id: 'cold_burns',
    name: "It's So Cold It Burns",
    icon: '🌈',
    description:
        'ACTIVATE to one-shot all enemies for 5 waves. Against bosses, ' +
        'instantly strips 25% of their maximum HP. Born from the fusion of ' +
        'Fracture Lens, Cryo Shard, and Voltfire Matrix. Max 1.',
    color: 0xffffff,
    glowColor: '#ffffff',
    isFused: false,
    isSecret: true,
    maxStack: 1,
    charges: 1,
    effect(player, weapon, scene) {
        // No passive effect — activated manually via HUD button
    }
};

/**
 * Secret recipe — checks normal relics AND fused relics.
 * Available only after wave 10.
 */
const secretRecipe = {
    requiresNormal: ['fracture_lens', 'cryo_shard'],
    requiresFused:  ['voltfire_matrix'],
    result: SECRET_RELIC,
    minWave: 10
};

/**
 * Returns the secret recipe if the player owns all ingredients and
 * is past wave 10, and doesn't already have the relic.
 * @param {object[]} playerRelics
 * @param {object[]} playerFusedRelics
 * @param {number}   waveIndex
 * @returns {object|null}
 */
function checkSecretFusionAvailable(playerRelics, playerFusedRelics, waveIndex) {
    if (waveIndex < secretRecipe.minWave) return null;

    // Already owns one — no stacking
    const alreadyHas = [...playerRelics, ...playerFusedRelics].some(r => r.id === 'cold_burns');
    if (alreadyHas) return null;

    // Also skip if already in player's secretRelics (handled outside)
    const normalIds  = playerRelics.map(r => r.id);
    const fusedIds   = playerFusedRelics.map(r => r.id);

    const hasNormal = secretRecipe.requiresNormal.every(id => normalIds.includes(id));
    const hasFused  = secretRecipe.requiresFused.every(id => fusedIds.includes(id));

    return (hasNormal && hasFused) ? secretRecipe : null;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Returns a fresh (cloned) random relic from the base pool.
 * `waveIndex` is available for future wave-gating.
 * @param {number} waveIndex
 * @returns {object} relic clone
 */
function getRandomRelicForWave(waveIndex) {
    const idx = Phaser.Math.Between(0, relicPool.length - 1);
    return { ...relicPool[idx] };
}

/**
 * After a relic is accepted, check every fusion recipe to see
 * if the player now owns all required components.
 *
 * @param {object[]} playerRelics  – scene.player.relics array
 * @returns {object|null}  the matching recipe, or null
 */
function checkFusionAvailable(playerRelics) {
    const ownedIds = playerRelics.map(r => r.id);

    for (const recipe of fusionRecipes) {
        const canFuse = recipe.requires.every(reqId =>
            ownedIds.includes(reqId)
        );
        if (canFuse) return recipe;
    }
    return null;
}

/**
 * Flushes all player combat and weapon attributes back to baseline definitions, 
 * then loops through remaining inventory elements to rebuild calculations precisely.
 * Ensures dropping or consumption removes effects instantly.
 *
 * @param {Phaser.Scene} scene - Context reference to active game layout
 */
function recalculatePlayerStats(scene) {
    if (!scene || !scene.player) return;

    const player = scene.player;

    // 1. Flush back to baseline metrics (keeps persistent Wave Level Up choices)
    player.reloadModifier = player.baseReloadModifier || 1;
    scene.currentWeapon.range = scene.baseWeaponRange || 150;
    player.maxHp = player.baseMaxHp || 5;
    player.bonusDamage = 0;
    player.hasDot = false;
    player.dotStacks = 0;
    player.moveSpeedMultiplier = 1;
    player.hasCryo = false;
    player.cryoStacks = 0;

    // 2. Iterate through base relics remaining in inventory
    player.relics.forEach(relic => {
        relic.effect(player, scene.currentWeapon, scene);
    });

    // 3. Iterate through fused relics remaining in inventory
    player.fusedRelics.forEach(fused => {
        fused.effect(player, scene.currentWeapon, scene);
    });

    // 3b. Iterate through secret relics (no passive effect, but keeps array consistent)
    if (player.secretRelics) {
        player.secretRelics.forEach(sr => {
            sr.effect(player, scene.currentWeapon, scene);
        });
    }

    // 4. Force clamp present health underneath max limitations
    player.hp = Math.min(player.hp, player.maxHp);

    // 5. Update active interface visuals
    if (scene.updateAegisVisual) scene.updateAegisVisual();
    if (typeof updateHeartsDisplay === 'function') {
        updateHeartsDisplay(player.hp, player.maxHp);
    }
}