let phaserGame;
let score = 0;
let pausedScene = null; // Track paused scene for relic modal

const waveTemplateBase = [
    {
        title: 'DATA SWARM',
        targetKills: 6,
        enemySpeed: 120,
        spawnThreshold: 97,
        enemyColor: 0xff0033,
        description: 'A fast, hungry swarm of corrupted packets.',
        powerOptions: [
            { id: 'heal', label: 'REPAIR (Full Heal)', detail: 'Restore maximum HP' },
            { id: 'speed', label: 'ADRENALINE (-20% reload)', detail: 'Attack faster' },
            { id: 'range', label: 'SHOCKWAVE (+range)', detail: 'Slash reaches farther' }
        ]
    },
    {
        title: 'FIREWALL RUSH',
        targetKills: 8,
        enemySpeed: 160,
        spawnThreshold: 95,
        enemyColor: 0xff9933,
        description: 'Stronger defenders close in with greater fury.',
        powerOptions: [
            { id: 'heal', label: 'REPAIR (Full Heal)', detail: 'Restore maximum HP' },
            { id: 'speed', label: 'OVERCLOCK (-25% reload)', detail: 'Your strikes land quicker' },
            { id: 'shield', label: 'PHASE SHIELD (+1 hit)', detail: 'Absorb the next hit' }
        ]
    },
    {
        title: 'VIRUS HIVE',
        targetKills: 10,
        enemySpeed: 180,
        spawnThreshold: 94,
        enemyColor: 0x33ccff,
        description: 'The hive mutates. Evade and strike precisely.',
        powerOptions: [
            { id: 'speed', label: 'ADRENALINE (-30% reload)', detail: 'Attack even faster' },
            { id: 'range', label: 'ARC LASER (+range)', detail: 'Widen your strike arc' },
            { id: 'shield', label: 'RESONANCE SHIELD (+2 hits)', detail: 'Withstand more damage' }
        ]
    },
    {
        title: 'SYSTEM CORE',
        targetKills: 12,
        enemySpeed: 210,
        spawnThreshold: 93,
        enemyColor: 0xff00ff,
        description: 'Final core defenders spawn relentlessly.',
        powerOptions: [
            { id: 'heal', label: 'REPAIR (Full Heal)', detail: 'Restore maximum HP' },
            { id: 'speed', label: 'NANO-FLOW (-35% reload)', detail: 'Lightning-fast slashes' },
            { id: 'range', label: 'DISRUPTOR (+range)', detail: 'Expand your attack reach' }
        ]
    }
];

function createWaveConfig(index) {
    const template = waveTemplateBase[index % waveTemplateBase.length];
    const phase = Math.floor(index / waveTemplateBase.length);
    const mixedWave = ((index + 1) % 5 === 0);

    return {
        title: `WAVE ${index + 1}: ${template.title}`,
        targetKills: template.targetKills + phase * 2 + (index % 3),
        enemySpeed: Math.round(template.enemySpeed * (1 + phase * 0.12)),
        spawnThreshold: Math.max(82, template.spawnThreshold - phase * 2 - (index % 4)),
        enemyColor: template.enemyColor,
        enemyTypes: mixedWave ? [0xff0033, 0xff9933, 0x33ccff, 0xff00ff] : [template.enemyColor],
        description: template.description,
        powerOptions: template.powerOptions,
        bossWave: false
    };
}

function generateWaveConfigs() {
    const waves = [];
    for (let i = 0; i < 24; i++) {
        waves.push(createWaveConfig(i));
    }
    waves.push({
        title: 'WAVE 25: CORE OVERLOAD',
        targetKills: 0,
        enemySpeed: 0,
        spawnThreshold: 0,
        enemyColor: 0xff0000,
        enemyTypes: [0xff0000],
        description: 'The system core has awakened. Dodge its projectiles and defeat the boss.',
        powerOptions: [
            { id: 'heal', label: 'REPAIR (Full Heal)', detail: 'Restore maximum HP' },
            { id: 'speed', label: 'ADRENALINE (-20% reload)', detail: 'Attack faster' },
            { id: 'range', label: 'SHOCKWAVE (+range)', detail: 'Slash reaches farther' }
        ],
        bossWave: true,
        bossMaxHp: 70,
        bossColor: 0xff0000
    });
    return waves;
}

