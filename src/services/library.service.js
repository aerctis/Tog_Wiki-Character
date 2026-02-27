// src/services/library.service.js
// Fetches game content libraries from Firestore: skills, items, beasts, synergies.

import { db } from '../config/firebase.js';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';

export async function fetchSkillLibrary() {
  try {
    const snap = await getDocs(collection(db, 'skills'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch skill library:', error);
    return [];
  }
}

export async function fetchEquipmentLibrary() {
  try {
    const snap = await getDocs(collection(db, 'items'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch equipment library:', error);
    return [];
  }
}

export async function fetchBestiaryLibrary() {
  try {
    const snap = await getDocs(collection(db, 'beasts'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch bestiary library:', error);
    return [];
  }
}

export async function fetchBeastSynergies() {
  try {
    const snap = await getDocs(collection(db, 'beast_synergies'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch beast synergies:', error);
    return [];
  }
}

export async function fetchAllLibraries() {
  const [skills, items, beasts, synergies] = await Promise.all([
    fetchSkillLibrary(),
    fetchEquipmentLibrary(),
    fetchBestiaryLibrary(),
    fetchBeastSynergies()
  ]);
  return { skills, items, beasts, synergies };
}

export function listenToGameSettings(callback) {
  const ref = doc(db, 'game_settings', 'shop');
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : { isShopOpen: false, shopItems: [] });
  });
}

/**
 * Listen to a library collection for real-time updates (admin pushes changes).
 */
export function listenToCollection(collectionName, callback) {
  return onSnapshot(collection(db, collectionName), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
