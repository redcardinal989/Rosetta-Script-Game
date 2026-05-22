// Relic System Configuration
const relicConfigs = {
    FIRE_RELIC: {
        id: 'fireRelic',
        name: 'FIRE RELIC',
        color: 0xff6600,
        description: 'Slash range increases by 8% (Diminishing)',
        effect: (player, weapon) => {
            // Use a multiplier that feels good but doesn't go infinite
            weapon.range *= 1.08; 
        },
        icon: '🔥'
    },
    
    SHIELD_RELIC: {
        id: 'shieldRelic',
        name: 'SHIELD RELIC',
        color: 0x0099ff,
        description: 'Grants 1 protective charge (Max 3)',
        effect: (player) => {
            // Cap the shields so the player isn't immortal
            const MAX_SHIELDS = 3;
            player.shieldCharges = Math.min((player.shieldCharges || 0) + 1, MAX_SHIELDS);
        },
        icon: '🛡️'
    },
    
    SPEED_RELIC: {
        id: 'speedRelic',
        name: 'SPEED RELIC',
        color: 0x00ff99,
        description: 'Attack speed increased by 10%',
        effect: (player) => {
            // CAP: Prevent reload from hitting 0 (which breaks the game)
            const MIN_RELOAD = 0.2; // 20% of original speed
            if (player.reloadModifier > MIN_RELOAD) {
                player.reloadModifier *= 0.90;
            }
        },
        icon: '⚡'
    },
    
    LIFE_RELIC: {
        id: 'lifeRelic',
        name: 'LIFE RELIC',
        color: 0xff00ff,
        description: 'Max HP +1 & Full Heal',
        effect: (player) => {
            player.maxHp += 1; // +2 was too much for a common drop
            player.hp = player.maxHp;
        },
        icon: '❤️'
    },
    
    REGENERATION_RELIC: {
        id: 'regenRelic',
        name: 'REGEN RELIC',
        color: 0x99ff00,
        description: 'Restores 1 HP every 8s (Up to 40% HP)',
        effect: (player, weapon, scene) => {
            // Instead of stacking logic, we just ensure it's running
            if (!player.regenActive) {
                player.regenActive = true;
                scene.time.addEvent({
                    delay: 8000, // Slower regen creates more tension
                    callback: () => {
                        const cap = player.maxHp * 0.4; 
                        if (player.hp > 0 && player.hp < cap) {
                            player.hp++;
                            // Trigger your UI update logic here
                        }
                    },
                    loop: true
                });
            }
        },
        icon: '🌿'
    },
    
    DAMAGE_RELIC: {
        id: 'damageRelic',
        name: 'DAMAGE RELIC',
        color: 0xff0099,
        description: 'Slash width +15%',
        effect: (player, weapon) => {
            // 50% was too big; 15% allows for growth without breaking hitboxes
            weapon.width *= 1.15;
        },
        icon: '⚔️'
    }
};

// Relic Drop Chance (1% chance per enemy kill)
const RELIC_DROP_CHANCE = 0.01;

// Function to get a random relic for the current wave
function getRandomRelicForWave(waveIndex) {
    const availableRelics = Object.values(relicConfigs);
    return availableRelics[Math.floor(Math.random() * availableRelics.length)];
}

// Function to determine if relic drops
function shouldDropRelic() {
    return Math.random() < RELIC_DROP_CHANCE;
}
// Default luck is 1.0. Some items could increase this to 1.2, 1.5, etc.
const RELIC_DROP_CHANCE = 0.01 * (player.luck || 1.0);