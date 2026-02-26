// src/pages/sheet.js
// Character Sheet — main page controller.
// Loads data from Firestore, computes via game systems, renders widgets, saves on changes.

import { waitForAuth, signOut, isCurrentUserAdmin, onAuthChange } from '../services/auth.service.js';
import { loadCharacter, saveCharacter, getDefaultCharacterData, buildSavePayload } from '../services/character.service.js';
import { fetchAllLibraries, listenToGameSettings } from '../services/library.service.js';
import { calculateBaseStats, calculateTotalStats, calculateStatCap, wouldExceedCap, calculateAvailableStatPoints } from '../systems/stat-calculator.js';
import { aggregateSkillBonuses, calculateUsedSkillPoints, calculateAvailableSkillPoints, calculateSpirit } from '../systems/skill-engine.js';
import { calculateMaxHP, calculateHitDice, calculateSpeed, calculateAttack, calculateDefense } from '../systems/combat-math.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';
import { STATS, AUTOSAVE_DELAY, POSITIONS } from '../config/constants.js';

// ─── Page State ───────────────────────────────────────────────────
let char = null;        // Character data (loaded from Firestore, mutated locally)
let libs = { skills: [], items: [], beasts: [] };
let computed = {};      // Derived values (stats, HP, etc.)
let saveTimeout = null;
let isDirty = false;
let currentUser = null;

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  initNotifications();

  const user = await waitForAuth();
  if (!user) { window.location.href = '/'; return; }
  currentUser = user;

  document.getElementById('user-display-name').textContent = user.displayName || 'Unnamed';
  document.getElementById('btn-sign-out').addEventListener('click', handleSignOut);

  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) {
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = '';
  }

  // Load data
  const [rawChar, libraries] = await Promise.all([
    loadCharacter(user.uid),
    fetchAllLibraries()
  ]);

  libs = libraries;
  char = rawChar || getDefaultCharacterData(user.uid);

  // If no existing character, do initial save
  if (!rawChar) {
    await saveCharacter(user.uid, buildSavePayload(char));
  }

  recalculateAndRender();
  showNotification('Character loaded', 'success');
}

// ─── Compute ──────────────────────────────────────────────────────
function recalculate() {
  const c = char;

  // 1. Base stats from level/position/affinities + manual points
  const baseStats = calculateBaseStats(c.level, c.position, c.affinities, c.manualStatPoints);

  // 2. Skill bonuses
  const skillBonuses = aggregateSkillBonuses(c.skillsByTier, c.proficientSkills);

  // 3. Total stats
  const totalStats = calculateTotalStats(baseStats, skillBonuses);

  // 4. Stat cap
  const statCap = calculateStatCap(totalStats, c.statMultiplier);

  // 5. Available stat points
  const availableStatPoints = calculateAvailableStatPoints(c.level, c.manualStatPoints, c.bonusStatPoints);

  // 6. Skill points
  const usedSkillPoints = calculateUsedSkillPoints(c.skillsByTier, c.proficientCategories, c.proficientSkills);
  const availableSkillPoints = calculateAvailableSkillPoints(c.level, usedSkillPoints, c.bonusSkillPoints);

  // 7. Spirit
  const spirit = calculateSpirit(c.skillsByTier, c.equipment);

  // 8. Combat stats
  const maxHP = calculateMaxHP(totalStats, c.level, skillBonuses);
  if (c.currentHP === undefined || c.currentHP === 0 || c.currentHP > maxHP) {
    c.currentHP = maxHP;
  }

  const selectedWeapon = c.selectedWeaponSlot ? c.equipment[c.selectedWeaponSlot] : null;
  const hitDice = calculateHitDice(maxHP, c.position, totalStats);
  const speed = calculateSpeed(c.level, c.floor, totalStats, skillBonuses);
  const attack = calculateAttack(selectedWeapon, totalStats);
  const defense = calculateDefense(c.equipment.armor, totalStats);

  computed = {
    baseStats,
    skillBonuses,
    totalStats,
    statCap,
    availableStatPoints,
    usedSkillPoints,
    availableSkillPoints,
    spirit,
    maxHP,
    hitDice,
    speed,
    attack,
    defense
  };
}

