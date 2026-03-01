// src/systems/skill-engine.js
// Skill computation — effects aggregation, point costs, spirit.
// Pure logic, no DOM or Firebase.

import { PROFICIENCY_DISCOUNT, BASE_SPIRIT } from '../config/constants.js';

/**
 * Aggregate all active skill effects into stat bonuses.
 * Walks every equipped skill across all tiers.
 *
 * @param {Object<number, Array>} skillsByTier - { 1: [skill, null, ...], 2: [...] }
 * @param {string[]} proficientSkills - Array of skill IDs the player is proficient in
 * @returns {Object<string, { add: number, mul: number }>}
 */
export function aggregateSkillBonuses(skillsByTier, proficientSkills = []) {
  const bonuses = {};

  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill || !skill.level || skill.level === 0 || !skill.effects) continue;

      // Use proficient version if applicable
      const isProficient = proficientSkills.includes(skill.id);
      const displaySkill = (isProficient && skill.proficientVersion) ? skill.proficientVersion : skill;
      const effects = displaySkill.effects || skill.effects;

      const effect = effects.find(e => e.level === skill.level);
      if (!effect) continue;

      // Process primary effect
      applyEffect(bonuses, effect.stat, effect.type, effect.value);

      // Process secondary effect if present
      if (effect.stat2) {
        applyEffect(bonuses, effect.stat2, effect.type2, effect.value2);
      }
    }
  }

  return bonuses;
}

function applyEffect(bonuses, stat, type, value) {
  if (!stat || !type || value === undefined) return;
  if (!bonuses[stat]) bonuses[stat] = { add: 0, mul: 1 };
  if (type === 'add') bonuses[stat].add += value;
  if (type === 'mul') bonuses[stat].mul *= value;
}

/**
 * Calculate total used skill points across all tiers.
 * Proficient categories get a discount.
 *
 * @param {Object<number, Array>} skillsByTier
 * @param {string[]} proficientCategories - Category names with discount
 * @param {string[]} proficientSkills - Specific skill IDs that are proficient
 * @returns {number} - Total skill points used (rounded)
 */
export function calculateUsedSkillPoints(skillsByTier, proficientCategories = [], proficientSkills = []) {
  let total = 0;

  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill || !skill.level || skill.level === 0) continue;

      // Determine which cost table to use
      const isProficient = proficientSkills.includes(skill.id);
      const costTable = (isProficient && skill.proficientVersion)
        ? skill.proficientVersion.costPerLevel
        : skill.costPerLevel;

      // Sum up costs for levels 0 → current level
      let cost = costTable.slice(0, skill.level).reduce((a, b) => a + b, 0);

      // Apply category proficiency discount
      if (skill.skillType && proficientCategories.includes(skill.skillType)) {
        cost *= PROFICIENCY_DISCOUNT;
      }

      total += cost;
    }
  }

  return Math.round(total);
}

/**
 * Calculate available skill points.
 *
 * @param {number} level
 * @param {number} usedSkillPoints
 * @param {number} bonusSkillPoints - Extra points from admin or other sources
 * @returns {number}
 */
export function calculateAvailableSkillPoints(level, usedSkillPoints, bonusSkillPoints = 0) {
  return (level - 1) - usedSkillPoints + bonusSkillPoints;
}

/**
 * Calculate spirit pool: base spirit + equipment bonuses - equipped skill spirit costs.
 * Spirit cost can now vary per skill level via spiritCostPerLevel array.
 *
 * @param {Object<number, Array>} skillsByTier
 * @param {Object} equipment - Equipment slots (values may have spiritBonus)
 * @returns {{ current: number, max: number }}
 */
export function calculateSpirit(skillsByTier, equipment) {
  let usedSpirit = 0;
  let spiritBonus = 0;

  // Sum spirit costs from equipped skills (level-aware)
  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill) continue;
      usedSpirit += getSkillSpiritCost(skill);
    }
  }

  // Sum spirit bonuses from equipment
  for (const item of Object.values(equipment)) {
    if (item && item.spiritBonus) {
      spiritBonus += item.spiritBonus;
    }
  }

  const max = BASE_SPIRIT + spiritBonus;
  return {
    current: max - usedSpirit,
    max
  };
}

/**
 * Get the effective spirit cost for a skill at its current level.
 * Uses spiritCostPerLevel array if available, otherwise falls back to flat spiritCost.
 *
 * @param {object} skill - Skill data (with level set)
 * @returns {number} Spirit cost at current level
 */
export function getSkillSpiritCost(skill) {
  if (!skill) return 0;
  const lvl = skill.level || 0;

  // Per-level spirit cost array takes priority
  if (skill.spiritCostPerLevel && skill.spiritCostPerLevel.length > 0) {
    // Index 0 = cost at level 1, etc. Level 0 (just learned, not leveled) uses index 0 too.
    const idx = Math.max(0, lvl - 1);
    return skill.spiritCostPerLevel[Math.min(idx, skill.spiritCostPerLevel.length - 1)] || 0;
  }

  // Flat spirit cost (legacy / simple skills)
  return skill.spiritCost || 0;
}

/**
 * Get the tier for a skill. In the new system, each skill has a fixed tier.
 * This replaces the old tierByLevel progression system.
 *
 * @param {object} skill - Skill data with tier field
 * @returns {number} - Tier number (1+)
 */
export function getSkillTier(skill) {
  return skill.tier || 1;
}

/**
 * Find the highest tier number that has any slots across a character's skillsByTier.
 * Useful for dynamic rendering when tiers can be arbitrary.
 *
 * @param {Object<number|string, Array>} skillsByTier
 * @returns {number[]} Sorted array of tier numbers that have slots
 */
export function getActiveTiers(skillsByTier) {
  if (!skillsByTier) return [];
  return Object.keys(skillsByTier)
    .map(Number)
    .filter(t => !isNaN(t) && skillsByTier[t] && skillsByTier[t].length > 0)
    .sort((a, b) => a - b);
}
