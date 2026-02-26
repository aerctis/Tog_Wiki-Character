// src/services/library.service.js
// Fetches game content libraries from Firestore: skills, items, beasts.

import { db } from '../config/firebase.js';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';

/**
 * Fetch all skills from the skills collection.
 * @returns {Promise<Array>}
 */
export async function fetchSkillLibrary() {
  try {
    const snap = await getDocs(collection(db, 'skills'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch skill library:', error);
    return [];
  }
}

/**
 * Fetch all items from the items collection.
 * @returns {Promise<Array>}
 */
export async function fetchEquipmentLibrary() {
  try {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch equipment library:', error);
    return [];
  }
}

/**
 * Fetch all beasts from the beasts collection.
 * @returns {Promise<Array>}
 */
export async function fetchBestiaryLibrary() {
  try {
    const snap = await getDocs(collection(db, 'beasts'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch bestiary library:', error);
    return [];
  }
}

/**
 * Fetch all libraries at once.
 * @returns {Promise<{ skills: Array, items: Array, beasts: Array }>}
 */
export async function fetchAllLibraries() {
  const [skills, items, beasts] = await Promise.all([
    fetchSkillLibrary(),
    fetchEquipmentLibrary(),
    fetchBestiaryLibrary()
  ]);
  return { skills, items, beasts };
}

/**
 * Listen to game settings (shop status, etc).
 * @param {function} callback - Called with settings data on change
 * @returns {function} Unsubscribe
 */
export function listenToGameSettings(callback) {
  const ref = doc(db, 'game_settings', 'shop');
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : { isShopOpen: false, shopItems: [] });
  });
}
