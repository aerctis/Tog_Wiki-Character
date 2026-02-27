// src/components/shared/settings.js
// Settings modal — theme picker, custom theme creator, layout presets.
// Call openSettingsModal(char, onSave) from sheet.js.

import { openModal, closeModal, getModalBody, showConfirmation } from './modal.js';
import { showNotification } from './notification.js';
import { PRESET_THEMES, LAYOUT_PRESETS, applyTheme, applyLayout, getCurrentThemeVars } from '../../services/theme.service.js';

/**
 * Open the settings modal.
 * @param {object} char — character data (has .appliedTheme, .customThemes, .layoutPreset, .customLayout)
 * @param {function} onSave — called with updated char fields to persist
 */
export function openSettingsModal(char, onSave) {
  const currentThemeId = char.appliedTheme || 'dark-red';
  const customThemes = char.customThemes || [];
  const currentLayoutId = char.layoutPreset || 'default';

  const bodyEl = document.createElement('div');

  function render() {
    bodyEl.innerHTML = `
      <!-- THEME SECTION -->
      <div class="settings-section">
        <div class="settings-section-title">Color Theme</div>
        <div class="theme-picker-grid" id="theme-grid"></div>
      </div>

      <!-- CUSTOM THEME CREATOR -->
      <div class="settings-section">
        <div class="settings-section-title">Create Custom Theme</div>
        <div class="custom-theme-grid" id="custom-color-grid">
          <div class="color-field">
            <label>Accent</label>
            <input type="color" data-var="--accent" value="${rgbToHex(getCssVar('--accent'))}">
          </div>
          <div class="color-field">
            <label>Highlight</label>
            <input type="color" data-var="--highlight" value="${rgbToHex(getCssVar('--highlight'))}">
          </div>
          <div class="color-field">
            <label>Accent Text</label>
            <input type="color" data-var="--accent-text" value="${rgbToHex(getCssVar('--accent-text'))}">
          </div>
          <div class="color-field">
            <label>Primary BG</label>
            <input type="color" data-var="--bg-primary" value="${rgbToHex(getCssVar('--bg-primary'))}">
          </div>
          <div class="color-field">
            <label>Secondary BG</label>
            <input type="color" data-var="--bg-secondary" value="${rgbToHex(getCssVar('--bg-secondary'))}">
          </div>
          <div class="color-field">
            <label>Widget BG</label>
            <input type="color" data-var="--bg-widget" value="${rgbToHex(getCssVar('--bg-widget'))}">
          </div>
          <div class="color-field">
            <label>Text Primary</label>
            <input type="color" data-var="--text-primary" value="${rgbToHex(getCssVar('--text-primary'))}">
          </div>
          <div class="color-field">
            <label>Text Muted</label>
            <input type="color" data-var="--text-muted" value="${rgbToHex(getCssVar('--text-muted'))}">
          </div>
          <div class="color-field">
            <label>Border</label>
            <input type="color" data-var="--border-color" value="${rgbToHex(getCssVar('--border-color'))}">
          </div>
        </div>
        <div class="custom-theme-actions">
          <button class="btn-sm btn-accent" id="btn-save-custom-theme">Save as Custom Theme</button>
          <button class="btn-sm btn-ghost" id="btn-preview-custom">Preview</button>
        </div>
      </div>

      <!-- LAYOUT SECTION -->
      <div class="settings-section">
        <div class="settings-section-title">Widget Layout</div>
        <div class="layout-picker-grid" id="layout-grid"></div>
      </div>
    `;

    // ── Render Theme Swatches ──
    const themeGrid = bodyEl.querySelector('#theme-grid');
    const allThemes = [...PRESET_THEMES, ...customThemes.map((t, i) => ({ ...t, isCustom: true, customIndex: i }))];

    themeGrid.innerHTML = allThemes.map(t => {
      const colors = t.preview || [t.vars?.['--bg-primary'] || '#111', t.vars?.['--accent'] || '#fff'];
      const isActive = (t.id === currentThemeId) || (t.isCustom && char.appliedTheme === `custom-${t.customIndex}`);
      return `
        <div class="theme-swatch ${isActive ? 'active' : ''}" data-theme-id="${t.isCustom ? 'custom-' + t.customIndex : t.id}">
          <div class="theme-swatch-colors">
            <div style="background: ${colors[0]};"></div>
            <div style="background: ${colors[1]};"></div>
          </div>
          <div class="theme-swatch-label">${esc(t.name || 'Custom')}</div>
          ${t.isCustom ? `<button class="delete-btn" data-delete-idx="${t.customIndex}">&times;</button>` : ''}
        </div>`;
    }).join('');

    // Theme swatch clicks
    themeGrid.querySelectorAll('.theme-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        const tid = swatch.dataset.themeId;

        if (tid.startsWith('custom-')) {
          const idx = parseInt(tid.split('-')[1]);
          const ct = customThemes[idx];
          if (ct) {
            applyTheme(null, ct.vars);
            char.appliedTheme = tid;
            char.appliedThemeVars = ct.vars;
          }
        } else {
          applyTheme(tid);
          char.appliedTheme = tid;
          char.appliedThemeVars = null;
        }

        onSave({
          appliedTheme: char.appliedTheme,
          appliedThemeVars: char.appliedThemeVars || null,
          customThemes
        });

        render(); // re-render to update active state
      });
    });

    // Delete custom theme
    themeGrid.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.deleteIdx);
        const name = customThemes[idx]?.name || 'this theme';
        const yes = await showConfirmation(`Delete "${name}"?`, { danger: true });
        if (!yes) return;
        customThemes.splice(idx, 1);
        char.customThemes = customThemes;
        onSave({ customThemes });
        showNotification('Theme deleted.', 'success');
        render();
      });
    });

    // ── Custom Theme Creator ──
    // Live preview
    bodyEl.querySelector('#btn-preview-custom')?.addEventListener('click', () => {
      const vars = getCustomVarsFromForm();
      applyTheme(null, vars);
    });

    // Save custom theme
    bodyEl.querySelector('#btn-save-custom-theme')?.addEventListener('click', () => {
      // Use custom input modal instead of browser prompt
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
        const newTheme = {
          id: `custom-${Date.now()}`,
          name,
          vars,
          preview: [vars['--bg-primary'], vars['--accent']]
        };
        customThemes.push(newTheme);
        char.customThemes = customThemes;
        char.appliedTheme = `custom-${customThemes.length - 1}`;
        char.appliedThemeVars = vars;
        applyTheme(null, vars);
        onSave({
          appliedTheme: char.appliedTheme,
          appliedThemeVars: vars,
          customThemes
        });
        showNotification(`Theme "${name}" saved!`, 'success');
        render();
      };

      inputBody.querySelector('#ctn-save')?.addEventListener('click', doSave);
      inputBody.querySelector('#ctn-cancel')?.addEventListener('click', () => closeModal('custom-theme-name'));
      // Allow Enter key
      inputBody.querySelector('#custom-theme-name-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSave();
      });
      // Focus the input
      setTimeout(() => inputBody.querySelector('#custom-theme-name-input')?.focus(), 100);
    });

    // ── Render Layout Presets ──
    const layoutGrid = bodyEl.querySelector('#layout-grid');
    layoutGrid.innerHTML = LAYOUT_PRESETS.map(lp => {
      const isActive = currentLayoutId === lp.id || char.layoutPreset === lp.id;
      // Build mini-preview
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

    layoutGrid.querySelectorAll('.layout-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const lid = opt.dataset.layoutId;
        const preset = LAYOUT_PRESETS.find(l => l.id === lid);
        if (!preset) return;

        applyLayout(preset.grid);
        char.layoutPreset = lid;

        onSave({ layoutPreset: lid });
        showNotification(`Layout: ${preset.name}`, 'success');
        render();
      });
    });
  }

  function getCustomVarsFromForm() {
    const vars = getCurrentThemeVars(); // start from current
    bodyEl.querySelectorAll('#custom-color-grid input[type="color"]').forEach(input => {
      vars[input.dataset.var] = input.value;
      // Auto-derive related vars
      if (input.dataset.var === '--accent') {
        vars['--accent-hover'] = lighten(input.value, 20);
        vars['--accent-muted'] = input.value + '14'; // ~8% alpha
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

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function rgbToHex(color) {
  if (!color) return '#000000';
  color = color.trim();
  if (color.startsWith('#')) {
    // Ensure 6-digit hex
    if (color.length === 4) {
      return '#' + color[1]+color[1] + color[2]+color[2] + color[3]+color[3];
    }
    return color.substring(0, 7); // strip alpha if present
  }
  // Handle rgb() or rgba()
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    return '#' + [match[1], match[2], match[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}

function lighten(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * percent / 100));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function darken(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * percent / 100));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
