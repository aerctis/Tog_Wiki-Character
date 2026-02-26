// src/systems/combat-math.js
// Derived combat stats — HP, speed, attack, defense, hit dice.
// Pure computation from stat values + equipment + level.

import { HIT_DICE, BASE_SPEED } from '../config/constants.js';

/**
 * Calculate maximum HP.
 * Formula: 3×SE + 2×STR + 1.5×WP + level×(2 + floor(level/25)) + HP bonus
 *
 * @param {Object<string, number>} totalStats - Final stat values
 * @param {number} level
 * @param {Object<string, { add: number }>} skillBonuses - May contain 'HP' key
 * @returns {number}
 */
export function calculateMaxHP(totalStats, level, skillBonuses = {}) {
  const se = totalStats['Shinsu Endurance'] || 0;
  const str = totalStats['Strength'] || 0;
  const wp = totalStats['Willpower'] || 0;

  const base = 3 * se + 2 * str + 1.5 * wp;
  const levelBonus = level * (2 + Math.floor(level / 25));
  const hpBonus = skillBonuses['HP']?.add || 0;

  return Math.round(base + levelBonus + hpBonus);
}

/**
 * Calculate hit dice string.
 * Count = floor(maxHP / 10), die size = position-based, modifier = WP mod.
 *
 * @param {number} maxHP
 * @param {string} position
 * @param {Object<string, number>} totalStats
 * @returns {{ count: number, dieSize: number, modifier: number, display: string }}
 */
export function calculateHitDice(maxHP, position, totalStats) {
  const dieSize = HIT_DICE[position] || 6;
  const count = Math.floor(maxHP / 10);
  const wp = totalStats['Willpower'] || 0;
  const modifier = Math.floor((wp - 10) / 2);

  const sign = modifier >= 0 ? '+' : '';
  return {
    count,
    dieSize,
    modifier,
    display: `${count}d${dieSize} ${sign}${modifier}`
  };
}

/**
 * Calculate movement speed.
 * Formula: 6 + level - max(0, 2×floor - SE) + speed bonuses
 *
 * @param {number} level
 * @param {number} floor
 * @param {Object<string, number>} totalStats
 * @param {Object<string, { add: number }>} skillBonuses - May contain 'Movement Speed' key
 * @returns {number}
 */
export function calculateSpeed(level, floor, totalStats, skillBonuses = {}) {
  const se = totalStats['Shinsu Endurance'] || 0;
  const speedBonus = skillBonuses['Movement Speed']?.add || 0;
  return BASE_SPEED + level - Math.max(0, 2 * floor - se) + speedBonus;
}

/**
 * Calculate attack value from selected weapon.
 * Formula: floor(weaponStat / 5) + weapon modifier
 *
 * @param {object|null} weapon - Equipped weapon data
 * @param {Object<string, number>} totalStats
 * @returns {number}
 */
export function calculateAttack(weapon, totalStats) {
  if (!weapon) return 0;
  const statVal = totalStats[weapon.stat] || 0;
  return Math.floor(statVal / 5) + (weapon.modifier || 0);
}

/**
 * Calculate defense value from armor.
 * Formula: floor(armorStat / 5) + armor modifier
 *
 * @param {object|null} armor - Equipped armor data
 * @param {Object<string, number>} totalStats
 * @returns {number}
 */
export function calculateDefense(armor, totalStats) {
  if (!armor) return 0;
  const statVal = totalStats[armor.stat] || 0;
  return Math.floor(statVal / 5) + (armor.modifier || 0);
}
