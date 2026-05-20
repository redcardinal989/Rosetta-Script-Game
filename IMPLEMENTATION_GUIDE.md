# Relic System Implementation Guide

## What Was Added

### 1. **New File: relics.js**
   - Defines 6 different relic types with unique properties
   - Each relic has:
     - Unique ID, name, color, and icon
     - Description of what it does
     - Effect function that modifies player stats when acquired
   
   - **Relic Types**:
     - 🔥 Fire Relic: +40% range
     - 🛡️ Shield Relic: +2 shield charges
     - ⚡ Speed Relic: -25% reload time
     - ❤️ Life Relic: +2 max HP
     - 🌿 Regeneration Relic: +1 HP every 5 seconds
     - ⚔️ Damage Relic: +50% slash width

   - Wave-specific relic drops ensure variety across gameplay
   - 22% drop chance provides good balance

### 2. **Updated: script.js**
   - Added `this.relics` group for physics-based relic entities
   - Added `player.relics` array to track collected relics
   - Integrated relic spawning in `handleAttack()` method
   - Added collision detection for relic pickup
   - New methods:
     - `spawnRelic(x, y)`: Creates a relic at enemy death location
     - `pickupRelic(relicSprite)`: Handles relic collection and applies effects
     - `updateRelicsDisplay()`: Updates HUD to show collected relics
     - `showRelicNotification(relic)`: Shows pickup notification

### 3. **Updated: index.html**
   - Added relic display section in HUD
   - Added relic notification popup
   - Added reference to relics.js script

### 4. **Updated: style.css**
   - **Relic Display Styling**:
     - Circular glowing relic icons in HUD
     - Colored borders and shadows (wave-based colors)
     - Smooth hover scale effect
     - Tooltips showing relic name/effect on hover
   
   - **Notification Styling**:
     - Center-screen notification with smooth animation
     - Shows relic icon and acquisition message
     - Auto-dismisses after 2 seconds

## Game Features

### Relic Mechanics
- **Drop Trigger**: Random 22% chance per defeated enemy
- **Auto-Collection**: Walk over relic to collect (no click needed)
- **Stacking**: Multiple relics of same type can be collected
- **Persistence**: Relics carry over between waves
- **Varied Effects**: Each wave drops different relic pools

### User Feedback
- **Visual Feedback**: 
  - Pulsing animation on dropped relics
  - Colored glowing orbs per relic type
  - HUD icons show collected relics
  
- **Text Feedback**:
  - Notification popup with relic name
  - Tooltip descriptions on hover
  - Clear descriptions of effects

### Balance
- **Rarity**: 22% makes relics feel valuable but not rare
- **Power**: Each relic provides meaningful but not overpowered bonuses
- **Variety**: Wave-specific drops create unique playthroughs
- **Synergy**: Multiple relics stack for powerful combinations

## How to Use

1. **Play the game normally** - Defeat enemies to get kills
2. **Watch for relic drops** - When an enemy dies, a glowing orb might appear
3. **Walk over relics** - They automatically collect when you touch them
4. **See the effect** - Relic effect applies immediately and notification shows
5. **Track relics** - View all collected relics in top-left HUD with icons
6. **Hover for details** - Hover over relic icons to see what they do

## Technical Details

### File Structure
```
/rosetta-script-main/
├── index.html           (UI structure, relic display & notification)
├── script.js            (Game logic, relic pickup/effects)
├── style.css            (Styling for relics & notifications)
├── relics.js            (Relic definitions & drop mechanics)
└── RELIC_SYSTEM.md      (This documentation)
```

### Key Functions

#### relics.js
- `getRandomRelicForWave(waveIndex)`: Returns a random relic for current wave
- `shouldDropRelic()`: Determines if relic drops (22% chance)

#### script.js (GameScene class)
- `spawnRelic(x, y)`: Creates relic at location with animation
- `pickupRelic(relicSprite)`: Processes relic collection
- `updateRelicsDisplay()`: Updates HUD with collected relics
- `showRelicNotification(relic)`: Displays pickup message

### Collision System
- Relics are physics-enabled circles that detect player overlap
- Automatic collection on collision (no action required)
- Multiple relics can exist simultaneously

## Testing Checklist
- ✅ Relics drop randomly from enemies
- ✅ Different relics per wave
- ✅ Relic can be picked up by walking over
- ✅ Notification shows on pickup
- ✅ HUD displays collected relics
- ✅ Effects apply immediately
- ✅ Tooltips work on hover
- ✅ Relics persist across waves
- ✅ Multiple same-type relics stack effects
