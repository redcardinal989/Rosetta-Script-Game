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

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Placeholder sounds - replace with your actual files
        this.load.audio('sword', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
        this.load.image('arena1', 'assets/backgrounds/arena1.png');
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
        
        // Update health if MaxHp changed
        const healthPct = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('health-fill').style.width = healthPct + "%";
        
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
        relicsContainer.innerHTML = '';
        
        this.player.relics.forEach(relic => {
            const relicItem = document.createElement('div');
            relicItem.className = 'relic-item';
            relicItem.style.borderColor = relic.glowColor;
            relicItem.style.boxShadow = `0 0 10px ${relic.glowColor}`;
            
            relicItem.innerHTML = `
                ${relic.icon}
                <div class="relic-item-tooltip">${relic.name}: ${relic.description}</div>
            `;
            
            relicsContainer.appendChild(relicItem);
        });
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
        
        // Update HTML Health Bar
        const healthPct = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('health-fill').style.width = healthPct + "%";

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
        this.showEvolveScreen();
        this.scene.pause();
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
}

function applyPowerUp(type) {
    const scene = phaserGame.scene.scenes[0];

    if (type === 'restart') {
        location.reload();
        return;
    }

    if (type === 'heal') {
        scene.player.hp = scene.player.maxHp;
        document.getElementById('health-fill').style.width = '100%';
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