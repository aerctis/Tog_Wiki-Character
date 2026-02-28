// src/services/discovery.service.js
// Per-player discovery state for compendium items.
// Discovery levels: 'undiscovered' | 'seen' | 'learnable' | 'learned'
//
// Data stored in Firestore collection: player_discovery/{uid}
// Document structure:
// {
//   skills: { "skill-id": "learnable", "other-id": "seen", ... },
//   items: { "item-id": "learned", ... },
//   beasts: { "beast-id": "seen", ... }
// }

import { db } from '../config/firebase.js';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, writeBatch } from 'firebase/firestore';

/** Discovery level enum */
export const DISCOVERY_LEVELS = {
  UNDISCOVERED: 'undiscovered',
  SEEN: 'seen',
  LEARNABLE: 'learnable',
  LEARNED: 'learned'
};

/** Ordered levels for comparison */
const LEVEL_ORDER = ['undiscovered', 'seen', 'learnable', 'learned'];

/**
 * Fetch a player's full discovery state.
 * @param {string} uid
 * @returns {Promise<{skills: object, items: object, beasts: object}>}
 */
export async function fetchPlayerDiscovery(uid) {
  try {
    const snap = await getDoc(doc(db, 'player_discovery', uid));
    if (!snap.exists()) return { skills: {}, items: {}, beasts: {} };
    const data = snap.data();
    return {
      skills: data.skills || {},
      items: data.items || {},
      beasts: data.beasts || {}
    };
  } catch (err) {
    console.error('Failed to fetch discovery:', err);
    return { skills: {}, items: {}, beasts: {} };
  }
}

/**
 * Get discovery level for a specific entry.
 * @param {object} discovery - The player's discovery state
 * @param {string} category - 'skills' | 'items' | 'beasts'
 * @param {string} id - Entry ID
 * @returns {string} Discovery level
 */
export function getDiscoveryLevel(discovery, category, id) {
  return discovery?.[category]?.[id] || DISCOVERY_LEVELS.UNDISCOVERED;
}

/**
 * Set discovery level for a single entry for a single player.
 * @param {string} uid
 * @param {string} category - 'skills' | 'items' | 'beasts'
 * @param {string} id - Entry ID
 * @param {string} level - Discovery level
 */
export async function setDiscoveryLevel(uid, category, id, level) {
  const ref = doc(db, 'player_discovery', uid);
  await setDoc(ref, {
    [category]: { [id]: level }
  }, { merge: true });
}

/**
 * Set discovery level for a single entry for ALL players.
 * @param {string[]} uids - Array of all player UIDs
 * @param {string} category - 'skills' | 'items' | 'beasts'
 * @param {string} id - Entry ID
 * @param {string} level - Discovery level
 */
export async function setDiscoveryLevelForAll(uids, category, id, level) {
  const batch = writeBatch(db);
  for (const uid of uids) {
    const ref = doc(db, 'player_discovery', uid);
    batch.set(ref, {
      [category]: { [id]: level }
    }, { merge: true });
  }
  await batch.commit();
}

/**
 * Set discovery level for multiple entries at once for a single player.
 * @param {string} uid
 * @param {string} category
 * @param {object} updates - { id: level, id2: level2, ... }
 */
export async function batchSetDiscovery(uid, category, updates) {
  const ref = doc(db, 'player_discovery', uid);
  await setDoc(ref, {
    [category]: updates
  }, { merge: true });
}

/**
 * Set discovery level for multiple entries for ALL players.
 * @param {string[]} uids
 * @param {string} category
 * @param {object} updates - { id: level, ... }
 */
export async function batchSetDiscoveryForAll(uids, category, updates) {
  // Firestore batch limit is 500 operations
  const batchSize = 400;
  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = uids.slice(i, i + batchSize);
    for (const uid of chunk) {
      const ref = doc(db, 'player_discovery', uid);
      batch.set(ref, {
        [category]: updates
      }, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Fetch discovery states for all players (admin use).
 * @param {string[]} uids - Player UIDs to fetch
 * @returns {Promise<object>} - { uid: { skills: {...}, items: {...}, beasts: {...} }, ... }
 */
export async function fetchAllPlayerDiscoveries(uids) {
  const result = {};
  for (const uid of uids) {
    result[uid] = await fetchPlayerDiscovery(uid);
  }
  return result;
}