const waveConfigs = generateWaveConfigs();
// --- MISSING RELIC LOGIC & DATA STRUCTURES ---

/**
 * Determines if an enemy drops a relic on death.
 * @returns {boolean} 20% drop rate
 */
function shouldDropRelic() {
    return Math.random() < 0.20; 
}

/**
 * Repository of relic blueprints with their scaling, visual themes, and stat modifiers.
 */
const relicPool = [
    {
        name: 'Overclock Core',
        icon: '⚡',
        description: 'Permanent +15% attack speed.',
        color: 0xffd700,
        glowColor: '#ffd700',
        effect: (player, weapon, scene) => {
            player.reloadModifier *= 0.85;
        }
    },
    {
        name: 'Titanium Shell',
        icon: '🛡️',
        description: 'Increases Maximum HP by 1 and grants a shield charge.',
        color: 0x888888,
        glowColor: '#888888',
        effect: (player, weapon, scene) => {
            player.maxHp += 1;
            player.hp += 1; // Heal for the newly added point
            player.shieldCharges += 1;
        }
    },
    {
        name: 'Plasma Extender',
        icon: '📏',
        description: 'Extends attack weapon reach by +25 units.',
        color: 0x00ffff,
        glowColor: '#00ffff',
        effect: (player, weapon, scene) => {
            weapon.range += 25;
        }
    },
    {
        name: 'Siphon Circuit',
        icon: '🧪',
        description: 'Heals 1 HP point instantly upon pickup.',
        color: 0x33cc33,
        glowColor: '#33cc33',
        effect: (player, weapon, scene) => {
            player.hp = Math.min(player.maxHp, player.hp + 1);
        }
    }
];

/**
 * Fetches a random relic. You can scale pool choices by wave index here if desired.
 * @param {number} waveIndex 
 */
