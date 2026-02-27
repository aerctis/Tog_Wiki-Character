// src/components/shared/modal.js
// Modal system — open/close, confirmation, and INPUT modals (no browser prompts)

let modalRoot = null;

function ensureRoot() {
  if (!modalRoot) {
    modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      document.body.appendChild(modalRoot);
    }
  }
  return modalRoot;
}

/**
 * Open a modal with given options.
 */
export function openModal({ id, title, body, size, onClose }) {
  const root = ensureRoot();
  const sizeClass = size ? `modal-content--${size}` : '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop active';
  backdrop.id = `modal-${id}`;
  backdrop.innerHTML = `
    <div class="modal-content ${sizeClass}">
      <div class="modal-header">
        <h3>${title || ''}</h3>
        <button class="btn-sm btn-ghost modal-close-btn" title="Close">&times;</button>
      </div>
      <div class="modal-body" id="modal-body-${id}">${body || ''}</div>
    </div>
  `;

  backdrop.querySelector('.modal-close-btn').addEventListener('click', () => closeModal(id));
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(id); });

  root.appendChild(backdrop);
  if (onClose) backdrop._onClose = onClose;
}

/**
 * Close and remove a modal.
 */
export function closeModal(id) {
  const el = document.getElementById(`modal-${id}`);
  if (!el) return;
  if (el._onClose) el._onClose();
  el.remove();
}

/**
 * Get modal body element for re-rendering.
 */
export function getModalBody(id) {
  return document.getElementById(`modal-body-${id}`);
}

/**
 * Confirmation dialog — returns a Promise<boolean>.
 */
export function showConfirmation(message, opts = {}) {
  return new Promise(resolve => {
    const id = 'confirm-' + Date.now();
    const body = `
      <div class="confirmation-message">${message}</div>
      <div class="modal-footer">
        <button class="btn-sm btn-outline" id="${id}-no">Cancel</button>
        <button class="btn-sm ${opts.danger ? 'btn-danger' : 'btn-accent'}" id="${id}-yes">Confirm</button>
      </div>
    `;
    openModal({ id, title: opts.title || 'Confirm', body, size: 'sm' });
    document.getElementById(`${id}-yes`)?.addEventListener('click', () => { closeModal(id); resolve(true); });
    document.getElementById(`${id}-no`)?.addEventListener('click', () => { closeModal(id); resolve(false); });
  });
}

/**
 * Input modal — replaces browser prompt(). Returns Promise<string|null>.
 * @param {object} opts - { title, label, currentValue, placeholder, type }
 */
export function showInputModal(opts = {}) {
  return new Promise(resolve => {
    const id = 'input-' + Date.now();
    const inputType = opts.type || 'text';
    const body = `
      <div class="input-modal-field">
        <label>${opts.label || 'Value'}</label>
        ${opts.currentValue !== undefined ? `<div class="current-value">Current: ${opts.currentValue}</div>` : ''}
        <input type="${inputType}" id="${id}-input" value="${opts.defaultValue ?? opts.currentValue ?? ''}" 
               placeholder="${opts.placeholder || ''}" autofocus>
      </div>
      <div class="modal-footer">
        <button class="btn-sm btn-outline" id="${id}-cancel">Cancel</button>
        <button class="btn-sm btn-accent" id="${id}-submit">${opts.submitLabel || 'Apply'}</button>
      </div>
    `;
    openModal({ id, title: opts.title || 'Enter Value', body, size: 'sm' });

    const input = document.getElementById(`${id}-input`);
    input?.focus();
    input?.select();

    const submit = () => {
      const val = input?.value;
      closeModal(id);
      resolve(val === '' ? null : val);
    };

    document.getElementById(`${id}-submit`)?.addEventListener('click', submit);
    document.getElementById(`${id}-cancel`)?.addEventListener('click', () => { closeModal(id); resolve(null); });
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { closeModal(id); resolve(null); } });
  });
}
