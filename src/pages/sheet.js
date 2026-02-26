// src/pages/sheet.js
// Character Sheet page controller
// Orchestrates: auth check → data load → compute → render → handle events → save
import { waitForAuth, signOut, isCurrentUserAdmin, onAuthChange } from '../services/auth.service.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';
import { AUTOSAVE_DELAY, STATS } from '../config/constants.js';

// ─── State ────────────────────────────────────────────────────────
// Page-level state — the single source of truth while this page is active.
// Loaded from Firestore, mutated by user actions, saved back on changes.
let characterData = null;
let libraries = { skills: [], items: [], beasts: [] };
let computedStats = {};
let saveTimeout = null;
let isDirty = false;

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  initNotifications();

  // Auth gate — redirect to login if not authenticated
  const user = await waitForAuth();
  if (!user) {
    window.location.href = '/';
    return;
  }

  // Set user display
  document.getElementById('user-display-name').textContent = user.displayName || 'Unnamed';

  // Show admin nav if applicable
  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) {
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = '';
  }

  // Wire up header buttons
  document.getElementById('btn-sign-out').addEventListener('click', handleSignOut);

  // Load data and render
  await loadAllData(user.uid);
  recalculateAndRender();

  console.log('Sheet initialized for', user.displayName);
}

// ─── Data Loading ─────────────────────────────────────────────────
async function loadAllData(uid) {
  // TODO: Phase 3 — load from Firestore via services
  // For now, initialize with defaults so the page renders
  characterData = getDefaultCharacterData(uid);

  showNotification('Character sheet loaded', 'success');
}

function getDefaultCharacterData(uid) {
  return {
    uid,
    name: '',
    race: '',
    position: 'Guide',
    level: 1,
    floor: 1,
    currentHP: 0,
    statMultiplier: 2.0,
    manualStatPoints: Object.fromEntries(STATS.map(s => [s, 0])),
    bonusStatPoints: 0,
    affinities: { primary: [], secondary: [], tertiary: [] },
    equipment: {
      weapon1: null, weapon2: null, armor: null,
      accessory1: null, accessory2: null,
      lighthouse1: null, lighthouse2: null,
      beast1: null, beast2: null
    },
    selectedWeaponSlot: null,
    ownedItems: [],
    ownedBeasts: {},
    beastPoints: 0,
    skillsByTier: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    bonusSkillPoints: 0,
    proficientCategories: [],
    proficientSkills: [],
    currency: 0,
    specialItems: [],
    backstory: ''
  };
}

// ─── Compute & Render ─────────────────────────────────────────────
function recalculateAndRender() {
  // TODO: Phase 2 — call system modules for stat calculation, skill effects, combat math
  // For now, just render the shell
  renderAllWidgets();
}

function renderAllWidgets() {
  // TODO: Phase 4 — call each widget's render function
  // Placeholder rendering for now
  renderIdentityWidget();
  renderProgressionWidget();
  renderBackstoryWidget();
}

// ─── Widget Renderers (temporary — will be moved to component files) ──
function renderIdentityWidget() {
  const container = document.getElementById('identity-content');
  if (!container || !characterData) return;

  container.innerHTML = `
    <div class="field-group">
      <label for="char-name">Name</label>
      <input type="text" id="char-name" value="${characterData.name}" placeholder="Character name...">
    </div>
    <div class="field-group">
      <label for="char-race">Race</label>
      <input type="text" id="char-race" value="${characterData.race}" placeholder="Race...">
    </div>
    <div class="field-group">
      <label for="char-position">Position</label>
      <select id="char-position">
        ${['Guide', 'Fisherman', 'Spear Bearer', 'Wave Controller', 'Light Bearer', 'Anima']
          .map(p => `<option value="${p}" ${characterData.position === p ? 'selected' : ''}>${p}</option>`)
          .join('')}
      </select>
    </div>
  `;

  // Attach change handlers
  container.querySelector('#char-name').addEventListener('input', (e) => {
    characterData.name = e.target.value;
    queueAutoSave();
  });
  container.querySelector('#char-race').addEventListener('input', (e) => {
    characterData.race = e.target.value;
    queueAutoSave();
  });
  container.querySelector('#char-position').addEventListener('change', (e) => {
    characterData.position = e.target.value;
    handleInputChange();
  });
}

function renderProgressionWidget() {
  const container = document.getElementById('progression-content');
  if (!container || !characterData) return;

  container.innerHTML = `
    <div class="field-row">
      <div class="field-group">
        <label for="char-level">Level</label>
        <input type="number" id="char-level" value="${characterData.level}" min="1" readonly>
      </div>
      <div class="field-group">
        <label for="char-floor">Floor</label>
        <input type="number" id="char-floor" value="${characterData.floor}" min="1" readonly>
      </div>
    </div>
    <p style="color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-3);">
      Level and floor are managed by the Game Master.
    </p>
  `;
}

function renderBackstoryWidget() {
  const container = document.getElementById('backstory-content');
  if (!container || !characterData) return;

  container.innerHTML = `
    <textarea id="backstory-textarea" placeholder="Write your character's backstory and notes..."
      style="width: 100%; min-height: 200px; resize: vertical;">${characterData.backstory}</textarea>
  `;

  container.querySelector('#backstory-textarea').addEventListener('input', (e) => {
    characterData.backstory = e.target.value;
    queueAutoSave();
  });
}

// ─── Save ─────────────────────────────────────────────────────────
function handleInputChange() {
  recalculateAndRender();
  queueAutoSave();
}

function queueAutoSave() {
  isDirty = true;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    if (isDirty) {
      saveCharacter();
      isDirty = false;
    }
  }, AUTOSAVE_DELAY);
}

async function saveCharacter() {
  // TODO: Phase 3 — save via character.service
  console.log('Auto-saving character...', new Date().toLocaleTimeString());
  showNotification('Character saved!', 'success');
}

// ─── Navigation ───────────────────────────────────────────────────
async function handleSignOut() {
  try {
    await signOut();
    window.location.href = '/';
  } catch (error) {
    showNotification('Sign out failed', 'danger');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────
init();