function getRandomRelicForWave(waveIndex) {
    const randomIndex = Phaser.Math.Between(0, relicPool.length - 1);
    // Return a deep copy clone so modifying instances doesn't mutate our base configuration pool
    return { ...relicPool[randomIndex] };
}
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Placeholder sounds - replace with your actual files
        this.load.audio('sword', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
        this.load.image('arena1', './assets/backgrounds/arena1.png');
    }

    create() {
        
       const { width, height } = this.scale;

    // Background
    this.arenaBg = this.add.image(width / 2, height / 2, 'arena1');
    this.arenaBg.setDisplaySize(width, height);
    this.arenaBg.setDepth(-10);

        
        // 1. Player Setup (The Green Dot)
        this.player = this.add.circle(width / 2, height / 2, 10, 0x00ff00);
        this.player.setStrokeStyle(2, 0xffffff);
        this.physics.add.existing(this.player);
        this.player.body.setCollideWorldBounds(true);
        
        // Player Stats
        this.player.hp = 5;
        this.player.maxHp = 5;
        this.player.invulnerable = false;
        this.player.reloadModifier = 1;
        this.player.shieldCharges = 0;
        this.player.relics = []; // Track collected relics
        this.canFire = true;

        // Initialize heart display
        setTimeout(() => updateHeartsDisplay(this.player.hp, this.player.maxHp), 100);

        // 2. Enemy Group
        this.enemies = this.physics.add.group();

        // 3. Relics Group
        this.relics = this.physics.add.group();

        // 4. Inputs
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');

        // 5. Weapon Config
        this.currentWeapon = { range: 150, width: 1.2, reload: 400 };

        // Enemy speed modifier (used to temporarily slow enemies after upgrades)
        this.enemySpeedModifier = 1;
        this.bossActive = false;
        this.boss = null;
        this.bossWarningBar = null;
        this.bossAttackTimer = null;
        this.bossProjectiles = this.physics.add.group();
        this.physics.add.overlap(this.player, this.bossProjectiles, (p, bullet) => {
            bullet.destroy();
            this.takeDamage();
        });

        // 6. Wave System
        this.waveIndex = 0;
        this.currentWave = waveConfigs[this.waveIndex];
        this.waveKills = 0;
        this.updateWaveUI();

        // 7. Interaction
        this.input.on('pointerdown', (pointer) => this.handleAttack(pointer));

        // 8. Collision: Enemy hits Player
        this.physics.add.overlap(this.player, this.enemies, (p, enemy) => {
            this.takeDamage();
        });

        // 9. Collision: Relic hits Player
        this.physics.add.overlap(this.player, this.relics, (p, relic) => {
            this.pickupRelic(relic);
        });
        
    }

    update() {
        if (!this.player || this.player.hp <= 0) return;

        // Movement Logic
        const speed = 200;
        this.player.body.setVelocity(0);

        if (this.keys.A.isDown || this.cursors.left.isDown) this.player.body.setVelocityX(-speed);
        if (this.keys.D.isDown || this.cursors.right.isDown) this.player.body.setVelocityX(speed);
        if (this.keys.W.isDown || this.cursors.up.isDown) this.player.body.setVelocityY(-speed);
        if (this.keys.S.isDown || this.cursors.down.isDown) this.player.body.setVelocityY(speed);

        // Enemy Spawning (Random chance per frame)
        if (!this.bossActive && !this.currentWave.bossWave && Phaser.Math.Between(0, 100) > this.currentWave.spawnThreshold) {
            this.spawnEnemy();
        }

        // Enemy AI: Follow Player (respect temporary modifier)
        this.enemies.getChildren().forEach(enemy => {
            const speed = this.currentWave.enemySpeed * (this.enemySpeedModifier || 1);
            this.physics.moveToObject(enemy, this.player, speed);
        });
    }

    handleAttack(pointer) {
        if (!this.canFire) return;
        this.canFire = false;

        // Sound effect
        this.sound.play('sword', { volume: 0.5 });

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        
        // Slash Visual
        const arc = this.add.graphics();
        arc.fillStyle(0x00ffff, 0.3);
        arc.slice(this.player.x, this.player.y, this.currentWeapon.range, angle - this.currentWeapon.width/2, angle + this.currentWeapon.width/2);
        arc.fillPath();

        // Hit Detection
        this.enemies.getChildren().forEach(enemy => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            let diff = Math.abs(Phaser.Math.Angle.Wrap(angle - angleToEnemy));

            if (dist < this.currentWeapon.range && diff < this.currentWeapon.width / 2) {
                // Check if relic should drop
                if (shouldDropRelic()) {
                    this.spawnRelic(enemy.x, enemy.y);
                }

                enemy.destroy();
                score++;
                this.waveKills++;
                document.getElementById('killCount').innerText = score;
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
                this.damageBoss(6);
            }
        }

        // Fade Slash
        this.tweens.add({ targets: arc, alpha: 0, duration: 200, onComplete: () => arc.destroy() });

        // Cooldown
        this.time.delayedCall(this.currentWeapon.reload * this.player.reloadModifier, () => {
            this.canFire = true;
        });
    }

    spawnEnemy() {
        const spawnAngle = Math.random() * Math.PI * 2;
        const x = this.player.x + Math.cos(spawnAngle) * 400;
        const y = this.player.y + Math.sin(spawnAngle) * 400;
        
        const enemyColor = this.currentWave.enemyTypes && this.currentWave.enemyTypes.length
            ? Phaser.Math.RND.pick(this.currentWave.enemyTypes)
            : this.currentWave.enemyColor;
        const enemy = this.add.circle(x, y, 8, enemyColor);
        this.enemies.add(enemy);
        this.physics.add.existing(enemy);
    }

    spawnRelic(x, y) {
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

    pickupRelic(relicSprite) {
        const relic = relicSprite.relicData;

        if (this.player.relics.length >= 10) {
            relicSprite.destroy();
            return;
        }
        
        // Add to player's relic collection
        this.player.relics.push(relic);
        
        // Apply relic effect
        relic.effect(this.player, this.currentWeapon, this);
        
        // Pause the scene and show modal
        pausedScene = this;
        this.scene.pause();
        this.showRelicModal(relic);
        
        // Update HUD
        this.updateRelicsDisplay();
        
        // Update health display if MaxHp changed
        updateHeartsDisplay(this.player.hp, this.player.maxHp);
        
        // Remove relic from world
        relicSprite.destroy();
    }

    // Reset enemies and player after picking an upgrade so they can react easier
    resetAfterUpgrade() {
        // Clear existing enemies
        try { this.enemies.clear(true, true); } catch (e) { /* ignore if not present */ }

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
    }

    updateRelicsDisplay() {
        const relicsContainer = document.getElementById('relics-container');
        if (relicsContainer) relicsContainer.innerHTML = '';
        
        // Update count badge on HUD button
        const countEl = document.getElementById('relic-count');
        if (countEl) countEl.innerText = this.player.relics.length;
    }

    damageBoss(amount) {
        if (!this.bossActive || !this.boss) return;

        this.boss.hp -= amount;
        this.updateBossHealthUI();

        if (this.boss.hp <= 0) {
            this.boss.destroy();
            this.bossActive = false;

            if (this.bossAttackTimer) {
                this.bossAttackTimer.remove(false);
            }

            this.bossProjectiles.clear(true, true);
            if (this.bossWarningBar) {
                this.bossWarningBar.destroy();
                this.bossWarningBar = null;
            }

            this.showVictory();
        }
    }

    startBossWave() {
        if (!this.currentWave.bossWave || this.bossActive) return;

        this.bossActive = true;
        this.enemies.clear(true, true);
        this.relics.clear(true, true);

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
        const icon = document.getElementById('modal-icon');
        const description = document.getElementById('modal-description');
        
        icon.innerText = relic.icon;
        description.innerText = `${relic.description}\n\nCollected!`;
        
        modal.classList.remove('hidden');
    }

    takeDamage() {
        if (this.player.invulnerable) return;

        if (this.player.shieldCharges > 0) {
            this.player.shieldCharges--;
            return;
        }
        
        this.player.hp--;
        this.player.invulnerable = true;
        
        // Update heart display
        updateHeartsDisplay(this.player.hp, this.player.maxHp);

        // Red Flash Effect
        this.tweens.add({
            targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: 3,
            onComplete: () => { this.player.invulnerable = false; this.player.alpha = 1; }
        });

        if (this.player.hp <= 0) {
            alert("DEFEATED. KILLS: " + score);
            location.reload();
        }
    }

    advanceWave() {
        this.waveIndex++;
        if (this.waveIndex >= waveConfigs.length) {
            this.showVictory();
            return;
        }

        this.currentWave = waveConfigs[this.waveIndex];
        this.waveKills = 0;
        this.updateWaveUI();

        // Show grace period screen before evolve
        this.scene.pause();
        showGracePeriod(this);
    }

    updateWaveUI() {
        document.getElementById('killCount').innerText = score;
        document.getElementById('waveNumber').innerText = this.currentWave.title;
        document.getElementById('waveProgress').innerText = this.currentWave.bossWave ? 'BOSS FIGHT' : `${this.waveKills} / ${this.currentWave.targetKills}`;
        document.getElementById('waveHint').innerText = this.currentWave.description;
        document.getElementById('bossHealthLabel').classList.toggle('hidden', !this.currentWave.bossWave);
        document.getElementById('boss-health-container').classList.toggle('hidden', !this.currentWave.bossWave);

        if (this.currentWave.bossWave && !this.boss) {
            document.getElementById('boss-health-fill').style.width = '100%';
        }
    }

    showEvolveScreen() {
        document.getElementById('levelUpTitle').innerText = 'EVOLVE FOR ' + this.currentWave.title;
        document.getElementById('evolveDescription').innerText = this.currentWave.description;

        const buttons = [
            document.getElementById('powerBtn1'),
            document.getElementById('powerBtn2'),
            document.getElementById('powerBtn3')
        ];

        this.currentWave.powerOptions.forEach((option, index) => {
            const button = buttons[index];
            button.textContent = option.label;
            button.dataset.power = option.id;
            button.title = option.detail;
            button.classList.remove('hidden');
        });

        document.getElementById('levelUpScreen').classList.remove('hidden');
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
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    backgroundColor: '#050505',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [GameScene]
};

// Bridge functions
function startGame() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    phaserGame = new Phaser.Game(config);
    // Hearts will be initialized after create() runs; set a small delay
    setTimeout(() => {
        const scene = phaserGame.scene.scenes[0];
        if (scene && scene.player) updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
    }, 500);
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
    }

    document.getElementById('levelUpScreen').classList.add('hidden');
    scene.updateWaveUI();
    // Reset positions and temporarily slow enemies so player can react
    if (scene.resetAfterUpgrade) scene.resetAfterUpgrade();
    scene.scene.resume();
    if (scene.currentWave.bossWave) {
        scene.startBossWave();
    }
}

