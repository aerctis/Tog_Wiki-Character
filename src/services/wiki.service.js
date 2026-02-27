// src/services/wiki.service.js
// CRUD for wiki pages and session logs in Firestore

import { db } from '../config/firebase.js';
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp
} from 'firebase/firestore';

// ─── Wiki Pages ─────────────────────────────────────────────────

export async function fetchWikiPages() {
  try {
    const snap = await getDocs(query(collection(db, 'wiki'), orderBy('title')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch wiki pages:', error);
    return [];
  }
}

export async function fetchWikiPage(id) {
  try {
    const ref = doc(db, 'wiki', id);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Failed to fetch wiki page:', error);
    return null;
  }
}

export async function saveWikiPage(id, data) {
  try {
    const ref = id ? doc(db, 'wiki', id) : doc(collection(db, 'wiki'));
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return ref.id;
  } catch (error) {
    console.error('Failed to save wiki page:', error);
    throw error;
  }
}

export async function deleteWikiPage(id) {
  try {
    await deleteDoc(doc(db, 'wiki', id));
  } catch (error) {
    console.error('Failed to delete wiki page:', error);
    throw error;
  }
}

export function listenToWikiPages(callback) {
  return onSnapshot(
    query(collection(db, 'wiki'), orderBy('title')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    error => console.error('Wiki listener error:', error)
  );
}

// ─── Session Logs ───────────────────────────────────────────────

export async function fetchSessionLogs() {
  try {
    const snap = await getDocs(query(collection(db, 'session_logs'), orderBy('sessionNumber', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Failed to fetch session logs:', error);
    return [];
  }
}

export async function fetchSessionLog(id) {
  try {
    const ref = doc(db, 'session_logs', id);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Failed to fetch session log:', error);
    return null;
  }
}

export async function saveSessionLog(id, data) {
  try {
    const ref = id ? doc(db, 'session_logs', id) : doc(collection(db, 'session_logs'));
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return ref.id;
  } catch (error) {
    console.error('Failed to save session log:', error);
    throw error;
  }
}

export async function deleteSessionLog(id) {
  try {
    await deleteDoc(doc(db, 'session_logs', id));
  } catch (error) {
    console.error('Failed to delete session log:', error);
    throw error;
  }
}

export function listenToSessionLogs(callback) {
  return onSnapshot(
    query(collection(db, 'session_logs'), orderBy('sessionNumber', 'desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    error => console.error('Session log listener error:', error)
  );
}
