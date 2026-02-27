// src/pages/login.js
// Login page — splash screen. Shows the cool Tower of God landing.
// If already logged in, clicking ENTER just redirects immediately.
import { signInWithGoogle, waitForAuth } from '../services/auth.service.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';

async function init() {
  initNotifications();
  const user = await waitForAuth();

  const btn = document.getElementById('btn-sign-in');
  if (!btn) return;

  if (user) {
    // Already logged in — button takes you straight to sheet
    btn.addEventListener('click', () => { window.location.href = '/sheet.html'; });
  } else {
    // Not logged in — trigger Google sign-in
    btn.addEventListener('click', async () => {
      btn.classList.add('loading');
      btn.disabled = true;
      try {
        await signInWithGoogle();
        window.location.href = '/sheet.html';
      } catch (error) {
        btn.classList.remove('loading');
        btn.disabled = false;
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
        showNotification('Sign-in failed.', 'danger');
      }
    });
  }
}

init();
