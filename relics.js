// Relic System Configuration
const relicConfigs = {
    // Different relic types with their properties
    FIRE_RELIC: {
        id: 'fireRelic',
        name: 'FIRE RELIC',
        color: 0xff6600,
        glowColor: '#ff6600',
        description: 'Slash range increases by 10%',
        effect: (player, weapon) => {
            weapon.range *= 1.1;
        },
        icon: '🔥'
    },
    
    SHIELD_RELIC: {
        id: 'shieldRelic',
        name: 'SHIELD RELIC',
        color: 0x0099ff,
        glowColor: '#0099ff',
        description: 'Grants 2 protective hits',
        effect: (player) => {
            player.shieldCharges = (player.shieldCharges || 0) + 2;
        },
        icon: '🛡️'
    },
    
    SPEED_RELIC: {
        id: 'speedRelic',
        name: 'SPEED RELIC',
        color: 0x00ff99,
        glowColor: '#00ff99',
        description: 'Attack reload reduced by 25%',
        effect: (player) => {
            player.reloadModifier *= 0.95;
        },
        icon: '⚡'
    },
    
    LIFE_RELIC: {
        id: 'lifeRelic',
        name: 'LIFE RELIC',
        color: 0xff00ff,
        glowColor: '#ff00ff',
        description: 'Maximum HP increased by 2',
        effect: (player) => {
            player.maxHp += 2;
            player.hp = player.maxHp;
        },
        icon: '❤️'
    },
    
    REGENERATION_RELIC: {
    id: 'regenRelic',
    name: 'REGENERATION RELIC',
    color: 0x99ff00,
    glowColor: '#99ff00',
    description: 'Slowly restores 1 HP every 5 seconds (up to 50% HP)',
    effect: (player, weapon, scene) => {
        if (!player.regenActive) {
            player.regenActive = true;
            scene.time.addEvent({
                delay: 5000,
                callback: () => {
                    // Calculate the 50% threshold
                    const halfHealth = player.maxHp * 0.5;

                    // Only heal if player is alive and below the 50% threshold
                    if (player.hp > 0 && player.hp < halfHealth) {
                        player.hp++;
                        
                        // Ensure we don't accidentally overshoot 50% if healing increments change
                        if (player.hp > halfHealth) player.hp = halfHealth;

                        const healthPct = (player.hp / player.maxHp) * 100;
                        document.getElementById('health-fill').style.width = healthPct + "%";
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
        glowColor: '#ff0099',
        description: 'Slash width increased by 50%',
        effect: (player, weapon) => {
            weapon.width *= 1.5;
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