function closeRelicModal() {
    const modal = document.getElementById('relic-modal');
    modal.classList.add('hidden');
    
    if (pausedScene) {
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
    const relics = scene && scene.player ? scene.player.relics : [];

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    if (!relics || relics.length === 0) {
        grid.innerHTML = '<div class="inv-empty">No relics collected yet.<br>Defeat enemies to find them!</div>';
    } else {
        relics.forEach(relic => {
            const card = document.createElement('div');
            card.className = 'inv-relic-card';
            card.title = 'Click for more info';
            const hex = '#' + (relic.color || relic.glowColor || 0x00ff99).toString(16).padStart(6, '0');
            const glowCol = relic.glowColor || hex;
            card.style.borderColor = glowCol;
            card.style.boxShadow = `0 0 8px ${glowCol}44`;
            card.innerHTML = `
                <span class="inv-relic-icon">${relic.icon || '?'}</span>
                <div class="inv-relic-name">${relic.name}</div>
                <div class="inv-relic-desc">${relic.description}</div>
            `;
            card.addEventListener('click', () => openRelicDetailModal(relic));
            grid.appendChild(card);
        });
    }

    document.getElementById('inventory-modal').classList.remove('hidden');
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
        <div class="grace-stat"><span class="grace-stat-label">RELICS</span><span class="grace-stat-value">${player.relics.length}</span></div>
        <div class="grace-stat"><span class="grace-stat-label">SHIELDS</span><span class="grace-stat-value">${player.shieldCharges || 0}</span></div>
    `;

    // Timer
    let timeLeft = 10;
    document.getElementById('grace-countdown').innerText = timeLeft;
    document.getElementById('grace-timer-fill').style.width = '100%';

    document.getElementById('graceScreen').classList.remove('hidden');

    // Animate timer bar shrinking
    // Use requestAnimationFrame for smooth bar
    const startTime = performance.now();
    const duration = 10000;

    function tick(now) {
        const elapsed = now - startTime;
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
}

function endGracePeriod() {
    if (_graceTimer) { cancelAnimationFrame(_graceTimer); _graceTimer = null; }
    document.getElementById('graceScreen').classList.add('hidden');
    closeInventoryModal();

    if (!_graceScene) return;
    const scene = _graceScene;
    _graceScene = null;

    // Show evolve/power-up screen
    scene.showEvolveScreen();
}
