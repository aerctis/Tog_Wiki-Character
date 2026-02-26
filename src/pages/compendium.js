// src/pages/compendium.js
// Compendium page — wiki, items, beasts, session logs
import { waitForAuth } from '../services/auth.service.js';
import { initNotifications } from '../components/shared/notification.js';

async function init() {
  initNotifications();

  const user = await waitForAuth();
  if (!user) {
    window.location.href = '/';
    return;
  }

  document.getElementById('compendium-root').innerHTML = `
    <p style="color: var(--text-secondary); padding: 2rem;">
      Compendium coming soon — wiki pages, items, beasts, and session logs will live here.
    </p>
  `;
}

init();
