// src/config/growth-tables.js
// Position growth rate tables — how stats scale per level based on affinity tier

// Each position has an array of level ranges with growth rates for primary/secondary/tertiary affinities.
// To find the growth rate for a stat at a given level:
//   1. Look up the character's position
//   2. Find the range that contains the current level
//   3. Check if the stat is primary, secondary, or tertiary affinity
//   4. Use the corresponding rate

const GROWTH_TABLES = {
  Guide: [
    { range: [1, 10], primary: 1, secondary: 0.5, tertiary: 0.5 },
    { range: [11, 25], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 2, secondary: 1.5, tertiary: 1 },
    { range: [81, 110], primary: 2.5, secondary: 2, tertiary: 1 },
    { range: [111, 140], primary: 3, secondary: 2, tertiary: 1.5 },
    { range: [141, 170], primary: 3, secondary: 2.5, tertiary: 2 },
    { range: [171, Infinity], primary: 4, secondary: 3, tertiary: 3 }
  ],

  Fisherman: [
    { range: [1, 10], primary: 1, secondary: 1, tertiary: 0.5 },
    { range: [11, 25], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 2, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 2, secondary: 2, tertiary: 1 },
    { range: [81, 110], primary: 3, secondary: 2, tertiary: 1 },
    { range: [111, 140], primary: 3, secondary: 2, tertiary: 2 },
    { range: [141, 170], primary: 4, secondary: 3, tertiary: 2 },
    { range: [171, Infinity], primary: 4, secondary: 3, tertiary: 3 }
  ],

  'Spear Bearer': [
    { range: [1, 10], primary: 1, secondary: 1, tertiary: 0.5 },
    { range: [11, 25], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 2, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 3, secondary: 1, tertiary: 1 },
    { range: [81, 110], primary: 3, secondary: 2, tertiary: 1 },
    { range: [111, 140], primary: 4, secondary: 2, tertiary: 2 },
    { range: [141, 170], primary: 4, secondary: 3, tertiary: 2 },
    { range: [171, Infinity], primary: 5, secondary: 3, tertiary: 2 }
  ],

  'Wave Controller': [
    { range: [1, 10], primary: 1, secondary: 1, tertiary: 0.5 },
    { range: [11, 25], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 2, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 3, secondary: 1, tertiary: 1 },
    { range: [81, 110], primary: 3, secondary: 2, tertiary: 1 },
    { range: [111, 140], primary: 4, secondary: 2, tertiary: 2 },
    { range: [141, 170], primary: 4, secondary: 3, tertiary: 2 },
    { range: [171, Infinity], primary: 5, secondary: 3, tertiary: 2 }
  ],

  'Light Bearer': [
    { range: [1, 10], primary: 1, secondary: 1, tertiary: 0.5 },
    { range: [11, 25], primary: 1.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 2, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 3, secondary: 1, tertiary: 1 },
    { range: [81, 110], primary: 3, secondary: 2, tertiary: 1 },
    { range: [111, 140], primary: 4, secondary: 2, tertiary: 2 },
    { range: [141, 170], primary: 4, secondary: 3, tertiary: 2 },
    { range: [171, Infinity], primary: 5, secondary: 3, tertiary: 2 }
  ],

  Anima: [
    { range: [1, 10], primary: 2, secondary: 1, tertiary: 0.5 },
    { range: [11, 25], primary: 2.5, secondary: 1, tertiary: 0.5 },
    { range: [26, 50], primary: 3, secondary: 1, tertiary: 0.5 },
    { range: [51, 80], primary: 3.5, secondary: 1.5, tertiary: 1 },
    { range: [81, 110], primary: 4, secondary: 1.5, tertiary: 1 },
    { range: [111, 140], primary: 5, secondary: 2, tertiary: 1.5 },
    { range: [141, 170], primary: 6, secondary: 2, tertiary: 1.5 },
    { range: [171, Infinity], primary: 6, secondary: 2, tertiary: 2 }
  ]
};

/**
 * Get the growth rates for a given position at a given level.
 * @param {string} position - Character position name
 * @param {number} level - Character level
 * @returns {{ primary: number, secondary: number, tertiary: number }}
 */
export function getGrowthRates(position, level) {
  const table = GROWTH_TABLES[position];
  if (!table) return { primary: 0, secondary: 0, tertiary: 0 };

  const entry = table.find(r => level >= r.range[0] && level <= r.range[1]);
  return entry || { primary: 0, secondary: 0, tertiary: 0 };
}

export default GROWTH_TABLES;
