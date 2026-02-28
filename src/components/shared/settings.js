// src/components/shared/settings.js
// Settings modal — theme picker, custom theme creator, layout presets.

import { openModal, closeModal, getModalBody, showConfirmation } from './modal.js';
import { showNotification } from './notification.js';
import { PRESET_THEMES, LAYOUT_PRESETS, applyTheme, applyLayout, getCurrentThemeVars } from '../../services/theme.service.js';

export function openSettingsModal(char, onSave) {
  const customThemes = char.customThemes || [];
  const bodyEl = document.createElement('div');

  // ── EVENT DELEGATION on bodyEl ──
  // bodyEl persists for the lifetime of the modal.
  // Inner elements (grids) are rebuilt on each render() call,
  // so we MUST delegate from bodyEl, not from the grids themselves.
  bodyEl.addEventListener('click', (e) => {
    // ── Theme delete button ──
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      handleDeleteTheme(parseInt(deleteBtn.dataset.deleteIdx));
      return;
    }

    // ── Theme swatch click ──
    const swatch = e.target.closest('.theme-swatch');
    if (swatch) {
      const tid = swatch.dataset.themeId;
      if (!tid) return;

      if (tid.startsWith('custom-')) {
        const idx = parseInt(tid.split('-')[1]);
        const ct = customThemes[idx];
        if (ct) {
          applyTheme(null, ct.vars);
          char.appliedTheme = tid;
          char.appliedThemeVars = ct.vars;
        }
      } else {
        const preset = PRESET_THEMES.find(p => p.id === tid);
        applyTheme(tid, preset?.vars && Object.keys(preset.vars).length > 0 ? preset.vars : null);
        char.appliedTheme = tid;
        char.appliedThemeVars = null;
      }

      onSave({
        appliedTheme: char.appliedTheme,
        appliedThemeVars: char.appliedThemeVars || null,
        customThemes
      });
      showNotification('Theme applied', 'success');
      render();
      return;
    }

    // ── Layout option click ──
    const layoutOpt = e.target.closest('.layout-option');
    if (layoutOpt) {
      const lid = layoutOpt.dataset.layoutId;
      const preset = LAYOUT_PRESETS.find(l => l.id === lid);
      if (!preset) return;
      applyLayout(preset.grid);
      char.layoutPreset = lid;
      onSave({ layoutPreset: lid });
      showNotification(`Layout: ${preset.name}`, 'success');
      render();
      return;
    }

    // ── Preview custom theme ──
    if (e.target.id === 'btn-preview-custom' || e.target.closest('#btn-preview-custom')) {
      applyTheme(null, getCustomVarsFromForm());
      return;
    }

    // ── Save custom theme ──
    if (e.target.id === 'btn-save-custom-theme' || e.target.closest('#btn-save-custom-theme')) {
      openCustomThemeNameModal();
      return;
    }
  });

  function render() {
    const activeThemeId = char.appliedTheme || 'dark-red';
    const activeLayoutId = char.layoutPreset || 'default';

    // Build theme swatches
    const allThemes = [...PRESET_THEMES, ...customThemes.map((t, i) => ({ ...t, isCustom: true, customIndex: i }))];
    const swatchesHtml = allThemes.map(t => {
      const colors = t.preview || [t.vars?.['--bg-primary'] || '#111', t.vars?.['--accent'] || '#fff'];
      const swatchId = t.isCustom ? 'custom-' + t.customIndex : t.id;
      const isActive = swatchId === activeThemeId;
      return `
        <div class="theme-swatch ${isActive ? 'active' : ''}" data-theme-id="${swatchId}">
          <div class="theme-swatch-colors">
            <div style="background: ${colors[0]};"></div>
            <div style="background: ${colors[1]};"></div>
          </div>
          <div class="theme-swatch-label">${esc(t.name || 'Custom')}</div>
          ${t.isCustom ? `<button class="delete-btn" data-delete-idx="${t.customIndex}">×</button>` : ''}
        </div>`;
    }).join('');

    // Build layout options
    const layoutsHtml = LAYOUT_PRESETS.map(lp => {
      const isActive = activeLayoutId === lp.id;
      let miniBlocks = '';
      for (const [wid, pos] of Object.entries(lp.grid)) {
        miniBlocks += `<div class="layout-mini-block" style="grid-column: ${pos.col} / span ${pos.span}; grid-row: ${pos.row};"></div>`;
      }
      return `
        <div class="layout-option ${isActive ? 'active' : ''}" data-layout-id="${lp.id}">
          <div class="layout-mini-preview">${miniBlocks}</div>
          <div class="layout-option-name">${esc(lp.name)}</div>
          <div class="layout-option-desc">${esc(lp.description)}</div>
        </div>`;
    }).join('');

    bodyEl.innerHTML = `
      <div class="settings-section">
        <div class="settings-section-title">Color Theme</div>
        <div class="theme-picker-grid">${swatchesHtml}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Create Custom Theme</div>
        <div class="custom-theme-grid" id="custom-color-grid">
          <div class="color-field"><label>Accent</label><input type="color" data-var="--accent" value="${rgbToHex(getCssVar('--accent'))}"></div>
          <div class="color-field"><label>Highlight</label><input type="color" data-var="--highlight" value="${rgbToHex(getCssVar('--highlight'))}"></div>
          <div class="color-field"><label>Accent Text</label><input type="color" data-var="--accent-text" value="${rgbToHex(getCssVar('--accent-text'))}"></div>
          <div class="color-field"><label>Primary BG</label><input type="color" data-var="--bg-primary" value="${rgbToHex(getCssVar('--bg-primary'))}"></div>
          <div class="color-field"><label>Secondary BG</label><input type="color" data-var="--bg-secondary" value="${rgbToHex(getCssVar('--bg-secondary'))}"></div>
          <div class="color-field"><label>Widget BG</label><input type="color" data-var="--bg-widget" value="${rgbToHex(getCssVar('--bg-widget'))}"></div>
          <div class="color-field"><label>Text Primary</label><input type="color" data-var="--text-primary" value="${rgbToHex(getCssVar('--text-primary'))}"></div>
          <div class="color-field"><label>Text Muted</label><input type="color" data-var="--text-muted" value="${rgbToHex(getCssVar('--text-muted'))}"></div>
          <div class="color-field"><label>Border</label><input type="color" data-var="--border-color" value="${rgbToHex(getCssVar('--border-color'))}"></div>
        </div>
        <div class="custom-theme-actions">
          <button class="btn-sm btn-accent" id="btn-save-custom-theme">Save as Custom Theme</button>
          <button class="btn-sm btn-ghost" id="btn-preview-custom">Preview</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">Widget Layout</div>
        <div class="layout-picker-grid">${layoutsHtml}</div>
      </div>
    `;
  }

  async function handleDeleteTheme(idx) {
    const name = customThemes[idx]?.name || 'this theme';
    const yes = await showConfirmation(`Delete "${name}"?`, { danger: true });
    if (!yes) return;
    customThemes.splice(idx, 1);
    char.customThemes = customThemes;
    if (char.appliedTheme === `custom-${idx}`) {
      char.appliedTheme = 'dark-red';
      char.appliedThemeVars = null;
      applyTheme('dark-red');
    }
    onSave({ customThemes, appliedTheme: char.appliedTheme, appliedThemeVars: char.appliedThemeVars });
    showNotification('Theme deleted.', 'success');
    render();
  }

  function openCustomThemeNameModal() {
    const inputBody = document.createElement('div');
    inputBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase;">Theme Name</label>
        <input type="text" id="custom-theme-name-input" value="Custom ${customThemes.length + 1}" placeholder="Enter theme name..." style="width: 100%;">
        <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
          <button class="btn-sm btn-ghost" id="ctn-cancel">Cancel</button>
          <button class="btn-sm btn-accent" id="ctn-save">Save</button>
        </div>
      </div>
    `;
    openModal({ id: 'custom-theme-name', title: 'Save Custom Theme', body: inputBody, size: 'sm' });
    const doSave = () => {
      const name = inputBody.querySelector('#custom-theme-name-input')?.value?.trim();
      if (!name) return;
      closeModal('custom-theme-name');
      const vars = getCustomVarsFromForm();
      customThemes.push({ id: `custom-${Date.now()}`, name, vars, preview: [vars['--bg-primary'], vars['--accent']] });
      char.customThemes = customThemes;
      char.appliedTheme = `custom-${customThemes.length - 1}`;
      char.appliedThemeVars = vars;
      applyTheme(null, vars);
      onSave({ appliedTheme: char.appliedTheme, appliedThemeVars: vars, customThemes });
      showNotification(`Theme "${name}" saved!`, 'success');
      render();
    };
    inputBody.querySelector('#ctn-save')?.addEventListener('click', doSave);
    inputBody.querySelector('#ctn-cancel')?.addEventListener('click', () => closeModal('custom-theme-name'));
    inputBody.querySelector('#custom-theme-name-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    setTimeout(() => inputBody.querySelector('#custom-theme-name-input')?.focus(), 100);
  }

  function getCustomVarsFromForm() {
    const vars = getCurrentThemeVars();
    bodyEl.querySelectorAll('#custom-color-grid input[type="color"]').forEach(input => {
      vars[input.dataset.var] = input.value;
      if (input.dataset.var === '--accent') {
        vars['--accent-hover'] = lighten(input.value, 20);
        vars['--accent-muted'] = input.value + '14';
        vars['--accent-strong'] = darken(input.value, 15);
      }
      if (input.dataset.var === '--bg-primary') {
        vars['--bg-input'] = darken(input.value, 5);
      }
    });
    return vars;
  }

  render();
  openModal({ id: 'settings', title: 'Settings', body: bodyEl, size: 'lg' });
}

// ─── Helpers ──────────────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function getCssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

function rgbToHex(color) {
  if (!color) return '#000000';
  color = color.trim();
  if (color.startsWith('#')) {
    if (color.length === 4) return '#' + color[1]+color[1] + color[2]+color[2] + color[3]+color[3];
    return color.substring(0, 7);
  }
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) return '#' + [match[1], match[2], match[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  return '#000000';
}

function lighten(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  return '#' + [num >> 16, (num >> 8) & 0xff, num & 0xff]
    .map(c => Math.min(255, c + Math.round(255 * percent / 100)).toString(16).padStart(2, '0')).join('');
}

function darken(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  return '#' + [num >> 16, (num >> 8) & 0xff, num & 0xff]
    .map(c => Math.max(0, c - Math.round(255 * percent / 100)).toString(16).padStart(2, '0')).join('');
}
