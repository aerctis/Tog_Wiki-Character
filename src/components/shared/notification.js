// src/components/shared/notification.js
// Toast notification system — used across all pages

let toastElement = null;
let hideTimeout = null;

/**
 * Initialize the notification system. Call once per page.
 * Creates the toast DOM element if it doesn't exist.
 */
export function initNotifications() {
  if (toastElement) return;

  toastElement = document.createElement('div');
  toastElement.id = 'notification-toast';
  toastElement.setAttribute('role', 'alert');
  toastElement.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastElement);
}

/**
 * Show a toast notification.
 * @param {string} message - Text to display
 * @param {'info'|'success'|'danger'} type - Visual style
 * @param {number} duration - How long to show (ms)
 */
export function showNotification(message, type = 'info', duration = 3000) {
  if (!toastElement) initNotifications();

  // Clear any existing timeout
  if (hideTimeout) clearTimeout(hideTimeout);

  // Reset classes
  toastElement.className = 'show';
  if (type === 'danger') toastElement.classList.add('danger');
  if (type === 'success') toastElement.classList.add('success');

  toastElement.textContent = message;

  hideTimeout = setTimeout(() => {
    toastElement.classList.remove('show');
  }, duration);
}