// ─── Render ───────────────────────────────────────────────────────
function recalculateAndRender() {
  recalculate();
  renderIdentity();
  renderProgression();
  renderCombatStats();
  renderResources();
  renderAffinities();
  renderStatsTable();
  renderSkills();
  renderProficiencies();
  renderBackstory();
  renderEquipment();
}

function renderIdentity() {
  const el = document.getElementById('identity-content');
  if (!el) return;
  el.innerHTML = `
    <div class="field-group">
      <label for="char-name">Name</label>
      <input type="text" id="char-name" value="${char.name}" placeholder="Character name...">
    </div>
    <div class="field-group">
      <label for="char-race">Race</label>
      <input type="text" id="char-race" value="${char.race}" placeholder="Race...">
    </div>
    <div class="field-group">
      <label for="char-position">Position</label>
      <select id="char-position">
        ${POSITIONS.map(p => `<option value="${p}" ${char.position === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
  `;
  el.querySelector('#char-name').addEventListener('input', e => { char.name = e.target.value; queueSave(); });
  el.querySelector('#char-race').addEventListener('input', e => { char.race = e.target.value; queueSave(); });
  el.querySelector('#char-position').addEventListener('change', e => { char.position = e.target.value; onChange(); });
}

function renderProgression() {
  const el = document.getElementById('progression-content');
  if (!el) return;
  el.innerHTML = `
    <div class="field-row">
      <div class="field-group">
        <label>Level</label>
        <input type="number" value="${char.level}" min="1" readonly>
      </div>
      <div class="field-group">
        <label>Floor</label>
        <input type="number" value="${char.floor}" min="1" readonly>
      </div>
    </div>
    <p style="color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-3);">
      Level and floor are managed by the Game Master.
    </p>
  `;
}

function renderCombatStats() {
  const el = document.getElementById('top-stats-content');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card stat-card--wide">
      <div class="stat-label">Health</div>
      <div class="stat-value">${char.currentHP} / ${computed.maxHP}</div>
      <div class="hp-controls">
        <button id="hp-minus" class="btn-sm">−</button>
        <input type="number" id="hp-amount" class="hp-controls input" placeholder="Amt">
        <button id="hp-plus" class="btn-sm">+</button>
      </div>
    </div>
    <div class="top-stats-grid" style="margin-top: var(--space-3);">
      <div class="stat-card">
        <div class="stat-label">Hit Dice</div>
        <div class="stat-value stat-value--sm">${computed.hitDice.display}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Speed</div>
        <div class="stat-value">${computed.speed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Attack</div>
        <div class="stat-value">${computed.attack}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Defense</div>
        <div class="stat-value">${computed.defense}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Spirit</div>
        <div class="stat-value">${computed.spirit.current} / ${computed.spirit.max}</div>
      </div>
    </div>
  `;

  el.querySelector('#hp-minus').addEventListener('click', () => adjustHP(false));
  el.querySelector('#hp-plus').addEventListener('click', () => adjustHP(true));
}

function adjustHP(isHealing) {
  const input = document.getElementById('hp-amount');
  const amount = parseInt(input.value);
  if (isNaN(amount) || amount <= 0) { showNotification('Enter a valid amount', 'danger'); return; }
  let newHP = char.currentHP + (isHealing ? amount : -amount);
  newHP = Math.max(0, Math.min(newHP, computed.maxHP));
  char.currentHP = newHP;
  input.value = '';
  recalculateAndRender();
  queueSave();
}

function renderResources() {
  const el = document.getElementById('resources-content');
  if (!el) return;
  el.innerHTML = `
    <div class="field-group">
      <label>Stat Points</label>
      <input type="number" value="${computed.availableStatPoints}" readonly>
    </div>
    <div class="field-group">
      <label>Skill Points</label>
      <input type="number" value="${computed.availableSkillPoints}" readonly>
    </div>
    <div class="currency-display">
      <div class="currency-label">Points</div>
      <div class="currency-value">${char.currency}</div>
    </div>
  `;
}

function renderAffinities() {
  const el = document.getElementById('affinities-content');
  if (!el) return;

  // Collect all already-assigned stats
  const assigned = [...char.affinities.primary, ...char.affinities.secondary, ...char.affinities.tertiary];
  const available = STATS.filter(s => !assigned.includes(s));

  el.innerHTML = ['primary', 'secondary', 'tertiary'].map(type => `
    <div class="affinity-section">
      <div class="affinity-row">
        <label>${type.charAt(0).toUpperCase() + type.slice(1)}</label>
        <select data-affinity-type="${type}">
          <option value="">+ Add</option>
          ${available.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div class="tag-list">
        ${(char.affinities[type] || []).map(stat =>
          `<span class="tag">${stat}<span class="tag-remove" data-affinity-type="${type}" data-stat="${stat}">×</span></span>`
        ).join('')}
      </div>
    </div>
  `).join('');

  // Attach handlers
  el.querySelectorAll('select[data-affinity-type]').forEach(sel => {
    sel.addEventListener('change', e => {
      const type = e.target.dataset.affinityType;
      const stat = e.target.value;
      if (stat && !char.affinities[type].includes(stat)) {
        char.affinities[type].push(stat);
        onChange();
      }
      e.target.value = '';
    });
  });

  el.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const type = e.target.dataset.affinityType;
      const stat = e.target.dataset.stat;
      char.affinities[type] = char.affinities[type].filter(s => s !== stat);
      onChange();
    });
  });
}

