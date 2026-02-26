// src/pages/login.js
// Login page controller — handles Google sign-in and redirect
import { signInWithGoogle, waitForAuth, isCurrentUserAdmin } from '../services/auth.service.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';

/**
 * Initialize the login page.
 * If user is already authenticated, redirect immediately.
 */
export async function initLoginPage() {
  initNotifications();

  // Check if already logged in
  const user = await waitForAuth();
  if (user) {
    redirectAfterLogin();
    return;
  }

  // Attach sign-in handler
  const signInBtn = document.getElementById('btn-sign-in');
  if (signInBtn) {
    signInBtn.addEventListener('click', handleSignIn);
  }
}

async function handleSignIn() {
  const btn = document.getElementById('btn-sign-in');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    await signInWithGoogle();
    redirectAfterLogin();
  } catch (error) {
    console.error('Sign-in failed:', error);
    btn.classList.remove('loading');
    btn.disabled = false;

    // User closed popup — not an error worth showing
    if (error.code === 'auth/popup-closed-by-user') return;
    if (error.code === 'auth/cancelled-popup-request') return;

    showNotification('Sign-in failed. Please try again.', 'danger');
  }
}

function redirectAfterLogin() {
  // For now, go straight to character sheet
  // When multi-character is implemented, go to /characters instead
  window.location.href = '/sheet.html';
}

// Auto-init when script loads
initLoginPage();
