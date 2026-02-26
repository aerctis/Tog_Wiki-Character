// src/services/auth.service.js
// Authentication service — handles sign in, sign out, and auth state
import { auth, googleProvider, db } from '../config/firebase.js';
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Sign in with Google popup.
 * Creates/updates user doc in Firestore on successful login.
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Ensure user doc exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // First-time user — create their doc (non-admin by default)
      await setDoc(userRef, {
        displayName: user.displayName,
        email: user.email,
        isAdmin: false,
        createdAt: new Date().toISOString()
      });
    } else {
      // Update display name in case it changed
      await setDoc(userRef, {
        displayName: user.displayName,
        email: user.email
      }, { merge: true });
    }

    return user;
  } catch (error) {
    console.error('Sign-in error:', error);
    throw error;
  }
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Sign-out error:', error);
    throw error;
  }
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback - Called with (user) on state change. user is null if signed out.
 * @returns {function} Unsubscribe function
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current authenticated user (synchronous — may be null on page load).
 * @returns {object|null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Check if the current user is an admin.
 * @returns {Promise<boolean>}
 */
export async function isCurrentUserAdmin() {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    return userDoc.exists() && userDoc.data().isAdmin === true;
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
}

/**
 * Wait for auth to be ready (resolves with user or null).
 * Useful on page load when you need to know auth state before rendering.
 * @returns {Promise<object|null>}
 */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}
