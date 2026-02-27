// src/services/theme.service.js
// Theme management — presets, custom themes, layout persistence.
// Themes and layout are saved to the character document in Firestore.

// ─── Preset Themes ────────────────────────────────────────────────
export const PRESET_THEMES = [
  {
    id: 'dark-red',
    name: 'Crimson Tower',
    preview: ['#09090b', '#c23030'],
    vars: {} // Default — uses variables.css as-is
  },
  {
    id: 'dark-gold',
    name: 'Dark Gold',
    preview: ['#0C0A09', '#F59E0B'],
    vars: {
      '--bg-primary': '#0C0A09',
      '--bg-secondary': '#1C1917',
      '--bg-tertiary': '#292524',
      '--bg-elevated': '#2a2520',
      '--bg-hover': '#332d26',
      '--bg-input': '#0f0d0a',
      '--bg-widget': '#100e0b',
      '--border-color': '#2e2a24',
      '--border-subtle': '#1e1b16',
      '--border-strong': '#3d3830',
      '--text-primary': '#d4d0c8',
      '--text-secondary': '#a09882',
      '--text-muted': '#5c5548',
      '--text-bright': '#f5f0e8',
      '--accent': '#F59E0B',
      '--accent-hover': '#FBBF24',
      '--accent-muted': 'rgba(245,158,11,0.08)',
      '--accent-strong': '#d48a09',
      '--accent-text': '#F59E0B',
      '--highlight': '#F59E0B',
      '--highlight-text': '#0C0A09',
      '--white-accent': 'rgba(245,200,100,0.85)',
      '--glow-color': 'rgba(245,158,11,0.04)',
      '--danger': '#ef4444',
      '--success': '#34d399',
      '--warning': '#fbbf24'
    }
  },
  {
    id: 'navy-blue',
    name: 'Deep Sea',
    preview: ['#0d1117', '#58a6ff'],
    vars: {
      '--bg-primary': '#0d1117',
      '--bg-secondary': '#161b22',
      '--bg-tertiary': '#21262d',
      '--bg-elevated': '#282e38',
      '--bg-hover': '#2d333b',
      '--bg-input': '#0a0e14',
      '--bg-widget': '#0e1218',
      '--border-color': '#21262d',
      '--border-subtle': '#161b22',
      '--border-strong': '#363d48',
      '--text-primary': '#c9d1d9',
      '--text-secondary': '#8b949e',
      '--text-muted': '#484f58',
      '--text-bright': '#f0f6fc',
      '--accent': '#58a6ff',
      '--accent-hover': '#79b8ff',
      '--accent-muted': 'rgba(88,166,255,0.08)',
      '--accent-strong': '#388bfd',
      '--accent-text': '#58a6ff',
      '--highlight': '#58a6ff',
      '--highlight-text': '#0d1117',
      '--white-accent': 'rgba(150,200,255,0.85)',
      '--glow-color': 'rgba(88,166,255,0.04)',
      '--danger': '#f85149',
      '--success': '#2ea043',
      '--warning': '#e3b341'
    }
  },
  {
    id: 'ashen-ember',
    name: 'Ashen Ember',
    preview: ['#121212', '#F44336'],
    vars: {
      '--bg-primary': '#121212',
      '--bg-secondary': '#1E1E1E',
      '--bg-tertiary': '#282828',
      '--bg-elevated': '#2e2e2e',
      '--bg-hover': '#333333',
      '--bg-input': '#0e0e0e',
      '--bg-widget': '#151515',
      '--border-color': '#2a2a2a',
      '--border-subtle': '#1a1a1a',
      '--border-strong': '#3a3a3a',
      '--text-primary': '#EAEAEA',
      '--text-secondary': '#A0A0A0',
      '--text-muted': '#5a5a5a',
      '--text-bright': '#ffffff',
      '--accent': '#F44336',
      '--accent-hover': '#ff5252',
      '--accent-muted': 'rgba(244,67,54,0.08)',
      '--accent-strong': '#d32f2f',
      '--accent-text': '#F44336',
      '--highlight': '#F44336',
      '--highlight-text': '#ffffff',
      '--white-accent': 'rgba(255,180,170,0.85)',
      '--glow-color': 'rgba(244,67,54,0.04)',
      '--danger': '#ef5350',
      '--success': '#66bb6a',
      '--warning': '#ffa726'
    }
  },
  {
    id: 'violet-dusk',
    name: 'Violet Dusk',
    preview: ['#0f0a18', '#a855f7'],
    vars: {
      '--bg-primary': '#0f0a18',
      '--bg-secondary': '#16101f',
      '--bg-tertiary': '#1e1628',
      '--bg-elevated': '#251d30',
      '--bg-hover': '#2c2238',
      '--bg-input': '#0b0712',
      '--bg-widget': '#110c1a',
      '--border-color': '#221a2e',
      '--border-subtle': '#181120',
      '--border-strong': '#342a42',
      '--text-primary': '#d4cce0',
      '--text-secondary': '#9088a0',
      '--text-muted': '#524a62',
      '--text-bright': '#f0ecf5',
      '--accent': '#a855f7',
      '--accent-hover': '#c084fc',
      '--accent-muted': 'rgba(168,85,247,0.08)',
      '--accent-strong': '#9333ea',
      '--accent-text': '#a855f7',
      '--highlight': '#a855f7',
      '--highlight-text': '#f0ecf5',
      '--white-accent': 'rgba(200,170,255,0.85)',
      '--glow-color': 'rgba(168,85,247,0.04)',
      '--danger': '#ef4444',
      '--success': '#34d399',
      '--warning': '#fbbf24'
    }
  },
  {
    id: 'emerald-night',
    name: 'Emerald Night',
    preview: ['#0a100e', '#10b981'],
    vars: {
      '--bg-primary': '#0a100e',
      '--bg-secondary': '#101a16',
      '--bg-tertiary': '#16221e',
      '--bg-elevated': '#1c2a25',
      '--bg-hover': '#22332c',
      '--bg-input': '#070d0b',
      '--bg-widget': '#0c1210',
      '--border-color': '#1a2822',
      '--border-subtle': '#121e1a',
      '--border-strong': '#2a3e36',
      '--text-primary': '#c8dcd4',
      '--text-secondary': '#82a898',
      '--text-muted': '#4a6a5c',
      '--text-bright': '#ecf5f0',
      '--accent': '#10b981',
      '--accent-hover': '#34d399',
      '--accent-muted': 'rgba(16,185,129,0.08)',
      '--accent-strong': '#059669',
      '--accent-text': '#10b981',
      '--highlight': '#10b981',
      '--highlight-text': '#0a100e',
      '--white-accent': 'rgba(150,240,200,0.85)',
      '--glow-color': 'rgba(16,185,129,0.04)',
      '--danger': '#ef4444',
      '--success': '#10b981',
      '--warning': '#fbbf24'
    }
  }
];

