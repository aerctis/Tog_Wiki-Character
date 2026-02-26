// src/systems/stat-calculator.js
// Pure stat computation — takes data in, returns numbers out.
// No DOM access, no Firebase — just math.

import { STATS } from '../config/constants.js';
import { getGrowthRates } from '../config/growth-tables.js';

/**
 * Calculate base stats from level, position, and affinities.
 * Each stat starts at 1, then grows per level based on affinity tier.
 * Manual points are added on top.
 *
 * @param {number} level
 * @param {string} position
 * @param {{ primary: string[], secondary: string[], tertiary: string[] }} affinities
 * @param {Object<string, number>} manualStatPoints - { "Strength": 3, ... }
 * @returns {Object<string, number>} - Base stat values (before skill bonuses)
 */
export function calculateBaseStats(level, position, affinities, manualStatPoints) {
  const result = {};

  for (const stat of STATS) {
    let value = 1; // All stats start at 1

    for (let lvl = 1; lvl < level; lvl++) {
      const rates = getGrowthRates(position, lvl);
      if (affinities.primary.includes(stat)) value += rates.primary;
      if (affinities.secondary.includes(stat)) value += rates.secondary;
      if (affinities.tertiary.includes(stat)) value += rates.tertiary;
    }

    // Add manual point allocation
    value += (manualStatPoints[stat] || 0);

    result[stat] = value;
  }

  return result;
}

/**
 * Calculate total stats = base + skill bonuses.
 *
 * @param {Object<string, number>} baseStats
 * @param {Object<string, { add: number, mul: number }>} skillBonuses
 * @returns {Object<string, number>}
 */
export function calculateTotalStats(baseStats, skillBonuses) {
  const result = {};

  for (const stat of STATS) {
    const base = baseStats[stat] || 0;
    const bonus = skillBonuses[stat] || { add: 0, mul: 1 };
    result[stat] = base + bonus.add;
    // If we ever implement multiplicative bonuses:
    // result[stat] = (base * bonus.mul) + bonus.add;
  }

  return result;
}

/**
 * Calculate the stat cap: no stat can exceed multiplier × average.
 *
 * @param {Object<string, number>} totalStats
 * @param {number} statMultiplier - Default 2.0
 * @returns {number} - The cap value
 */
export function calculateStatCap(totalStats, statMultiplier) {
  const values = Object.values(totalStats);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return statMultiplier * avg;
}

/**
 * Check if adding a point to a stat would exceed the cap.
 *
 * @param {string} stat
 * @param {Object<string, number>} totalStats
 * @param {number} statMultiplier
 * @returns {boolean}
 */
export function wouldExceedCap(stat, totalStats, statMultiplier) {
  const cap = calculateStatCap(totalStats, statMultiplier);
  return (totalStats[stat] + 1) > Math.floor(cap);
}

/**
 * Calculate how many stat points are available.
 * Total granted = (level - 1) + bonusStatPoints
 * Available = granted - sum(manualStatPoints)
 *
 * @param {number} level
 * @param {Object<string, number>} manualStatPoints
 * @param {number} bonusStatPoints - Extra points granted by admin
 * @returns {number}
 */
export function calculateAvailableStatPoints(level, manualStatPoints, bonusStatPoints = 0) {
  const totalAllocated = Object.values(manualStatPoints).reduce((sum, v) => sum + v, 0);
  return (level - 1) + bonusStatPoints - totalAllocated;
}
