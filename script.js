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

    // After wave 5 enemies gain HP so we give the player breathing room:
    // speed is reduced by 18% and spawn rate is 30% slower (higher threshold = less frequent)
    const postScalingWave = index >= 5;
    const speedMultiplier = postScalingWave
        ? (1 + phase * 0.12) * 0.82   // 18% slower than it would otherwise be
        : (1 + phase * 0.12);
    const spawnThreshold = postScalingWave
        ? Math.min(96, Math.max(86, template.spawnThreshold - phase * 2 - (index % 4) + 4))  // harder to spawn
        : Math.max(82, template.spawnThreshold - phase * 2 - (index % 4));

    return {
        title: `WAVE ${index + 1}: ${template.title}`,
        targetKills: template.targetKills + phase * 2 + (index % 3),
        enemySpeed: Math.round(template.enemySpeed * speedMultiplier),
        spawnThreshold,
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
// Relic data & helpers are defined in relics.js (loaded before this file)
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Placeholder sounds - replace with your actual files
        this.load.audio('sword', 'https://labs.phaser.io/assets/audio/SoundEffects/squit.wav');
        this.load.audio('hit', 'hit.mp3');  // place hit.mp3 alongside index.html
        this.load.image('arena1', './assets/backgrounds/arena1.png');
        this.load.audio('downtime', 'downtime.mp3'); // place downtime.mp3 alongside index.html
        this.load.audio('fusion', 'fusion.mp3');     // fusion sting
        this.load.audio('freeze', 'freeze.mp3');     // secret relic activation
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
        this.player.relics = [];       // Track collected relics
        this.player.fusedRelics = [];  // Track fused relics (max 2 per type)
        this.player.secretRelics = []; // Track secret relics (e.g. "It's So Cold It Burns")
        this.player.hasDot = false;
        this.player.dotStacks = 0;
        // One-shot mode state (set by "It's So Cold It Burns")
        this._oneShotWavesLeft = 0;
        this.canFire = true;
        // Map of enemy -> { timer, ticksLeft } for DoT tracking
        this._dotEnemies = new Map();

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
        this.inputLocked = false; // true during grace/evolve screens — blocks clicks
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
            // Apply DoT if player owns a Voltfire Matrix
            if (this.player.hasDot && !this._dotEnemies.has(enemy)) {
                this.applyDotToEnemy(enemy);
            }
            // Only play hit sound + deal damage when NOT already invulnerable
            if (!this.player.invulnerable) {
                try { this.sound.play('hit', { volume: 0.7 }); } catch(e) {}
            }
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
        const speed = 200 * (this.player.moveSpeedMultiplier || 1);
        this.player.body.setVelocity(0);

        if (this.keys.A.isDown || this.cursors.left.isDown) this.player.body.setVelocityX(-speed);
        if (this.keys.D.isDown || this.cursors.right.isDown) this.player.body.setVelocityX(speed);
        if (this.keys.W.isDown || this.cursors.up.isDown) this.player.body.setVelocityY(-speed);
        if (this.keys.S.isDown || this.cursors.down.isDown) this.player.body.setVelocityY(speed);

        // Keep aegis ring centered on player
        if (this._aegisRing && this._aegisRing.active) {
            this._aegisRing.x = this.player.x;
            this._aegisRing.y = this.player.y;
        }

        // Enemy Spawning (Random chance per frame)
        if (!this.bossActive && !this.currentWave.bossWave && Phaser.Math.Between(0, 100) > this.currentWave.spawnThreshold) {
            this.spawnEnemy();
        }

        // Enemy AI: Follow Player (respect temporary modifier; skip frozen enemies)
        this.enemies.getChildren().forEach(enemy => {
            if (enemy._frozen) {
                if (enemy.body) enemy.body.setVelocity(0);
                return;
            }
            const speed = this.currentWave.enemySpeed * (this.enemySpeedModifier || 1);
            this.physics.moveToObject(enemy, this.player, speed);
        });
    }

    handleAttack(pointer) {
        if (this.inputLocked) return;  // grace / evolve screens are open
        if (!this.canFire) return;
        this.canFire = false;

        // Sound effect
        this.sound.play('sword', { volume: 0.5 });

        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        
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
                if (this.player.hasCryo && !enemy._frozen) {
                    this.applyCryoToEnemy(enemy);
                }

                // Flash white on hit
                if (enemy.hp > 0) {
                    const prevFill = enemy.fillColor;
                    enemy.setFillStyle(0xffffff);
                    this.time.delayedCall(80, () => { if (enemy.active) enemy.setFillStyle(prevFill); });
                    return; // still alive
                }

                // Enemy dies
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

        // Fade Slash — quick fade so stacked arcs don't linger
        this.tweens.add({ targets: arc, alpha: 0, duration: 120, onComplete: () => arc.destroy() });

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

        // Immediately destroy so overlap doesn't re-fire
        relicSprite.destroy();

        if (this.player.relics.length >= 10) return;

        // Pause the scene and show the accept/decline modal BEFORE applying any effect
        pausedScene = this;
        this.scene.pause();
        this.showRelicModal(relic);
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
        try { this.sound.play('freeze', { volume: 0.9 }); } catch(e) {}

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

        // Visual: turn enemy icy blue and stop movement
        const origColor = enemy.fillColor;
        if (enemy.setFillStyle) enemy.setFillStyle(0x88eeff);
        if (enemy.body) {
            enemy.body.setVelocity(0);
            // Store velocity override so moveToObject is blocked in update
            enemy._frozenUntil = Date.now() + freezeDuration;
        }

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

        // Thaw after freeze duration
        this.time.delayedCall(freezeDuration, () => {
            if (enemy && enemy.active) {
                enemy._frozen = false;
                enemy._frozenUntil = 0;
                if (enemy.setFillStyle) enemy.setFillStyle(origColor);
            }
        });
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
                    enemy.destroy();
                    score++;
                    this.waveKills++;
                    document.getElementById('killCount').innerText = score;
                    document.getElementById('waveProgress').innerText =
                        this.waveKills + ' / ' + this.currentWave.targetKills;
                    if (this.waveKills >= this.currentWave.targetKills) this.advanceWave();
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
        document.getElementById('modal-icon').innerText = relic.icon;
        document.getElementById('modal-title').innerText = 'RELIC FOUND';
        document.getElementById('modal-description').innerText = relic.description;
        // Store pending relic for accept/decline
        modal._pendingRelic = relic;
        modal.classList.remove('hidden');
    }

    takeDamage() {
        if (this.player.invulnerable) return;

        if (this.player.shieldCharges > 0) {
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

        // Play downtime music during grace period
        try {
            if (this.downtimeMusic) { this.downtimeMusic.stop(); this.downtimeMusic.destroy(); }
            this.downtimeMusic = this.sound.add('downtime', { loop: true, volume: 0.5 });
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
        this.inputLocked = true;
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

function playFusionSound() {
    try {
        const scene = phaserGame && phaserGame.scene.scenes[0];
        if (scene && scene.sound) scene.sound.play('fusion', { volume: 0.8 });
    } catch(e) {}
}

function activateSecretRelicBtn() {
    const scene = phaserGame && phaserGame.scene.scenes[0];
    if (scene && scene.activateSecretRelic) scene.activateSecretRelic();
}

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
    }

    document.getElementById('levelUpScreen').classList.add('hidden');
    scene.inputLocked = false;
    scene.updateWaveUI();
    // Reset positions and temporarily slow enemies so player can react
    if (scene.resetAfterUpgrade) scene.resetAfterUpgrade();
    scene.scene.resume();
    if (scene.currentWave.bossWave) {
        scene.startBossWave();
    }
}

function acceptRelic() {
    const modal = document.getElementById('relic-modal');
    const relic = modal._pendingRelic;
    modal._pendingRelic = null;
    modal.classList.add('hidden');

    if (relic && pausedScene) {
        const scene = pausedScene;

        // Enforce normal relic cap (10)
        if (scene.player.relics.length >= 10) {
            pausedScene.scene.resume();
            pausedScene = null;
            return;
        }

        // Enforce per-relic maxStack (e.g. Fracture Lens caps at 2)
        if (relic.maxStack) {
            const currentCount = scene.player.relics.filter(r => r.id === relic.id).length;
            if (currentCount >= relic.maxStack) {
                // Already at cap — just resume without adding
                pausedScene.inputLocked = false;
                pausedScene.scene.resume();
                pausedScene = null;
                return;
            }
        }

        // Apply effect and add to normal collection
        scene.player.relics.push(relic);
        relic.effect(scene.player, scene.currentWeapon, scene);
        scene.updateRelicsDisplay();
        updateHeartsDisplay(scene.player.hp, scene.player.maxHp);

        // NOTE: Fusion is only offered during the grace period between waves.
        // Grace screen fusion button handles it -- no mid-game prompt here.
    }

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.scene.resume();
        pausedScene = null;
    }
}

