// src/config/constants.js
// All game-wide constants in one place

export const STATS = [
  'Strength',
  'Shinsu Control',
  'Shinsu Endurance',
  'Perception',
  'Willpower',
  'Technique',
  'Insight',
  'Authority'
];

export const POSITIONS = [
  'Guide',
  'Fisherman',
  'Spear Bearer',
  'Wave Controller',
  'Light Bearer',
  'Anima'
];

// Hit dice by position (used in combat math)
export const HIT_DICE = {
  'Fisherman': 12,
  'Wave Controller': 10,
  'Spear Bearer': 10,
  'Anima': 8,
  'Light Bearer': 8,
  'Guide': 6
};

// Equipment slot definitions
export const EQUIPMENT_SLOTS = {
  weapon1: { label: 'Weapon', type: 'weapon', icon: 'sword' },
  weapon2: { label: 'Weapon', type: 'weapon', icon: 'sword' },
  armor: { label: 'Armor', type: 'armor', icon: 'shield' },
  accessory1: { label: 'Accessory', type: 'accessory', icon: 'ring' },
  accessory2: { label: 'Accessory', type: 'accessory', icon: 'ring' },
  lighthouse1: { label: 'Lighthouse', type: 'lighthouse', icon: 'lighthouse', position: 'Light Bearer' },
  lighthouse2: { label: 'Lighthouse', type: 'lighthouse', icon: 'lighthouse', position: 'Light Bearer' },
  beast1: { label: 'Beast', type: 'beast', icon: 'beast', position: 'Anima' },
  beast2: { label: 'Beast', type: 'beast', icon: 'beast', position: 'Anima' }
};

// Beast tier configuration
export const BEAST_TIERS = {
  1: { label: 'Common', growthMultiplier: 0.6 },
  2: { label: 'Uncommon', growthMultiplier: 0.8 },
  3: { label: 'Rare', growthMultiplier: 1.0 },
  4: { label: 'Elite', growthMultiplier: 1.3 },
  5: { label: 'Legendary', growthMultiplier: 1.6 }
};

// Proficiency discount rate
export const PROFICIENCY_DISCOUNT = 0.8; // 20% cost reduction

// Base spirit pool
export const BASE_SPIRIT = 50;

// Base movement speed
export const BASE_SPEED = 6;

// Default stat multiplier cap
export const DEFAULT_STAT_MULTIPLIER = 2.0;

// Auto-save debounce delay (ms)
export const AUTOSAVE_DELAY = 2000;
