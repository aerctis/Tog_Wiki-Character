// src/pages/admin/dashboard.js
// Admin dashboard — GM-only page
import { waitForAuth, isCurrentUserAdmin } from '../../services/auth.service.js';
import { initNotifications, showNotification } from '../../components/shared/notification.js';

async function init() {
  initNotifications();

  const user = await waitForAuth();
  if (!user) {
    window.location.href = '/';
    return;
  }

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) {
    showNotification('Access denied — admin only.', 'danger');
    window.location.href = '/sheet.html';
    return;
  }

  document.getElementById('admin-root').innerHTML = `
    <p style="color: var(--text-secondary); padding: 2rem;">
      Admin dashboard coming soon — player management, shop, content editor, and market will live here.
    </p>
  `;
}

init();
