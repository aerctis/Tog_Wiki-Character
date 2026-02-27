// src/components/shared/modal.js
// Generic modal controller — open, close, render content.

const modalRoot = () => document.getElementById('modal-root');

let activeModals = [];

/**
 * Open a modal with given config.
 * @param {Object} opts
 * @param {string} opts.id - Unique modal ID
 * @param {string} opts.title - Header text
 * @param {string} [opts.size] - 'sm' | 'md' | 'lg' | 'xl'
 * @param {string|HTMLElement} opts.body - Inner HTML or DOM element
 * @param {Function} [opts.onClose] - Called when modal closes
 * @returns {HTMLElement} The modal element
 */
export function openModal({ id, title, size = 'md', body, onClose }) {
  // Remove existing modal with same ID
  closeModal(id);

  const sizeClass = {
    sm: 'modal-content--sm',
    md: '',
    lg: 'modal-content--lg',
    xl: 'modal-content--xl'
  }[size] || '';

  const backdrop = document.createElement('div');
  backdrop.id = `modal-${id}`;
  backdrop.className = 'modal-backdrop active';
  backdrop.innerHTML = `
    <div class="modal-content ${sizeClass}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn-ghost btn-sm modal-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body" id="modal-body-${id}"></div>
    </div>
  `;

  // Set body content
  const bodyEl = backdrop.querySelector(`#modal-body-${id}`);
  if (typeof body === 'string') {
    bodyEl.innerHTML = body;
  } else if (body instanceof HTMLElement) {
    bodyEl.appendChild(body);
  }

  // Close handlers
  const close = () => {
    closeModal(id);
    if (onClose) onClose();
  };
  backdrop.querySelector('.modal-close-btn').addEventListener('click', close);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });

  modalRoot().appendChild(backdrop);
  activeModals.push(id);
  return backdrop;
}

/**
 * Close a modal by ID.
 */
export function closeModal(id) {
  const el = document.getElementById(`modal-${id}`);
  if (el) {
    el.remove();
    activeModals = activeModals.filter(m => m !== id);
  }
}

/**
 * Close all open modals.
 */
export function closeAllModals() {
  [...activeModals].forEach(id => closeModal(id));
}

/**
 * Get the body element of an open modal.
 */
export function getModalBody(id) {
  return document.getElementById(`modal-body-${id}`);
}

/**
 * Show a confirmation dialog.
 * @returns {Promise<boolean>}
 */
export function showConfirmation(message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="confirmation-message">${message}</p>
      <div class="modal-footer" style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle);">
        <button class="btn-ghost confirm-cancel">${cancelText}</button>
        <button class="${danger ? 'btn-danger' : 'btn-accent'} confirm-yes">${confirmText}</button>
      </div>
    `;

    const modal = openModal({
      id: 'confirm-dialog',
      title,
      size: 'sm',
      body,
      onClose: () => resolve(false)
    });

    body.querySelector('.confirm-cancel').addEventListener('click', () => {
      closeModal('confirm-dialog');
      resolve(false);
    });
    body.querySelector('.confirm-yes').addEventListener('click', () => {
      closeModal('confirm-dialog');
      resolve(true);
    });
  });
}