function declineRelic() {
    const modal = document.getElementById('relic-modal');
    modal._pendingRelic = null;
    modal.classList.add('hidden');

    if (pausedScene) {
        pausedScene.inputLocked = false;
        pausedScene.scene.resume();
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
function showFusionModal(recipe, scene) {
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

    // Store recipe on modal for accept/decline
    document.getElementById('fusion-modal')._pendingRecipe = recipe;
    document.getElementById('fusion-modal').classList.remove('hidden');
    playFusionSound();
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
            // Remove one copy of each ingredient relic -- their effects are consumed by fusion
            recipe.requires.forEach(reqId => {
                const idx = scene.player.relics.findIndex(r => r.id === reqId);
                if (idx !== -1) scene.player.relics.splice(idx, 1);
            });
            // Add fused relic, recalculate all stats from scratch, then apply new effect
            const fusedRelic = { ...recipe.result };
            scene.player.fusedRelics.push(fusedRelic);
            recalculatePlayerStats(scene);
            fusedRelic.effect(scene.player, scene.currentWeapon, scene);
            scene.updateRelicsDisplay();
            updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            const btn = document.getElementById('grace-fusion-btn');
            if (btn) { btn.classList.add('hidden'); btn._recipe = null; }
        }
        return;
    }

    // Fallback mid-game fusion (safety path -- normally only grace screen triggers fusion)
    if (recipe && pausedScene) {
        const scene = pausedScene;
        recipe.requires.forEach(reqId => {
            const idx = scene.player.relics.findIndex(r => r.id === reqId);
            if (idx !== -1) scene.player.relics.splice(idx, 1);
        });
        const fusedRelic = { ...recipe.result };
        scene.player.fusedRelics.push(fusedRelic);
        recalculatePlayerStats(scene);
        fusedRelic.effect(scene.player, scene.currentWeapon, scene);
        scene.updateRelicsDisplay();
        updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
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

    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    const allRelics = [...relics, ...fusedRelics, ...secretRelics];

    if (allRelics.length === 0) {
        grid.innerHTML = '<div class="inv-empty">No relics collected yet.<br>Defeat enemies to find them!</div>';
    } else {
        // Section header for normal relics
        if (relics.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;color:#aaa;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;';
            header.innerText = `Normal Relics (${relics.length}/10)`;
            grid.appendChild(header);
            relics.forEach(relic => grid.appendChild(makeRelicCard(relic, false)));
        }

        // Section header for fused relics
        if (fusedRelics.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = 'grid-column:1/-1;color:#ff6666;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:8px 0 2px;';
            header.innerText = `⚗️ Fused Relics (${fusedRelics.length}/2)`;
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

    // Show fusion button if a recipe is available and not yet at stack cap
    const fusionBtn = document.getElementById('grace-fusion-btn');
    if (fusionBtn) {
        const recipe = checkFusionAvailable(player.relics);
        const canFuse = recipe && (player.fusedRelics.filter(r => r.id === recipe.result.id).length < (recipe.result.maxStack || 2));
        if (canFuse) {
            fusionBtn.classList.remove('hidden');
            fusionBtn._recipe = recipe;
        } else {
            fusionBtn.classList.add('hidden');
            fusionBtn._recipe = null;
        }
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
    document.getElementById('fusion-modal')._pendingRecipe = recipe;
    document.getElementById('fusion-modal').classList.remove('hidden');
    playFusionSound();
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
            // Consume ingredients: remove one of each normal ingredient
            recipe.requiresNormal.forEach(reqId => {
                const idx = scene.player.relics.findIndex(r => r.id === reqId);
                if (idx !== -1) scene.player.relics.splice(idx, 1);
            });
            // Remove one of each fused ingredient
            recipe.requiresFused.forEach(reqId => {
                const idx = scene.player.fusedRelics.findIndex(r => r.id === reqId);
                if (idx !== -1) scene.player.fusedRelics.splice(idx, 1);
            });
            // Grant the secret relic
            const newSR = { ...recipe.result, charges: 1 };
            scene.player.secretRelics = scene.player.secretRelics || [];
            scene.player.secretRelics.push(newSR);
            recalculatePlayerStats(scene);
            scene.updateRelicsDisplay();
            updateHeartsDisplay(scene.player.hp, scene.player.maxHp);
            updateSecretRelicHUD();

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

    // Stop downtime music — combat is about to resume
    if (scene.stopDowntimeMusic) scene.stopDowntimeMusic();

    // Every 4th completed wave (waveIndex is already incremented), show a downside card
    // Skip for the boss wave -- it goes straight to evolve then boss fight
    if (scene.waveIndex > 0 && scene.waveIndex % 4 === 0 && !scene.currentWave.bossWave) {
        showDownsideScreen(scene);
        return; // showDownsideScreen will now safely chain into showEvolveScreen when completed
    }

    // Show evolve/power-up screen normally for non-corrupted waves
    scene.showEvolveScreen();
}