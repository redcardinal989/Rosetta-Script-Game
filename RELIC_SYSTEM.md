# Relic System Documentation

## Overview
The relic system has been integrated into Rosetta Script, allowing players to collect powerful relics that drop from defeated enemies.

## How Relics Work

### Dropping Relics
- **Drop Chance**: 22% (approximately 1 in 5 enemies)
- **Wave-Specific Drops**: Different waves drop different relics
  - **Wave 1**: Fire Relic, Speed Relic, Damage Relic
  - **Wave 2**: Shield Relic, Speed Relic, Fire Relic
  - **Wave 3**: Life Relic, Regeneration Relic, Shield Relic
  - **Wave 4**: Damage Relic, Life Relic, Regeneration Relic

### Picking Up Relics
- Relics automatically appear as glowing orbs when enemies are defeated
- Walk over a relic to automatically pick it up
- The relic's effect is applied immediately

### Viewing Collected Relics
- Collected relics appear in the **RELICS** section of the HUD (top-left corner)
- Each relic shows a unique icon and glows with its color
- Hover over a relic in the HUD to see its name and effect description

### Relic Notification
- When you pick up a relic, a notification appears in the center of the screen showing the relic icon and name
- The notification auto-dismisses after 2 seconds

## Available Relics

### 🔥 Fire Relic
- **Color**: Gold/Orange
- **Effect**: Increases slash range by 10%
- **Type**: Offensive boost

### 🛡️ Shield Relic
- **Color**: Cyan/Light Blue
- **Effect**: Grants 2 protective hits (can absorb damage)
- **Type**: Defensive boost

### ⚡ Speed Relic
- **Color**: Green
- **Effect**: Reduces attack reload time by 5%
- **Type**: Offensive boost

### ❤️ Life Relic
- **Color**: Magenta/Pink
- **Effect**: Increases maximum HP by 2 (also heals 50%)
- **Type**: Health boost

### 🌿 Regeneration Relic
- **Color**: Lime Green
- **Effect**: Restores 1 HP every 5 seconds (outside of combat)
- **Type**: Sustain boost

### ⚔️ Damage Relic
- **Color**: Hot Pink
- **Effect**: Increases slash width by 50% (wider attack arc)
- **Type**: Offensive boost

## Rarity & Balance
- **Rarity**: ~22% drop chance makes relics feel rewarding without being too common
- **Stackable**: Multiple relics of the same type can be collected (their effects stack)
- **Visibility**: All collected relics are displayed in the HUD for easy reference
- **Wave Progression**: Each wave has its own pool of relics, encouraging engagement throughout the game

## Files Modified/Added
- `relics.js` - New file with relic configuration and drop mechanics
- `script.js` - Updated with relic spawning, pickup, and display logic
- `index.html` - Added relic display UI and notification elements
- `style.css` - Added styling for relic UI elements

## Technical Implementation
- Relics are physics-enabled entities that detect player collision
- Relic effects are tied to the player object and weapon configuration
- Relic data is stored in the player's `relics` array for persistence across waves
- Notifications use Phaser's tween system for smooth animations
