// src/systems/beast-system.js
// Beast computation — stats, abilities, synergies.
// Pure logic, no DOM or Firebase.

import { BEAST_TIERS } from '../config/constants.js';

/**
 * Calculate a beast's current stats based on its level and tier.
 * Stats scale: baseStat + (growthRate × (level - 1))
 */
export function calculateBeastStats(beast, level) {
  if (!beast || !beast.baseStats) return { hp: 0, attack: 0, defense: 0, speed: 0 };
  const growth = beast.growthRates || {};
  return {
    hp: Math.round((beast.baseStats.hp || 0) + (growth.hp || 0) * (level - 1)),
    attack: Math.round((beast.baseStats.attack || 0) + (growth.attack || 0) * (level - 1)),
    defense: Math.round((beast.baseStats.defense || 0) + (growth.defense || 0) * (level - 1)),
    speed: Math.round((beast.baseStats.speed || 0) + (growth.speed || 0) * (level - 1))
  };
}

/**
 * Get the current ability evolution for a beast ability at a given level.
 * Returns the highest evolution whose minLevel <= current level.
 */
export function getCurrentAbilityEvolution(ability, level) {
  if (!ability || !ability.evolutions || ability.evolutions.length === 0) return null;
  const sorted = [...ability.evolutions].sort((a, b) => b.minLevel - a.minLevel);
  return sorted.find(e => level >= e.minLevel) || ability.evolutions[0];
}

/**
 * Get all active abilities for a beast at a given level, with current evolutions.
 */
export function getBeastAbilities(beast, level) {
  if (!beast || !beast.abilities) return [];
  return beast.abilities.map(ability => ({
    ...ability,
    currentEvolution: getCurrentAbilityEvolution(ability, level)
  }));
}

/**
 * Check if two equipped beasts trigger a synergy.
 * Returns matching synergy data or null.
 */
export function checkBeastSynergy(beast1Id, beast2Id, synergies) {
  if (!beast1Id || !beast2Id || !synergies) return null;
  return synergies.find(s =>
    s.requiredBeasts &&
    s.requiredBeasts.includes(beast1Id) &&
    s.requiredBeasts.includes(beast2Id)
  ) || null;
}

/**
 * Calculate available beast points.
 */
export function calculateAvailableBeastPoints(totalBeastPoints, ownedBeasts) {
  let spent = 0;
  for (const data of Object.values(ownedBeasts || {})) {
    // Each level costs 1 BP, level 1 is free (granted on tame)
    spent += Math.max(0, (data.level || 1) - 1);
  }
  return totalBeastPoints - spent;
}
