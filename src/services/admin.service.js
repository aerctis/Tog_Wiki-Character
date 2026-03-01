// src/services/admin.service.js
// Admin operations — player management, content CRUD, shop, market.

import { db } from '../config/firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, onSnapshot, arrayUnion, arrayRemove,
  serverTimestamp, writeBatch, increment
} from 'firebase/firestore';

// ─── Party Config ───────────────────────────────────────────────
/**
 * Get the list of player UIDs in the admin's party.
 */
export async function getPartyMembers() {
  const snap = await getDoc(doc(db, 'game_settings', 'party'));
  return snap.exists() ? (snap.data().members || []) : [];
}

export async function setPartyMembers(uids) {
  await setDoc(doc(db, 'game_settings', 'party'), { members: uids }, { merge: true });
}

/**
 * Fetch character data for multiple UIDs.
 */
export async function fetchPartyCharacters(uids) {
  const results = [];
  for (const uid of uids) {
    const snap = await getDoc(doc(db, 'characters', uid));
    if (snap.exists()) results.push({ uid, ...snap.data() });
  }
  return results;
}

/**
 * Listen to a specific character document in real-time.
 */
export function listenToCharacter(uid, callback) {
  return onSnapshot(doc(db, 'characters', uid), snap => {
    if (snap.exists()) callback({ uid: snap.id, ...snap.data() });
  });
}

// ─── Player Progression (Admin-only writes) ──────────────────────
export async function setPlayerLevel(uid, level) {
  await updateDoc(doc(db, 'characters', uid), { level });
}

export async function setPlayerFloor(uid, floor) {
  await updateDoc(doc(db, 'characters', uid), { floor });
}

export async function adjustPlayerCurrency(uid, amount) {
  await updateDoc(doc(db, 'characters', uid), { currency: increment(amount) });
}

export async function setPlayerStatMultiplier(uid, multiplier) {
  await updateDoc(doc(db, 'characters', uid), { statMultiplier: multiplier });
}

export async function adjustBonusStatPoints(uid, amount) {
  await updateDoc(doc(db, 'characters', uid), { bonusStatPoints: increment(amount) });
}

export async function adjustBonusSkillPoints(uid, amount) {
  await updateDoc(doc(db, 'characters', uid), { bonusSkillPoints: increment(amount) });
}

export async function adjustBeastPoints(uid, amount) {
  await updateDoc(doc(db, 'characters', uid), { beastPoints: increment(amount) });
}

/** Reset stat allocation: set all manualStatPoints to 0 */
export async function resetPlayerStats(uid) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const stats = snap.data().manualStatPoints || {};
  const reset = {};
  for (const key of Object.keys(stats)) reset[key] = 0;
  await updateDoc(doc(db, 'characters', uid), {
    manualStatPoints: reset,
    lockedStatPoints: {}
  });
}

/** Grant deallocation points to let player undo locked stats */
export async function grantDeallocationPoints(uid, amount) {
  await updateDoc(doc(db, 'characters', uid), {
    deallocationPoints: increment(amount)
  });
}

/** Add skill slots to a player's tier */
export async function addSkillSlots(uid, tier, count = 1) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const data = snap.data();
  const skills = data.skillsByTier || {};
  const tierSlots = skills[tier] || [];
  for (let i = 0; i < count; i++) tierSlots.push(null);
  skills[tier] = tierSlots;
  await updateDoc(doc(db, 'characters', uid), { skillsByTier: skills });
}

/** Remove last skill slot from a tier */
export async function removeSkillSlot(uid, tier) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const data = snap.data();
  const skills = data.skillsByTier || {};
  const tierSlots = skills[tier] || [];
  if (tierSlots.length > 0) tierSlots.pop();
  skills[tier] = tierSlots;
  await updateDoc(doc(db, 'characters', uid), { skillsByTier: skills });
}

/** Give item to player */
export async function giveItem(uid, itemId) {
  await updateDoc(doc(db, 'characters', uid), {
    ownedItems: arrayUnion(itemId)
  });
}

/** Remove item from player */
export async function removeItem(uid, itemId) {
  await updateDoc(doc(db, 'characters', uid), {
    ownedItems: arrayRemove(itemId)
  });
}

/** Give beast to player */
export async function giveBeast(uid, beastId) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const beasts = snap.data().ownedBeasts || {};
  if (!beasts[beastId]) {
    beasts[beastId] = { level: 1, nickname: '' };
    await updateDoc(doc(db, 'characters', uid), { ownedBeasts: beasts });
  }
}

/** Admin de-level a beast for a player */
export async function setBeastLevel(uid, beastId, level) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const beasts = snap.data().ownedBeasts || {};
  if (beasts[beastId]) {
    beasts[beastId].level = Math.max(1, level);
    await updateDoc(doc(db, 'characters', uid), { ownedBeasts: beasts });
  }
}

/** Add proficiency category to player */
export async function addProficiency(uid, category) {
  await updateDoc(doc(db, 'characters', uid), {
    proficientCategories: arrayUnion(category)
  });
}