// ─── Layout Presets ────────────────────────────────────────────────
// Grid is 12 columns. Each preset defines widget → { col, span } per row.
export const LAYOUT_PRESETS = [
  {
    id: 'default',
    name: 'Standard',
    description: 'Combat + Equipment up top, Stats + Skills + Resources mid, Traits + Identity + Notes bottom.',
    grid: {
      'top-stats-widget':  { col: 1, span: 5, row: 1 },
      'equipment-widget':  { col: 6, span: 7, row: 1 },
      'stats-widget':      { col: 1, span: 5, row: 2 },
      'skills-widget':     { col: 6, span: 4, row: 2 },
      'resources-widget':  { col: 10, span: 3, row: 2 },
      'traits-widget':     { col: 1, span: 4, row: 3 },
      'identity-widget':   { col: 5, span: 4, row: 3 },
      'backstory-widget':  { col: 9, span: 4, row: 3 }
    }
  },
  {
    id: 'combat-focus',
    name: 'Combat Focus',
    description: 'Wide combat and skills on top, everything else below.',
    grid: {
      'top-stats-widget':  { col: 1, span: 6, row: 1 },
      'skills-widget':     { col: 7, span: 6, row: 1 },
      'equipment-widget':  { col: 1, span: 6, row: 2 },
      'stats-widget':      { col: 7, span: 3, row: 2 },
      'resources-widget':  { col: 10, span: 3, row: 2 },
      'traits-widget':     { col: 1, span: 4, row: 3 },
      'identity-widget':   { col: 5, span: 4, row: 3 },
      'backstory-widget':  { col: 9, span: 4, row: 3 }
    }
  },
  {
    id: 'wide-stats',
    name: 'Stats Overview',
    description: 'Full-width stats bar, equipment and skills side by side.',
    grid: {
      'stats-widget':      { col: 1, span: 12, row: 1 },
      'top-stats-widget':  { col: 1, span: 4, row: 2 },
      'equipment-widget':  { col: 5, span: 4, row: 2 },
      'skills-widget':     { col: 9, span: 4, row: 2 },
      'resources-widget':  { col: 1, span: 3, row: 3 },
      'traits-widget':     { col: 4, span: 3, row: 3 },
      'identity-widget':   { col: 7, span: 3, row: 3 },
      'backstory-widget':  { col: 10, span: 3, row: 3 }
    }
  }
];

// ─── Apply Theme ──────────────────────────────────────────────────
export function applyTheme(themeId, customVars) {
  const root = document.documentElement;
  const preset = PRESET_THEMES.find(t => t.id === themeId);

  // If it's a preset with vars, apply them
  const vars = customVars || preset?.vars || {};

  // Reset to defaults first (remove inline overrides)
  const allVarNames = new Set();
  PRESET_THEMES.forEach(t => Object.keys(t.vars).forEach(k => allVarNames.add(k)));
  allVarNames.forEach(k => root.style.removeProperty(k));

  // Apply new vars
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }

  // Set data-theme for any CSS that keys off it
  document.body.dataset.theme = themeId || 'custom';
}

// ─── Apply Layout ─────────────────────────────────────────────────
export function applyLayout(layoutConfig) {
  if (!layoutConfig) return;

  const widgets = document.querySelectorAll('.dashboard .widget');
  widgets.forEach(w => {
    w.style.removeProperty('grid-column');
    w.style.removeProperty('grid-row');
  });

  for (const [widgetId, pos] of Object.entries(layoutConfig)) {
    const widget = document.getElementById(widgetId);
    if (!widget) continue;
    widget.style.gridColumn = `${pos.col} / span ${pos.span}`;
    // Optionally set row order
    if (pos.row) widget.style.gridRow = pos.row;
  }
}

// ─── Build Custom Theme from Current CSS Vars ─────────────────────
export function getCurrentThemeVars() {
  const computed = getComputedStyle(document.documentElement);
  const vars = {};
  const varNames = [
    '--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-elevated',
    '--bg-hover', '--bg-input', '--bg-widget',
    '--border-color', '--border-subtle', '--border-strong',
    '--text-primary', '--text-secondary', '--text-muted', '--text-bright',
    '--accent', '--accent-hover', '--accent-muted', '--accent-strong', '--accent-text',
    '--highlight', '--highlight-text',
    '--white-accent', '--glow-color',
    '--danger', '--success', '--warning'
  ];
  for (const name of varNames) {
    vars[name] = computed.getPropertyValue(name).trim();
  }
  return vars;
}
