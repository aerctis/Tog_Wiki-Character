// src/services/character.service.js
// Character data persistence — load, save, reset, listen.

import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { STATS } from '../config/constants.js';

/**
 * Load a character document from Firestore.
 * Returns null if no character exists for this user.
 *
 * @param {string} uid - User ID
 * @returns {Promise<object|null>}
 */
export async function loadCharacter(uid) {
  try {
    const ref = doc(db, 'characters', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    console.error('Failed to load character:', error);
    throw error;
  }
}

/**
 * Save a character document to Firestore (full overwrite).
 *
 * @param {string} uid
 * @param {object} data - Complete character data
 * @returns {Promise<void>}
 */
export async function saveCharacter(uid, data) {
  try {
    const ref = doc(db, 'characters', uid);
    await setDoc(ref, data);
  } catch (error) {
    console.error('Failed to save character:', error);
    throw error;
  }
}

/**
 * Save partial character data (merge).
 * Use when you only need to update specific fields.
 *
 * @param {string} uid
 * @param {object} partialData
 * @returns {Promise<void>}
 */
export async function updateCharacter(uid, partialData) {
  try {
    const ref = doc(db, 'characters', uid);
    await setDoc(ref, partialData, { merge: true });
  } catch (error) {
    console.error('Failed to update character:', error);
    throw error;
  }
}

/**
 * Delete a character document.
 *
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function deleteCharacter(uid) {
  try {
    const ref = doc(db, 'characters', uid);
    await deleteDoc(ref);
  } catch (error) {
    console.error('Failed to delete character:', error);
    throw error;
  }
}

/**
 * Listen for real-time changes to a character document.
 * Useful for admin pushing updates to a player's sheet.
 *
 * @param {string} uid
 * @param {function} callback - Called with (data) on each change
 * @returns {function} Unsubscribe function
 */
export function listenToCharacter(uid, callback) {
  const ref = doc(db, 'characters', uid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    }
  });
}

/**
 * Build a default character data object for new characters.
 *
 * @param {string} uid
 * @returns {object}
 */
export function getDefaultCharacterData(uid) {
  return {
    uid,
    name: '',
    race: '',
    position: 'Guide',
    level: 1,
    floor: 1,
    currentHP: 0,
    statMultiplier: 2.0,
    manualStatPoints: Object.fromEntries(STATS.map(s => [s, 0])),
    bonusStatPoints: 0,
    affinities: { primary: [], secondary: [], tertiary: [] },
    equipment: {
      weapon1: null, weapon2: null, armor: null,
      accessory1: null, accessory2: null,
      lighthouse1: null, lighthouse2: null,
      beast1: null, beast2: null
    },
    selectedWeaponSlot: null,
    ownedItems: [],
    ownedBeasts: {},
    beastPoints: 0,
    skillsByTier: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    bonusSkillPoints: 0,
    proficientCategories: [],
    proficientSkills: [],
    currency: 0,
    specialItems: [],
    backstory: '',
    appliedTheme: 'dark-red',
    appliedThemeVars: null,
    customThemes: [],
    layoutPreset: 'default'
  };
}

/**
 * Build the save payload from the current page state.
 * This is what gets written to Firestore.
 *
 * @param {object} charData - The local character state object
 * @returns {object}
 */
export function buildSavePayload(charData) {
  return {
    uid: charData.uid,
    name: charData.name,
    race: charData.race,
    position: charData.position,
    level: charData.level,
    floor: charData.floor,
    currentHP: charData.currentHP,
    statMultiplier: charData.statMultiplier,
    manualStatPoints: charData.manualStatPoints,
    bonusStatPoints: charData.bonusStatPoints || 0,
    affinities: charData.affinities,
    equipment: charData.equipment,
    selectedWeaponSlot: charData.selectedWeaponSlot,
    ownedItems: charData.ownedItems,
    ownedBeasts: charData.ownedBeasts,
    beastPoints: charData.beastPoints || 0,
    skillsByTier: charData.skillsByTier,
    bonusSkillPoints: charData.bonusSkillPoints || 0,
    proficientCategories: charData.proficientCategories,
    proficientSkills: charData.proficientSkills,
    currency: charData.currency,
    specialItems: charData.specialItems,
    backstory: charData.backstory,
    appliedTheme: charData.appliedTheme || 'dark-red',
    appliedThemeVars: charData.appliedThemeVars || null,
    customThemes: charData.customThemes || [],
    layoutPreset: charData.layoutPreset || 'default'
  };
}
