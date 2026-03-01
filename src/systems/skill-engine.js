// src/systems/skill-engine.js
// Skill computation — effects aggregation, point costs, spirit.
// Pure logic, no DOM or Firebase.

import { PROFICIENCY_DISCOUNT, BASE_SPIRIT } from '../config/constants.js';

/**
 * Aggregate all active skill effects into stat bonuses.
 * Now also applies weak proficiency bonuses per-skill.
 *
 * @param {Object<number, Array>} skillsByTier
 * @param {string[]} proficientSkills - Skill IDs with strong proficiency
 * @param {string[]} proficientCategories - Category names with weak proficiency
 * @returns {Object<string, { add: number, mul: number }>}
 */
export function aggregateSkillBonuses(skillsByTier, proficientSkills = [], proficientCategories = []) {
  const bonuses = {};

  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill || !skill.level || skill.level === 0) continue;

      // ── Strong proficiency: swap entire skill data ──
      const hasStrongProf = proficientSkills.includes(skill.id);
      const displaySkill = (hasStrongProf && skill.proficientVersion) ? skill.proficientVersion : skill;
      const effects = displaySkill.effects || skill.effects || [];

      const effect = effects.find(e => e.level === skill.level);
      if (effect) {
        applyEffect(bonuses, effect.stat, effect.type, effect.value);
        if (effect.stat2) {
          applyEffect(bonuses, effect.stat2, effect.type2, effect.value2);
        }
      }

      // ── Weak proficiency bonuses ──
      // skill.weakProficiencyBonuses: [{ category, stat?, type?, value?, description? }]
      // If the player has a matching weak proficiency category, apply the bonus.
      const weakBonuses = skill.weakProficiencyBonuses || [];
      for (const wb of weakBonuses) {
        if (wb.category && proficientCategories.includes(wb.category)) {
          if (wb.stat && wb.type && wb.value !== undefined) {
            applyEffect(bonuses, wb.stat, wb.type, wb.value);
          }
        }
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
 * Proficient categories get a 20% discount.
 */
export function calculateUsedSkillPoints(skillsByTier, proficientCategories = [], proficientSkills = []) {
  let total = 0;

  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill || !skill.level || skill.level === 0) continue;

      const isProficient = proficientSkills.includes(skill.id);
      const costTable = (isProficient && skill.proficientVersion)
        ? skill.proficientVersion.costPerLevel
        : skill.costPerLevel;

      let cost = costTable.slice(0, skill.level).reduce((a, b) => a + b, 0);

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
 */
export function calculateAvailableSkillPoints(level, usedSkillPoints, bonusSkillPoints = 0) {
  return (level - 1) - usedSkillPoints + bonusSkillPoints;
}

/**
 * Calculate spirit pool with per-level spirit costs.
 */
export function calculateSpirit(skillsByTier, equipment) {
  let usedSpirit = 0;
  let spiritBonus = 0;

  for (const tier in skillsByTier) {
    for (const skill of skillsByTier[tier]) {
      if (!skill) continue;
      usedSpirit += getSkillSpiritCost(skill);
    }
  }

  for (const item of Object.values(equipment)) {
    if (item && item.spiritBonus) spiritBonus += item.spiritBonus;
  }

  const max = BASE_SPIRIT + spiritBonus;
  return { current: max - usedSpirit, max };
}

/**
 * Get spirit cost at current level. Uses spiritCostPerLevel[] if available.
 */
export function getSkillSpiritCost(skill) {
  if (!skill) return 0;
  const lvl = skill.level || 0;
  if (skill.spiritCostPerLevel && skill.spiritCostPerLevel.length > 0) {
    const idx = Math.max(0, lvl - 1);
    return skill.spiritCostPerLevel[Math.min(idx, skill.spiritCostPerLevel.length - 1)] || 0;
  }
  return skill.spiritCost || 0;
}

/**
 * Fixed tier per skill (replaces old tierByLevel).
 */
export function getSkillTier(skill) {
  return skill.tier || 1;
}

/**
 * Sorted array of tier numbers that have slots.
 */
export function getActiveTiers(skillsByTier) {
  if (!skillsByTier) return [];
  return Object.keys(skillsByTier)
    .map(Number)
    .filter(t => !isNaN(t) && skillsByTier[t] && skillsByTier[t].length > 0)
    .sort((a, b) => a - b);
}

/**
 * Get active weak proficiency bonuses for a skill given a player's categories.
 * Useful for UI display.
 */
export function getActiveWeakBonuses(skill, proficientCategories = []) {
  if (!skill.weakProficiencyBonuses) return [];
  return skill.weakProficiencyBonuses.filter(wb => proficientCategories.includes(wb.category));
}
