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
            player.hp  += 1;
            player.shieldCharges += 1;
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
            player.hp = Math.min(player.maxHp, player.hp + 1);
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
            // Tracked on the player; hit detection reads player.bonusDamage
            player.bonusDamage = Math.min((player.bonusDamage || 0) + 1, 2);
        }
    }
];

// ── Fused relic definitions ───────────────────────────────────
/**
 * Each entry describes one fusion recipe.
 *  requires  – the exact relic IDs that must both be in inventory
 *  result    – the fused relic object granted to the player
 */
const fusionRecipes = [
    {
        requires: ['overclock_core', 'plasma_extender'],
        result: {
            id: 'voltfire_matrix',
            name: 'Voltfire Matrix',
            icon: '🔴',
            description:
                'Fusion of speed and reach. Enemies that touch you are scorched, ' +
                'losing 1 HP every 2 seconds for 6 seconds. Max 2 of this relic.',
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
                // Grant 4 shield charges and trigger the visual ring
                player.shieldCharges = (player.shieldCharges || 0) + 4;
                if (scene && scene.updateAegisVisual) scene.updateAegisVisual();
            }
        }
    }
];

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
