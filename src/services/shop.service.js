// src/services/shop.service.js
// Shop + trading operations — player-facing.

import { db } from '../config/firebase.js';
import {
  doc, getDoc, updateDoc, addDoc, collection,
  onSnapshot, arrayUnion, arrayRemove, increment, serverTimestamp
} from 'firebase/firestore';

/**
 * Listen to shop settings in real-time (open/closed, items).
 */
export function listenToShop(callback) {
  return onSnapshot(doc(db, 'game_settings', 'shop'), snap => {
    callback(snap.exists() ? snap.data() : { isShopOpen: false, shopItems: [] });
  });
}

/**
 * Buy an item from the shop. Deducts currency and adds item to inventory.
 */
export async function buyItem(uid, itemId, price) {
  const charRef = doc(db, 'characters', uid);
  const snap = await getDoc(charRef);
  if (!snap.exists()) throw new Error('Character not found');
  const data = snap.data();
  if ((data.currency || 0) < price) throw new Error('Not enough points');
  
  await updateDoc(charRef, {
    currency: increment(-price),
    ownedItems: arrayUnion(itemId)
  });
}

/**
 * List an item for sale on the market.
 * Removes item from player inventory immediately.
 */
export async function listItemForSale(uid, displayName, itemId, itemName) {
  // Remove from inventory
  await updateDoc(doc(db, 'characters', uid), {
    ownedItems: arrayRemove(itemId)
  });
  // Create market listing
  await addDoc(collection(db, 'market'), {
    itemId,
    itemName,
    sellerUid: uid,
    sellerName: displayName,
    status: 'listed',
    listedAt: serverTimestamp()
  });
}

/**
 * Send item from one player to another.
 */
export async function sendItem(fromUid, toUid, itemId) {
  await updateDoc(doc(db, 'characters', fromUid), {
    ownedItems: arrayRemove(itemId)
  });
  await updateDoc(doc(db, 'characters', toUid), {
    ownedItems: arrayUnion(itemId)
  });
}

/**
 * Send currency from one player to another.
 */
export async function sendCurrency(fromUid, toUid, amount) {
  const fromRef = doc(db, 'characters', fromUid);
  const snap = await getDoc(fromRef);
  if (!snap.exists()) throw new Error('Character not found');
  if ((snap.data().currency || 0) < amount) throw new Error('Not enough points');
  
  await updateDoc(fromRef, { currency: increment(-amount) });
  await updateDoc(doc(db, 'characters', toUid), { currency: increment(amount) });
}