/** Remove proficiency category from player */
export async function removeProficiency(uid, category) {
  await updateDoc(doc(db, 'characters', uid), {
    proficientCategories: arrayRemove(category)
  });
}

/** Add strong proficiency (specific skill) to player */
export async function addStrongProficiency(uid, skillId) {
  await updateDoc(doc(db, 'characters', uid), {
    proficientSkills: arrayUnion(skillId)
  });
}

/** Remove strong proficiency (specific skill) from player */
export async function removeStrongProficiency(uid, skillId) {
  await updateDoc(doc(db, 'characters', uid), {
    proficientSkills: arrayRemove(skillId)
  });
}

/** Add/remove special item for a player */
export async function addSpecialItem(uid, item) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const items = snap.data().specialItems || [];
  items.push(item);
  await updateDoc(doc(db, 'characters', uid), { specialItems: items });
}

export async function removeSpecialItem(uid, index) {
  const snap = await getDoc(doc(db, 'characters', uid));
  if (!snap.exists()) return;
  const items = snap.data().specialItems || [];
  items.splice(index, 1);
  await updateDoc(doc(db, 'characters', uid), { specialItems: items });
}

/** Level up ALL party members by 1 */
export async function levelUpAll(uids) {
  const batch = writeBatch(db);
  for (const uid of uids) {
    batch.update(doc(db, 'characters', uid), { level: increment(1) });
  }
  await batch.commit();
}

// ─── Content CRUD (Skills, Items, Beasts) ────────────────────────
export async function saveSkill(id, data) {
  if (id) {
    await setDoc(doc(db, 'skills', id), data, { merge: true });
    return id;
  } else {
    const ref = await addDoc(collection(db, 'skills'), data);
    return ref.id;
  }
}

export async function deleteSkill(id) {
  await deleteDoc(doc(db, 'skills', id));
}

export async function saveItem(id, data) {
  if (id) {
    await setDoc(doc(db, 'items', id), data, { merge: true });
    return id;
  } else {
    const ref = await addDoc(collection(db, 'items'), data);
    return ref.id;
  }
}

export async function deleteItem(id) {
  await deleteDoc(doc(db, 'items', id));
}

export async function saveBeast(id, data) {
  if (id) {
    await setDoc(doc(db, 'beasts', id), data, { merge: true });
    return id;
  } else {
    const ref = await addDoc(collection(db, 'beasts'), data);
    return ref.id;
  }
}

export async function deleteBeast(id) {
  await deleteDoc(doc(db, 'beasts', id));
}

export async function saveSynergy(id, data) {
  if (id) {
    await setDoc(doc(db, 'beast_synergies', id), data, { merge: true });
    return id;
  } else {
    const ref = await addDoc(collection(db, 'beast_synergies'), data);
    return ref.id;
  }
}

export async function deleteSynergy(id) {
  await deleteDoc(doc(db, 'beast_synergies', id));
}

// ─── Discovery Toggles ──────────────────────────────────────────
export async function toggleDiscovery(collectionName, docId, isDiscovered) {
  await updateDoc(doc(db, collectionName, docId), { isDiscovered });
}

// ─── Shop Management ─────────────────────────────────────────────
export async function getShopSettings() {
  const snap = await getDoc(doc(db, 'game_settings', 'shop'));
  return snap.exists() ? snap.data() : { isShopOpen: false, shopItems: [] };
}

export async function setShopOpen(isOpen) {
  await setDoc(doc(db, 'game_settings', 'shop'), { isShopOpen: isOpen }, { merge: true });
}

export async function setShopItems(items) {
  await setDoc(doc(db, 'game_settings', 'shop'), { shopItems: items }, { merge: true });
}

// ─── Market (Player Sell Listings) ───────────────────────────────
export async function fetchMarketListings() {
  const snap = await getDocs(query(collection(db, 'market'), where('status', '==', 'listed')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approveMarketSale(listingId, price) {
  const listingRef = doc(db, 'market', listingId);
  const listing = await getDoc(listingRef);
  if (!listing.exists()) throw new Error('Listing not found');
  const data = listing.data();

  const batch = writeBatch(db);
  // Pay the seller
  batch.update(doc(db, 'characters', data.sellerUid), { currency: increment(price) });
  // Mark listing as sold
  batch.update(listingRef, { status: 'sold', salePrice: price, soldAt: serverTimestamp() });
  await batch.commit();
}

export async function rejectMarketSale(listingId) {
  const listingRef = doc(db, 'market', listingId);
  const listing = await getDoc(listingRef);
  if (!listing.exists()) throw new Error('Listing not found');
  const data = listing.data();

  const batch = writeBatch(db);
  // Return item to seller
  batch.update(doc(db, 'characters', data.sellerUid), { ownedItems: arrayUnion(data.itemId) });
  batch.update(listingRef, { status: 'cancelled' });
  await batch.commit();
}

// ─── Fetch all synergies ─────────────────────────────────────────
export async function fetchBeastSynergies() {
  const snap = await getDocs(collection(db, 'beast_synergies'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Fetch all registered users (for party management) ──────────
export async function fetchAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