function renderStatsTable() {
  const el = document.getElementById('stats-content');
  if (!el) return;

  const rows = STATS.map(stat => {
    const base = computed.baseStats[stat] || 0;
    const manual = char.manualStatPoints[stat] || 0;
    const skillAdd = computed.skillBonuses[stat]?.add || 0;
    const total = computed.totalStats[stat] || 0;
    const isCapped = total > computed.statCap;
    const canAdd = computed.availableStatPoints > 0 && !wouldExceedCap(stat, computed.totalStats, char.statMultiplier);
    const canRemove = manual > 0;

    return `<tr>
      <td>${stat}</td>
      <td class="stat-value-cell ${isCapped ? 'stat-capped' : ''}">
        ${total.toFixed(1)}
        <div class="stat-breakdown">(Base ${(base - manual).toFixed(1)} + ${manual} manual + ${skillAdd.toFixed(1)} skill)</div>
      </td>
      <td>
        <div class="stat-controls">
          <button class="btn-sm stat-add" data-stat="${stat}" ${!canAdd ? 'disabled' : ''}>+</button>
          <button class="btn-sm stat-remove" data-stat="${stat}" ${!canRemove ? 'disabled' : ''}>−</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="stats-table">
      <thead><tr><th>Stat</th><th>Value</th><th>+/−</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  el.querySelectorAll('.stat-add').forEach(btn => {
    btn.addEventListener('click', e => {
      const stat = e.target.dataset.stat;
      if (computed.availableStatPoints > 0) {
        char.manualStatPoints[stat] = (char.manualStatPoints[stat] || 0) + 1;
        onChange();
      }
    });
  });

  el.querySelectorAll('.stat-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      const stat = e.target.dataset.stat;
      if (char.manualStatPoints[stat] > 0) {
        char.manualStatPoints[stat]--;
        onChange();
      }
    });
  });
}

function renderSkills() {
  const el = document.getElementById('skills-content');
  if (!el) return;

  let html = '';
  for (let tier = 1; tier <= 5; tier++) {
    const slots = char.skillsByTier[tier] || [];
    const slotHtml = slots.map((skill, i) => {
      if (!skill) {
        return `<div class="skill-slot empty" data-tier="${tier}" data-index="${i}"></div>`;
      }
      return `<div class="skill-slot" data-tier="${tier}" data-index="${i}">
        <img src="${skill.icon || ''}" alt="${skill.name}">
        <div class="skill-level-badge">${skill.level || 0}</div>
      </div>`;
    }).join('');

    html += `
      <div class="tier-section">
        <div class="tier-header">
          <h4>Tier ${tier}</h4>
          <div class="tier-controls">
            <button class="btn-sm tier-remove" data-tier="${tier}" ${slots.length === 0 ? 'disabled' : ''}>− Slot</button>
            <button class="btn-sm tier-add" data-tier="${tier}">+ Slot</button>
          </div>
        </div>
        <div class="skill-slots-grid">${slotHtml}</div>
      </div>
    `;
  }

  el.innerHTML = html;

  // Slot click handlers — will open skill library modal later
  el.querySelectorAll('.skill-slot.empty').forEach(slot => {
    slot.addEventListener('click', () => {
      showNotification('Skill library coming soon', 'info');
    });
  });

  el.querySelectorAll('.tier-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = parseInt(btn.dataset.tier);
      if (!char.skillsByTier[tier]) char.skillsByTier[tier] = [];
      char.skillsByTier[tier].push(null);
      onChange();
    });
  });

  el.querySelectorAll('.tier-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = parseInt(btn.dataset.tier);
      if (char.skillsByTier[tier]?.length > 0) {
        char.skillsByTier[tier].pop();
        onChange();
      }
    });
  });
}

function renderProficiencies() {
  const el = document.getElementById('proficiencies-content');
  if (!el) return;
  el.innerHTML = char.proficientCategories.length > 0
    ? `<div class="tag-list">${char.proficientCategories.map(c => `<span class="tag">${c}</span>`).join('')}</div>`
    : `<p style="color: var(--text-muted); font-size: var(--text-sm);">No proficiencies learned.</p>`;
}

function renderBackstory() {
  const el = document.getElementById('backstory-content');
  if (!el) return;
  el.innerHTML = `<textarea id="backstory-textarea" placeholder="Write your character's backstory and notes..."
    style="width: 100%; min-height: 200px; resize: vertical;">${char.backstory || ''}</textarea>`;
  el.querySelector('#backstory-textarea').addEventListener('input', e => {
    char.backstory = e.target.value;
    queueSave();
  });
}

function renderEquipment() {
  const el = document.getElementById('equipment-content');
  if (!el) return;
  // Placeholder — full equipment rendering comes next phase
  const slots = ['weapon1', 'weapon2', 'armor', 'accessory1', 'accessory2'];
  el.innerHTML = `
    <div class="equipment-grid">
      ${slots.map(key => {
        const item = char.equipment[key];
        return `<div class="equipment-slot ${item ? 'has-item' : ''}" title="${item?.name || key}">
          ${item
            ? `<img class="item-image" src="${item.image || ''}" alt="${item.name}">`
            : `<div class="slot-placeholder"><span>${key.replace(/\d/, '')}</span></div>`
          }
        </div>`;
      }).join('')}
    </div>
  `;
}

// ─── Save ─────────────────────────────────────────────────────────
function onChange() {
  recalculateAndRender();
  queueSave();
}

function queueSave() {
  isDirty = true;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    if (!isDirty || !currentUser) return;
    isDirty = false;
    try {
      await saveCharacter(currentUser.uid, buildSavePayload(char));
      showNotification('Saved', 'success');
    } catch (err) {
      showNotification('Save failed!', 'danger');
    }
  }, AUTOSAVE_DELAY);
}

// ─── Navigation ───────────────────────────────────────────────────
async function handleSignOut() {
  try {
    await signOut();
    window.location.href = '/';
  } catch (err) {
    showNotification('Sign out failed', 'danger');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────
init();
