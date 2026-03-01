// src/pages/sheet.js
// Character Sheet — main page controller with all modals and interactivity.

import { waitForAuth, signOut, isCurrentUserAdmin } from '../services/auth.service.js';
import { loadCharacter, saveCharacter, getDefaultCharacterData, buildSavePayload, listenToCharacter } from '../services/character.service.js';
import { fetchAllLibraries, listenToGameSettings } from '../services/library.service.js';
import { buyItem, listItemForSale, sendItem, sendCurrency } from '../services/shop.service.js';
import { getPartyMembers, fetchPartyCharacters } from '../services/admin.service.js';
import { calculateBaseStats, calculateTotalStats, calculateStatCap, wouldExceedCap, calculateAvailableStatPoints } from '../systems/stat-calculator.js';
import { aggregateSkillBonuses, calculateUsedSkillPoints, calculateAvailableSkillPoints, calculateSpirit, getSkillTier, getSkillSpiritCost, getActiveTiers } from '../systems/skill-engine.js';
import { calculateMaxHP, calculateHitDice, calculateSpeed, calculateAttack, calculateDefense } from '../systems/combat-math.js';
import { calculateBeastStats, getBeastAbilities, checkBeastSynergy, calculateAvailableBeastPoints } from '../systems/beast-system.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';
import { openModal, closeModal, getModalBody, showConfirmation } from '../components/shared/modal.js';
import { STATS, AUTOSAVE_DELAY, POSITIONS, EQUIPMENT_SLOTS, BASE_SPIRIT } from '../config/constants.js';
import { openSettingsModal } from '../components/shared/settings.js';
import { applyTheme, applyLayout, LAYOUT_PRESETS } from '../services/theme.service.js';

// ─── Page State ───────────────────────────────────────────────────
let char = null;
let libs = { skills: [], items: [], beasts: [], synergies: [] };
let computed = {};
let saveTimeout = null;
let isDirty = false;
let currentUser = null;
let shopSettings = { isShopOpen: false, shopItems: [] };
let partyMembers = []; // For trading
let unsubCharListener = null;
let unsubShopListener = null;
let isAdminUser = false;
let skillEditMode = false;

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  initNotifications();

  const user = await waitForAuth();
  if (!user) { window.location.href = '/'; return; }
  currentUser = user;

  document.getElementById('user-display-name').textContent = user.displayName || 'Unnamed';
  document.getElementById('btn-sign-out').addEventListener('click', handleSignOut);

  const isAdmin = await isCurrentUserAdmin();
  isAdminUser = isAdmin;
  if (isAdmin) {
    const adminNav = document.getElementById('nav-admin');
    if (adminNav) adminNav.style.display = '';
  }

  let rawChar, libraries;
  try {
    [rawChar, libraries] = await Promise.all([
      loadCharacter(user.uid),
      fetchAllLibraries()
    ]);
  } catch (err) {
    console.error('Failed to load data:', err);
    showNotification('Failed to load character data', 'danger');
    return;
  }

  libs = libraries;

  // Merge loaded data with defaults
  const defaults = getDefaultCharacterData(user.uid);
  if (rawChar) {
    char = { ...defaults, ...rawChar };
    char.affinities = {
      primary: rawChar.affinities?.primary || [],
      secondary: rawChar.affinities?.secondary || [],
      tertiary: rawChar.affinities?.tertiary || []
    };
    char.equipment = { ...defaults.equipment, ...(rawChar.equipment || {}) };
    // Dynamically load all tiers from saved data (supports arbitrary tier numbers)
    char.skillsByTier = {};
    const rawTiers = rawChar.skillsByTier || {};
    for (const key of Object.keys(rawTiers)) {
      const tierNum = Number(key);
      if (!isNaN(tierNum)) {
        char.skillsByTier[tierNum] = rawTiers[key] || [];
      }
    }
    // Ensure at least tiers 1-5 exist for backwards compat
    for (let t = 1; t <= 5; t++) {
      if (!char.skillsByTier[t]) char.skillsByTier[t] = [];
    }
    char.manualStatPoints = rawChar.manualStatPoints || rawChar.manualAdds || defaults.manualStatPoints;
    char.lockedStatPoints = rawChar.lockedStatPoints || defaults.lockedStatPoints;
    char.deallocationPoints = rawChar.deallocationPoints || 0;
    char.proficientCategories = rawChar.proficientCategories || [];
    char.proficientSkills = rawChar.proficientSkills || [];
    char.specialItems = rawChar.specialItems || [];
    char.ownedItems = rawChar.ownedItems || [];
    char.ownedBeasts = rawChar.ownedBeasts || {};
    char.beastPoints = rawChar.beastPoints || 0;
  } else {
    char = defaults;
    await saveCharacter(user.uid, buildSavePayload(char));
  }

  if (char.appliedTheme) {
    applyTheme(char.appliedTheme, char.appliedThemeVars || null);
  }
  if (char.layoutPreset) {
    const preset = LAYOUT_PRESETS.find(l => l.id === char.layoutPreset);
    if (preset) applyLayout(preset.grid);
  }

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    openSettingsModal(char, (updates) => {
      Object.assign(char, updates);
      queueSave(); // uses your existing autosave
    });
  });

  // Real-time listener for admin-pushed changes
  unsubCharListener = listenToCharacter(user.uid, (data) => {
    // Only merge admin-controlled fields to avoid overwriting local edits mid-type
    const adminFields = ['level', 'floor', 'currency', 'bonusStatPoints', 'bonusSkillPoints',
      'beastPoints', 'ownedItems', 'ownedBeasts', 'proficientCategories', 'proficientSkills',
      'specialItems', 'statMultiplier', 'deallocationPoints'];
    let changed = false;
    for (const field of adminFields) {
      if (data[field] !== undefined && JSON.stringify(data[field]) !== JSON.stringify(char[field])) {
        char[field] = data[field];
        changed = true;
      }
    }
    
    // Also merge skillsByTier slot additions (admin can add slots, any tier)
    if (data.skillsByTier) {
      for (const key of Object.keys(data.skillsByTier)) {
        const t = Number(key);
        if (isNaN(t)) continue;
        const remote = data.skillsByTier[key] || [];
        if (!char.skillsByTier[t]) char.skillsByTier[t] = [];
        const local = char.skillsByTier[t];
        if (remote.length > local.length) {
          while (char.skillsByTier[t].length < remote.length) {
            char.skillsByTier[t].push(remote[char.skillsByTier[t].length]);
          }
          changed = true;
        }
      }
    }

    if (changed) {
      recalculateAndRender();
      showNotification('Character updated by GM', 'info');
    }
  });

  // Shop listener
  unsubShopListener = listenToGameSettings(settings => {
    shopSettings = settings;
  });

  // Load party members for trading
  try {
    const memberUids = await getPartyMembers();
    if (memberUids.length > 0) {
      partyMembers = await fetchPartyCharacters(memberUids);
    }
  } catch (e) { /* not critical */ }

  recalculateAndRender();
  showNotification('Character loaded', 'success');
}

// ─── Compute ──────────────────────────────────────────────────────
function recalculate() {
  const c = char;
  const baseStats = calculateBaseStats(c.level || 1, c.position || 'Guide', c.affinities, c.manualStatPoints);
  const skillBonuses = aggregateSkillBonuses(c.skillsByTier, c.proficientSkills);
  const totalStats = calculateTotalStats(baseStats, skillBonuses);
  const statCap = calculateStatCap(totalStats, c.statMultiplier || 2.0);
  const availableStatPoints = calculateAvailableStatPoints(c.level || 1, c.manualStatPoints, c.bonusStatPoints || 0);
  const usedSkillPoints = calculateUsedSkillPoints(c.skillsByTier, c.proficientCategories, c.proficientSkills);
  const availableSkillPoints = calculateAvailableSkillPoints(c.level || 1, usedSkillPoints, c.bonusSkillPoints || 0);
  const spirit = calculateSpirit(c.skillsByTier, c.equipment);
  const maxHP = calculateMaxHP(totalStats, c.level || 1, skillBonuses);

  if (c.currentHP === undefined || c.currentHP === null) c.currentHP = maxHP;
  else if (c.currentHP > maxHP) c.currentHP = maxHP;

  const selectedWeapon = c.selectedWeaponSlot ? c.equipment[c.selectedWeaponSlot] : null;
  const hitDice = calculateHitDice(maxHP, c.position || 'Guide', totalStats);
  const speed = calculateSpeed(c.level || 1, c.floor || 1, totalStats, skillBonuses);
  const attack = calculateAttack(selectedWeapon, totalStats);
  const defense = calculateDefense(c.equipment?.armor, totalStats);
  const availableBP = calculateAvailableBeastPoints(c.beastPoints || 0, c.ownedBeasts);

  // Check beast synergy
  let beastSynergy = null;
  const b1 = c.equipment?.beast1;
  const b2 = c.equipment?.beast2;
  if (b1 && b2) {
    beastSynergy = checkBeastSynergy(b1.id, b2.id, libs.synergies);
  }

  // Stat lock status
  const locked = c.lockedStatPoints || {};
  const unlocked = {};
  for (const stat of STATS) {
    unlocked[stat] = (c.manualStatPoints[stat] || 0) - (locked[stat] || 0);
  }

  computed = { baseStats, skillBonuses, totalStats, statCap, availableStatPoints, usedSkillPoints, availableSkillPoints, spirit, maxHP, hitDice, speed, attack, defense, availableBP, beastSynergy, unlocked };
}

// ─── Render All ───────────────────────────────────────────────────
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
  renderEquipment();
  renderBackstory();
}

// ─── Widget: Identity ─────────────────────────────────────────────
function renderIdentity() {
  const el = document.getElementById('identity-content');
  if (!el) return;
  el.innerHTML = `
    <div class="field-group">
      <label for="char-name">Name</label>
      <input type="text" id="char-name" value="${esc(char.name)}" placeholder="Character name...">
    </div>
    <div class="field-group">
      <label for="char-race">Race</label>
      <input type="text" id="char-race" value="${esc(char.race)}" placeholder="Race...">
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

// ─── Widget: Progression ──────────────────────────────────────────
function renderProgression() {
  const el = document.getElementById('progression-content');
  if (!el) return;
  el.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
      <div class="stat-card">
        <div class="stat-label">Level</div>
        <div class="stat-value">${char.level || 1}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Floor</div>
        <div class="stat-value">${char.floor || 1}</div>
      </div>
    </div>
  `;
}

// ─── Widget: Combat Stats ─────────────────────────────────────────
function renderCombatStats() {
  const el = document.getElementById('top-stats-content');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card stat-card--wide" style="margin-bottom: var(--space-3);">
      <div class="stat-label">Health</div>
      <div class="stat-value">${char.currentHP} / ${computed.maxHP}</div>
      <div class="hp-controls">
        <button class="btn-sm hp-minus">−</button>
        <input type="number" class="hp-adjust-input" placeholder="Amt" min="1">
        <button class="btn-sm hp-plus">+</button>
      </div>
    </div>
    <div class="stat-card" style="margin-bottom: var(--space-3);">
      <div class="stat-label">Hit Dice</div>
      <div class="stat-value stat-value--sm">${computed.hitDice.display}</div>
    </div>
    <div class="top-stats-grid">
      <div class="stat-card"><div class="stat-label">Speed</div><div class="stat-value stat-value--sm">${computed.speed}</div></div>
      <div class="stat-card"><div class="stat-label">Attack</div><div class="stat-value stat-value--sm">${computed.attack}</div></div>
      <div class="stat-card"><div class="stat-label">Defense</div><div class="stat-value stat-value--sm">${computed.defense}</div></div>
    </div>
    ${computed.beastSynergy ? `
      <div style="margin-top: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--accent-muted); border: 1px solid var(--accent); border-radius: var(--radius-md); font-size: var(--text-xs);">
        <strong style="color: var(--accent);">⚡ Synergy: ${computed.beastSynergy.name || 'Active'}</strong>
        <div style="color: var(--text-secondary); margin-top: 2px;">${computed.beastSynergy.effect?.description || ''}</div>
      </div>
    ` : ''}
  `;

  // HP controls
  const adjustHP = (heal) => {
    const input = el.querySelector('.hp-adjust-input');
    const amount = parseInt(input.value);
    if (isNaN(amount) || amount <= 0) { showNotification('Enter a valid amount', 'danger'); return; }
    let newHP = char.currentHP + (heal ? amount : -amount);
    newHP = Math.max(0, Math.min(newHP, computed.maxHP));
    char.currentHP = newHP;
    input.value = '';
    onChange();
  };
  el.querySelector('.hp-minus').addEventListener('click', () => adjustHP(false));
  el.querySelector('.hp-plus').addEventListener('click', () => adjustHP(true));
}

// ─── Widget: Resources ────────────────────────────────────────────
function renderResources() {
  const el = document.getElementById('resources-content');
  if (!el) return;

  const totalUnlocked = Object.values(computed.unlocked || {}).reduce((s, v) => s + v, 0);
  const hasUnlocked = totalUnlocked > 0;

  el.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3);">
      <div class="stat-card"><div class="stat-label">Stat Points</div><div class="stat-value stat-value--sm">${computed.availableStatPoints}</div></div>
      <div class="stat-card"><div class="stat-label">Skill Points</div><div class="stat-value stat-value--sm">${computed.availableSkillPoints}</div></div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3);">
      <div class="stat-card"><div class="stat-label">Beast Points</div><div class="stat-value stat-value--sm">${computed.availableBP}</div></div>
      <div class="stat-card"><div class="stat-label">Spirit</div><div class="stat-value stat-value--sm">${computed.spirit.current}/${computed.spirit.max}</div></div>
    </div>
    ${hasUnlocked ? `<button class="btn-accent btn-sm" id="btn-lock-stats" style="width: 100%; margin-bottom: var(--space-2);">Lock ${totalUnlocked} Stat Point${totalUnlocked !== 1 ? 's' : ''}</button>` : ''}
    ${(char.deallocationPoints || 0) > 0 ? `<div style="font-size: var(--text-xs); color: var(--text-muted); text-align: center;">Deallocation points: ${char.deallocationPoints}</div>` : ''}
    <div class="currency-display">
      <div class="currency-label">Points</div>
      <div class="currency-value">${char.currency || 0}</div>
      <div style="display: flex; gap: var(--space-2); justify-content: center; margin-top: var(--space-3);">
        <button class="btn-sm btn-ghost" id="btn-shop">Shop</button>
        <button class="btn-sm btn-ghost" id="btn-sell">Sell</button>
        <button class="btn-sm btn-ghost" id="btn-trade">Trade</button>
      </div>
    </div>
  `;

  el.querySelector('#btn-shop')?.addEventListener('click', openShopModal);
  el.querySelector('#btn-sell')?.addEventListener('click', openSellModal);
  el.querySelector('#btn-trade')?.addEventListener('click', openTradeModal);
  el.querySelector('#btn-lock-stats')?.addEventListener('click', lockStats);
}

function lockStats() {
  // Check: any stat exceeding the multiplier cap?
  const cap = computed.statCap;
  const overCap = STATS.filter(s => (computed.totalStats[s] || 0) > Math.floor(cap));
  if (overCap.length > 0) {
    showNotification(`Cannot lock: ${overCap.join(', ')} exceed${overCap.length === 1 ? 's' : ''} the ${char.statMultiplier || 2.0}× cap (${Math.floor(cap)}). Reduce them first.`, 'danger');
    return;
  }
  // Check: no negative available (over-allocated)
  if (computed.availableStatPoints < 0) {
    showNotification('Cannot lock: you have over-allocated stat points. Remove some first.', 'danger');
    return;
  }
  const unlocked = computed.unlocked;
  const totalUnlocked = Object.values(unlocked).reduce((s, v) => s + v, 0);
  if (totalUnlocked === 0) return;

  showConfirmation(`Lock ${totalUnlocked} stat point(s)? This is permanent (ask GM for deallocation to undo).`).then(yes => {
    if (!yes) return;
    if (!char.lockedStatPoints) char.lockedStatPoints = {};
    for (const stat of STATS) {
      char.lockedStatPoints[stat] = char.manualStatPoints[stat] || 0;
    }
    onChange();
    showNotification('Stats locked!', 'success');
  });
}

// ─── Widget: Affinities ───────────────────────────────────────────
function renderAffinities() {
  const el = document.getElementById('affinities-content');
  if (!el) return;

  const allUsed = [...(char.affinities.primary || []), ...(char.affinities.secondary || []), ...(char.affinities.tertiary || [])];
  const available = STATS.filter(s => !allUsed.includes(s));

  let html = '';
  for (const tier of ['primary', 'secondary', 'tertiary']) {
    const tags = (char.affinities[tier] || []).map(s =>
      `<span class="tag">${s}<span class="tag-remove" data-tier="${tier}" data-stat="${s}">×</span></span>`
    ).join('');

    html += `
      <div class="affinity-section">
        <div class="affinity-row">
          <label>${tier.charAt(0).toUpperCase() + tier.slice(1)}</label>
          <select data-affinity-add="${tier}">
            <option value="">+ Add</option>
            ${available.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="tag-list">${tags}</div>
      </div>
    `;
  }
  el.innerHTML = html;

  el.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier;
      const stat = btn.dataset.stat;
      char.affinities[tier] = char.affinities[tier].filter(s => s !== stat);
      onChange();
    });
  });

  el.querySelectorAll('[data-affinity-add]').forEach(sel => {
    sel.addEventListener('change', e => {
      const tier = sel.dataset.affinityAdd;
      const val = e.target.value;
      if (val && !char.affinities[tier].includes(val)) {
        char.affinities[tier].push(val);
        onChange();
      }
      e.target.value = '';
    });
  });
}

// ─── Widget: Stats Table ──────────────────────────────────────────
function renderStatsTable() {
  const el = document.getElementById('stats-content');
  if (!el) return;
  const cap = computed.statCap;
  const locked = char.lockedStatPoints || {};
  const dealloc = char.deallocationPoints || 0;

  const rows = STATS.map(stat => {
    const base = computed.baseStats[stat] || 0;
    const manual = char.manualStatPoints[stat] || 0;
    const skillAdd = computed.skillBonuses[stat]?.add || 0;
    const total = computed.totalStats[stat] || 0;
    const isCapped = total > cap;
    const lockedVal = locked[stat] || 0;
    const unlockedVal = manual - lockedVal;

    const canAdd = computed.availableStatPoints > 0 && !wouldExceedCap(stat, computed.totalStats, char.statMultiplier || 2.0);
    const canRemove = unlockedVal > 0; // Can only remove unlocked points
    const canDeallocate = dealloc > 0 && lockedVal > 0; // Can deallocate with dealloc points

    return `<tr>
      <td>${stat}</td>
      <td class="stat-value-cell ${isCapped ? 'stat-capped' : ''}">
        ${total.toFixed(1)}
        <div class="stat-breakdown">Base ${(base - manual).toFixed(1)} + Alloc ${manual} + Skill ${skillAdd.toFixed(1)}</div>
      </td>
      <td>
        <div class="stat-controls">
          ${canDeallocate ? `<button class="btn-sm btn-ghost" data-stat-dealloc="${stat}" title="Deallocate 1 locked point" style="font-size:9px;">↩</button>` : ''}
          <button class="btn-sm" data-stat-remove="${stat}" ${!canRemove ? 'disabled' : ''}>−</button>
          <button class="btn-sm" data-stat-add="${stat}" ${!canAdd ? 'disabled' : ''}>+</button>
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

  el.querySelectorAll('[data-stat-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      char.manualStatPoints[btn.dataset.statAdd] = (char.manualStatPoints[btn.dataset.statAdd] || 0) + 1;
      onChange();
    });
  });

  el.querySelectorAll('[data-stat-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stat = btn.dataset.statRemove;
      const locked = (char.lockedStatPoints || {})[stat] || 0;
      if ((char.manualStatPoints[stat] || 0) > locked) {
        char.manualStatPoints[stat]--;
        onChange();
      }
    });
  });

  el.querySelectorAll('[data-stat-dealloc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stat = btn.dataset.statDealloc;
      if ((char.deallocationPoints || 0) > 0 && ((char.lockedStatPoints || {})[stat] || 0) > 0) {
        if (!char.lockedStatPoints) char.lockedStatPoints = {};
        char.lockedStatPoints[stat]--;
        char.manualStatPoints[stat]--;
        char.deallocationPoints--;
        onChange();
        showNotification(`Deallocated 1 point from ${stat}`, 'info');
      }
    });
  });
}

// ─── Widget: Skills ───────────────────────────────────────────────
function renderSkills() {
  const el = document.getElementById('skills-content');
  if (!el) return;

  // Spirit tank + skill tiers
  const spiritPct = computed.spirit.max > 0 ? (computed.spirit.current / computed.spirit.max) * 100 : 0;
  const activeTiers = getActiveTiers(char.skillsByTier);

  let tiersHtml = '';
  for (const tier of activeTiers) {
    const slots = char.skillsByTier[tier] || [];
    if (slots.length === 0) continue;

    const slotHtml = slots.map((skill, i) => {
      if (!skill) {
        return `<div class="skill-slot empty" data-skill-slot="${tier}-${i}"></div>`;
      }
      const displaySkill = char.proficientSkills.includes(skill.id) && skill.proficientVersion ? skill.proficientVersion : skill;
      const spiritCost = getSkillSpiritCost(skill);
      const hasSpiritCost = spiritCost > 0;
      let chargesHtml = '';
      if (skill.charges) {
        chargesHtml = '<div class="skill-charges">';
        for (let c = 0; c < skill.charges; c++) {
          const used = (skill.usedCharges || 0) > c;
          chargesHtml += `<div class="charge-box ${used ? 'used' : ''}" data-charge="${tier}-${i}-${c}"></div>`;
        }
        chargesHtml += '</div>';
      }
      return `<div class="skill-slot ${hasSpiritCost ? 'spirit-border' : ''}" data-skill-info="${tier}-${i}" title="${displaySkill.name}" ${skillEditMode ? `draggable="true" data-drag-tier="${tier}" data-drag-idx="${i}"` : ''}>
        <img src="${displaySkill.icon || skill.icon || ''}" alt="${displaySkill.name}">
        <div class="skill-level-badge">${skill.level || 0}</div>
        ${chargesHtml}
        ${skillEditMode ? `<div class="skill-reorder-handle">⠿</div>` : ''}
      </div>`;
    }).join('');

    tiersHtml += `
      <div class="tier-section" ${skillEditMode ? `data-tier-drop="${tier}"` : ''}>
        <div class="tier-header">
          <h4>Tier ${tier}</h4>
        </div>
        <div class="skill-slots-grid">${slotHtml || '<span style="color: var(--text-muted); font-size: var(--text-xs);">No slots</span>'}</div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="skills-wrapper">
      <div class="spirit-tank">
        <div class="spirit-tank-fluid" style="height: ${spiritPct}%;"></div>
        <div class="spirit-tooltip">
          <span style="color: var(--text-bright); font-weight: 700; font-size: 0.85rem;">${computed.spirit.current}</span>
          <span style="color: var(--text-muted); margin: 0 2px;">/</span>
          <span style="color: var(--text-secondary); font-size: 0.85rem;">${computed.spirit.max}</span>
          <div style="font-size: 0.45rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); margin-top: 2px;">Spirit</div>
        </div>
      </div>
      <div>
        <div style="display: flex; justify-content: flex-end; margin-bottom: var(--space-2);">
          <button class="btn-sm btn-ghost" id="btn-skill-edit-mode" title="Reorder skills" style="font-size: 0.6rem; padding: 2px 6px;">${skillEditMode ? '✓ Done' : '✎ Edit'}</button>
        </div>
        ${tiersHtml || '<p style="color: var(--text-muted); font-size: var(--text-sm);">No skill slots assigned yet.</p>'}
      </div>
    </div>
  `;

  // Edit mode toggle
  el.querySelector('#btn-skill-edit-mode')?.addEventListener('click', () => {
    skillEditMode = !skillEditMode;
    renderSkills();
  });

  // Drag and drop for reordering (only in edit mode)
  if (skillEditMode) {
    let dragSrc = null;
    el.querySelectorAll('[draggable="true"]').forEach(slot => {
      slot.addEventListener('dragstart', e => {
        dragSrc = { tier: Number(slot.dataset.dragTier), idx: Number(slot.dataset.dragIdx) };
        slot.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      slot.addEventListener('dragend', () => {
        slot.classList.remove('dragging');
        dragSrc = null;
      });
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if (!dragSrc) return;
        const destTier = Number(slot.dataset.dragTier || slot.dataset.skillSlot?.split('-')[0]);
        const destIdx = Number(slot.dataset.dragIdx ?? slot.dataset.skillSlot?.split('-')[1]);
        if (isNaN(destTier) || isNaN(destIdx)) return;
        // Only allow reorder within same tier
        if (dragSrc.tier !== destTier) {
          showNotification('Can only reorder within the same tier', 'danger');
          return;
        }
        // Swap
        const arr = char.skillsByTier[destTier];
        const temp = arr[dragSrc.idx];
        arr[dragSrc.idx] = arr[destIdx];
        arr[destIdx] = temp;
        onChange();
        dragSrc = null;
      });
    });
    // Also make empty slots droppable
    el.querySelectorAll('.skill-slot.empty').forEach(slot => {
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        if (!dragSrc) return;
        const [destTier, destIdx] = slot.dataset.skillSlot.split('-').map(Number);
        if (dragSrc.tier !== destTier) { showNotification('Can only reorder within the same tier', 'danger'); return; }
        const arr = char.skillsByTier[destTier];
        const temp = arr[dragSrc.idx];
        arr[dragSrc.idx] = arr[destIdx];
        arr[destIdx] = temp;
        onChange();
        dragSrc = null;
      });
    });
  }

  // Bind skill slot clicks (not in edit mode)
  if (!skillEditMode) {
    el.querySelectorAll('.skill-slot.empty').forEach(slot => {
      slot.addEventListener('click', () => {
        const [tier, index] = slot.dataset.skillSlot.split('-').map(Number);
        openSkillLibraryModal(tier, index);
      });
    });

    el.querySelectorAll('[data-skill-info]').forEach(slot => {
      slot.addEventListener('click', () => {
        const [tier, index] = slot.dataset.skillInfo.split('-').map(Number);
        openSkillInfoModal(tier, index);
      });
    });
  }

  // Bind charge toggles (always active)
  el.querySelectorAll('.charge-box').forEach(box => {
    box.addEventListener('click', e => {
      e.stopPropagation();
      const [tier, index, chargeIdx] = box.dataset.charge.split('-').map(Number);
      const skill = char.skillsByTier[tier][index];
      if (!skill) return;
      if ((skill.usedCharges || 0) > chargeIdx) {
        skill.usedCharges = chargeIdx;
      } else {
        skill.usedCharges = chargeIdx + 1;
      }
      renderSkills();
      queueSave();
    });
  });
}

// ─── Widget: Proficiencies ────────────────────────────────────────
function renderProficiencies() {
  const el = document.getElementById('proficiencies-content');
  if (!el) return;
  el.innerHTML = char.proficientCategories.length > 0
    ? `<div class="tag-list">${char.proficientCategories.map(c =>
      `<span class="tag">${c}</span>`
    ).join('')}</div>`
    : `<p style="color: var(--text-muted); font-size: var(--text-sm);">No proficiencies learned.</p>`;
}

// ─── Widget: Equipment ────────────────────────────────────────────
function renderEquipment() {
  const el = document.getElementById('equipment-content');
  if (!el) return;
  const currentPosition = char.position || 'Guide';

  const slotsToShow = Object.entries(EQUIPMENT_SLOTS).filter(([key, config]) => {
    if (config.position && config.position !== currentPosition) return false;
    return true;
  });

  el.innerHTML = `
    <div class="equipment-grid">
      ${slotsToShow.map(([key, config]) => {
    const item = char.equipment[key];
    const isSelected = key === char.selectedWeaponSlot;
    return `<div class="equipment-slot ${item ? 'has-item' : ''} ${isSelected ? 'selected-weapon' : ''}" data-equip-slot="${key}" title="${item?.name || config.label}">
          ${item
        ? `<img class="item-image" src="${item.image || ''}" alt="${item.name}">`
        : `<div class="slot-placeholder"><div style="font-size: var(--text-xs);">${config.label}</div></div>`
      }
          <div class="slot-action" data-equip-action="${key}">${item ? '⇄' : '+'}</div>
        </div>`;
  }).join('')}
    </div>
    <div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
      <button class="btn-sm btn-ghost" id="btn-compendium" style="flex:1;">Compendium</button>
      <button class="btn-sm btn-ghost" id="btn-special-items" style="flex:1;">Special Items</button>
    </div>
  `;

  // Click weapon slots to select active weapon
  el.querySelectorAll('[data-equip-slot]').forEach(slot => {
    slot.addEventListener('click', () => {
      const key = slot.dataset.equipSlot;
      if (EQUIPMENT_SLOTS[key].type === 'weapon' && char.equipment[key]) {
        char.selectedWeaponSlot = (char.selectedWeaponSlot === key) ? null : key;
        onChange();
      }
    });
  });

  // Equip/change buttons
  el.querySelectorAll('[data-equip-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.equipAction;
      const slotConfig = EQUIPMENT_SLOTS[key];
      if (slotConfig.type === 'beast') {
        openBeastSelectModal(key);
      } else {
        openInventoryModal(key);
      }
    });
  });

  el.querySelector('#btn-compendium')?.addEventListener('click', openCompendiumModal);
  el.querySelector('#btn-special-items')?.addEventListener('click', openSpecialItemsModal);
}

// ─── Widget: Backstory ────────────────────────────────────────────
function renderBackstory() {
  const el = document.getElementById('backstory-content');
  if (!el) return;
  el.innerHTML = `<textarea id="backstory-textarea" placeholder="Write your character's backstory and notes..." style="width: 100%; min-height: 200px; resize: vertical;">${esc(char.backstory || '')}</textarea>`;
  el.querySelector('#backstory-textarea').addEventListener('input', e => {
    char.backstory = e.target.value;
    queueSave();
  });
}

// ═══════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════

// ─── Skill Library Modal ──────────────────────────────────────────
function openSkillLibraryModal(tier, index) {
  const pos = char.position || 'Guide';
  const discoveredSkills = libs.skills.filter(s =>
    s.isDiscovered !== false &&
    s.positionTags?.includes(pos) &&
    (s.tier || 1) === tier
  );

  const body = document.createElement('div');
  body.innerHTML = `
    <input type="text" class="modal-search" id="skill-search-input" placeholder="Search skills...">
    <div class="modal-grid" id="skill-lib-grid"></div>
  `;

  openModal({ id: 'skill-library', title: `Skill Library — Tier ${tier}`, size: 'lg', body });

  const renderGrid = (filter = '') => {
    const grid = document.getElementById('skill-lib-grid');
    const filtered = discoveredSkills.filter(s =>
      s.name.toLowerCase().includes(filter) ||
      (s.skillType || '').toLowerCase().includes(filter)
    );
    grid.innerHTML = filtered.length === 0 ? '<p style="color: var(--text-muted);">No skills available.</p>' :
      filtered.map(s => {
        const alreadyEquipped = Object.values(char.skillsByTier).flat().some(eq => eq && eq.id === s.id);
        const learnCost = s.costPerLevel?.[0] || 1;
        const spiritCost = s.spiritCostPerLevel?.[0] || s.spiritCost || 0;
        return `
        <div class="card ${alreadyEquipped ? 'card-disabled' : ''}" data-select-skill="${s.id}">
          <img src="${s.icon || ''}" alt="${s.name}">
          <div class="card-title">${s.name}</div>
          <div class="card-subtitle">${s.skillType || ''}</div>
          <div class="card-subtitle" style="color: var(--accent);">Learn: ${learnCost} SP</div>
          ${spiritCost ? `<div class="card-subtitle" style="color: var(--warning);">Spirit: ${spiritCost}</div>` : ''}
          ${alreadyEquipped ? '<div class="card-subtitle" style="color: var(--text-muted);">Already learned</div>' : ''}
        </div>`;
      }).join('');

    grid.querySelectorAll('[data-select-skill]').forEach(card => {
      card.addEventListener('click', () => {
        const skillData = libs.skills.find(s => s.id === card.dataset.selectSkill);
        if (!skillData) return;

        // Check if already equipped
        if (Object.values(char.skillsByTier).flat().some(s => s && s.id === skillData.id)) {
          showNotification('Skill already learned', 'danger');
          return;
        }

        // Show skill summary + confirm learn
        openSkillLearnConfirmModal(tier, index, skillData);
      });
    });
  };

  renderGrid();
  document.getElementById('skill-search-input').addEventListener('input', e => {
    renderGrid(e.target.value.toLowerCase());
  });
}

// ─── Skill Learn Confirmation Modal ───────────────────────────────
function openSkillLearnConfirmModal(tier, index, skillData) {
  const learnCost = skillData.costPerLevel?.[0] || 1;
  const spiritCost = skillData.spiritCostPerLevel?.[0] || skillData.spiritCost || 0;
  const canAfford = computed.availableSkillPoints >= learnCost;
  const canSpirit = spiritCost <= computed.spirit.current;

  let effectsPreview = '';
  if (skillData.effects && skillData.effects.length > 0) {
    const e = skillData.effects.find(ef => ef.level === 1);
    if (e) {
      effectsPreview = `<div style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary);">
        <strong>Lv1 Effect:</strong> ${e.description || (e.stat ? `${e.stat}: ${e.type === 'add' ? '+' : '×'}${e.value}` : '—')}
      </div>`;
    }
  }

  const body = `
    <div style="display: flex; gap: var(--space-4); align-items: flex-start;">
      <img src="${skillData.icon || ''}" alt="${skillData.name}" style="width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md);">
      <div style="flex: 1;">
        <h3 style="color: var(--text-bright); margin-bottom: var(--space-2);">${skillData.name}</h3>
        <p style="font-size: var(--text-sm); color: var(--text-secondary);">${skillData.description || ''}</p>
        <div style="margin-top: var(--space-3); font-size: var(--text-xs); color: var(--text-muted); display: flex; flex-direction: column; gap: var(--space-1);">
          <div><strong>Type:</strong> ${skillData.skillType || 'N/A'}</div>
          <div><strong>Tier:</strong> ${skillData.tier || 1}</div>
          ${spiritCost ? `<div><strong>Spirit Cost:</strong> ${spiritCost}</div>` : ''}
          ${skillData.charges ? `<div><strong>Charges:</strong> ${skillData.charges}</div>` : ''}
          <div><strong>Positions:</strong> ${(skillData.positionTags || []).join(', ')}</div>
        </div>
        ${effectsPreview}
        <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--bg-tertiary); border: 1px solid var(--border-color);">
          <div style="font-size: var(--text-sm); font-weight: 700; color: ${canAfford ? 'var(--success)' : 'var(--danger)'};">
            Cost to Learn: ${learnCost} SP ${canAfford ? '✓' : '(not enough SP)'}
          </div>
          ${spiritCost ? `<div style="font-size: var(--text-sm); color: ${canSpirit ? 'var(--text-secondary)' : 'var(--danger)'};">Spirit: ${spiritCost} ${canSpirit ? '✓' : '(not enough spirit)'}</div>` : ''}
        </div>
        <div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
          <button class="btn-ghost" id="learn-cancel" style="flex:1;">Cancel</button>
          <button class="btn-accent" id="learn-confirm" style="flex:1;" ${(!canAfford || !canSpirit) ? 'disabled' : ''}>Learn Skill</button>
        </div>
      </div>
    </div>
  `;

  openModal({ id: 'skill-learn-confirm', title: 'Learn Skill?', size: 'md', body });

  document.getElementById('learn-cancel')?.addEventListener('click', () => closeModal('skill-learn-confirm'));
  document.getElementById('learn-confirm')?.addEventListener('click', () => {
    char.skillsByTier[tier][index] = { ...skillData, level: 1, usedCharges: 0 };
    closeModal('skill-learn-confirm');
    closeModal('skill-library');
    onChange();
  });
}
// ─── Skill Info Modal ─────────────────────────────────────────────
function openSkillInfoModal(tier, index) {
  const s = char.skillsByTier[tier][index];
  if (!s) return;

  const isProficient = char.proficientSkills.includes(s.id);
  const displaySkill = isProficient && s.proficientVersion ? s.proficientVersion : s;
  const nextLvl = (s.level || 0) + 1;
  const nextCost = s.costPerLevel?.[s.level || 0] || 999;
  const canLvlUp = nextLvl <= s.maxLevel && computed.availableSkillPoints >= nextCost;
  const canUnlearn = s.level <= 1; // Can only unlearn at level 1 (refunds learn cost)

  let tableRows = '';
  for (let i = 1; i <= s.maxLevel; i++) {
    const e = (displaySkill.effects || s.effects || []).find(ef => ef.level === i);
    let effectText = e ? (e.description || `${e.stat}: ${e.type === 'add' ? '+' : '×'}${e.value}`) : '—';
    if (e && e.stat2 && !e.description) effectText += `, ${e.stat2}: +${e.value2}`;
    const isCurrent = s.level === i;
    const spiritAtLevel = s.spiritCostPerLevel?.[i - 1] ?? s.spiritCost ?? 0;
    tableRows += `<tr ${isCurrent ? 'style="background: var(--accent-muted);"' : ''}>
      <td>${i}</td><td>${s.costPerLevel[i - 1] || '?'}</td>${spiritAtLevel !== undefined ? `<td>${spiritAtLevel}</td>` : ''}<td>${effectText}</td>
    </tr>`;
  }

  const hasSpiritColumn = (s.spiritCostPerLevel && s.spiritCostPerLevel.length > 0) || s.spiritCost;
  const currentSpirit = getSkillSpiritCost(s);

  // Build wiki link
  const wikiLink = s.wikiPageId
    ? `<a href="/compendium.html#wiki-${s.wikiPageId}" target="_blank" style="color: var(--accent-text); font-size: var(--text-xs); text-decoration: underline; cursor: pointer;">View Wiki Page →</a>`
    : '';

  const body = `
    <div style="display: grid; grid-template-columns: 220px 1fr; gap: var(--space-6);">
      <div>
        <img src="${displaySkill.icon || s.icon || ''}" alt="${displaySkill.name}" style="width: 100%; border-radius: var(--radius-md); margin-bottom: var(--space-3);">
        <p style="font-size: var(--text-sm); color: var(--text-secondary);">${displaySkill.description || s.description || ''}</p>
        <div style="margin-top: var(--space-3); font-size: var(--text-xs); color: var(--text-muted);">
          <div><strong>Type:</strong> ${s.skillType || 'N/A'}</div>
          <div><strong>Tier:</strong> ${s.tier || 1}</div>
          ${currentSpirit ? `<div><strong>Spirit:</strong> ${currentSpirit}</div>` : ''}
          ${s.charges ? `<div><strong>Charges:</strong> ${s.charges}</div>` : ''}
          <div><strong>Positions:</strong> ${(s.positionTags || []).join(', ')}</div>
        </div>
        ${wikiLink ? `<div style="margin-top: var(--space-3);">${wikiLink}</div>` : ''}
        <div style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: var(--space-2);">
          <div style="font-weight: 700; font-size: var(--text-lg); text-align: center;">Level ${s.level || 0} / ${s.maxLevel}</div>
          <button class="btn-accent" id="skill-lvl-up" ${!canLvlUp ? 'disabled' : ''}>Level Up (${nextCost} SP)</button>
          <button class="btn-danger" id="skill-unlearn" ${!canUnlearn ? 'disabled title="Can only unlearn at level 1"' : ''}>Unlearn</button>
        </div>
      </div>
      <div style="overflow-x: auto;">
        <table class="stats-table" style="font-size: var(--text-sm);">
          <thead><tr><th>Lvl</th><th>Cost</th>${hasSpiritColumn ? '<th>Spirit</th>' : ''}<th>Effect</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
  `;

  openModal({ id: 'skill-info', title: displaySkill.name, size: 'lg', body });

  document.getElementById('skill-lvl-up')?.addEventListener('click', () => {
    if (canLvlUp) {
      s.level = nextLvl;
      onChange();
      closeModal('skill-info');
      openSkillInfoModal(tier, index);
    }
  });

  document.getElementById('skill-unlearn')?.addEventListener('click', async () => {
    if (!canUnlearn) return;
    const yes = await showConfirmation(`Unlearn ${s.name}? Skill points will be refunded.`, { danger: true, confirmText: 'Unlearn' });
    if (yes) {
      char.skillsByTier[tier][index] = null;
      closeModal('skill-info');
      onChange();
    }
  });
}

// ─── Inventory Modal ──────────────────────────────────────────────
function openInventoryModal(slotKey) {
  const slotConfig = EQUIPMENT_SLOTS[slotKey];
  const typeFilter = slotConfig.type;

  const ownedOfType = char.ownedItems
    .map(id => libs.items.find(item => item.id === id))
    .filter(item => item && item.type === typeFilter);

  let bodyHtml = `<input type="text" class="modal-search" id="inv-search" placeholder="Search inventory...">`;
  bodyHtml += `<div class="modal-grid" id="inv-grid"></div>`;

  const body = document.createElement('div');
  body.innerHTML = bodyHtml;
  openModal({ id: 'inventory', title: `Inventory — ${typeFilter}`, body });

  const renderGrid = (filter = '') => {
    const grid = document.getElementById('inv-grid');
    const filtered = ownedOfType.filter(i => i.name.toLowerCase().includes(filter));

    // Add "Unequip" option if slot has an item
    let unequipHtml = '';
    if (char.equipment[slotKey]) {
      unequipHtml = `<div class="card" id="inv-unequip" style="border-color: var(--danger);">
        <div style="height: 90px; display: flex; align-items: center; justify-content: center; color: var(--danger); font-size: 2rem;">✕</div>
        <div class="card-title" style="color: var(--danger);">Unequip</div>
      </div>`;
    }

    grid.innerHTML = unequipHtml + (filtered.length === 0 ? `<p style="color: var(--text-muted);">No ${typeFilter}s owned.</p>` :
      filtered.map(item => `
        <div class="card" data-equip-item="${item.id}">
          <img src="${item.image || ''}" alt="${item.name}">
          <div class="card-title">${item.name}</div>
          <div class="card-actions">
            <button data-item-info="${item.id}" class="btn-sm">ℹ</button>
          </div>
        </div>
      `).join(''));

    document.getElementById('inv-unequip')?.addEventListener('click', () => {
      char.equipment[slotKey] = null;
      if (char.selectedWeaponSlot === slotKey) char.selectedWeaponSlot = null;
      closeModal('inventory');
      onChange();
    });

    grid.querySelectorAll('[data-equip-item]').forEach(card => {
      card.addEventListener('click', () => {
        const item = libs.items.find(i => i.id === card.dataset.equipItem);
        if (!item) return;

        // Check duplicate equip
        const otherSlots = Object.entries(char.equipment)
          .filter(([k]) => k !== slotKey && EQUIPMENT_SLOTS[k]?.type === typeFilter);
        for (const [otherKey, otherItem] of otherSlots) {
          if (otherItem && otherItem.id === item.id) {
            showNotification(`Cannot equip same ${typeFilter} twice`, 'danger');
            return;
          }
        }

        char.equipment[slotKey] = item;
        if (item.type === 'weapon' && !char.selectedWeaponSlot) char.selectedWeaponSlot = slotKey;
        closeModal('inventory');
        onChange();
      });
    });

    grid.querySelectorAll('[data-item-info]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = libs.items.find(i => i.id === btn.dataset.itemInfo);
        if (item) openItemInfoModal(item);
      });
    });
  };

  renderGrid();
  document.getElementById('inv-search')?.addEventListener('input', e => renderGrid(e.target.value.toLowerCase()));
}

// ─── Beast Select Modal ───────────────────────────────────────────
function openBeastSelectModal(slotKey) {
  const tamed = Object.keys(char.ownedBeasts)
    .map(id => libs.beasts.find(b => b.id === id))
    .filter(Boolean);

  let unequipHtml = '';
  if (char.equipment[slotKey]) {
    unequipHtml = `<div class="card" id="beast-unequip" style="border-color: var(--danger);">
      <div style="height: 90px; display: flex; align-items: center; justify-content: center; color: var(--danger); font-size: 2rem;">✕</div>
      <div class="card-title" style="color: var(--danger);">Unequip</div>
    </div>`;
  }

  const bodyHtml = `<div class="modal-grid">${unequipHtml}${tamed.length === 0 ? '<p style="color: var(--text-muted);">No tamed beasts.</p>' :
    tamed.map(b => {
      const lvl = char.ownedBeasts[b.id]?.level || 1;
      return `<div class="card" data-select-beast="${b.id}">
        <img src="${b.image || ''}" alt="${b.name}">
        <div class="card-title">${b.name}</div>
        <div class="card-subtitle">Lv. ${lvl}</div>
      </div>`;
    }).join('')
    }</div>`;

  openModal({ id: 'beast-select', title: 'Select Beast', body: bodyHtml });

  document.getElementById('beast-unequip')?.addEventListener('click', () => {
    char.equipment[slotKey] = null;
    closeModal('beast-select');
    onChange();
  });

  document.querySelectorAll('[data-select-beast]').forEach(card => {
    card.addEventListener('click', () => {
      const beast = libs.beasts.find(b => b.id === card.dataset.selectBeast);
      if (!beast) return;
      // Check duplicate
      const otherSlot = slotKey === 'beast1' ? 'beast2' : 'beast1';
      if (char.equipment[otherSlot]?.id === beast.id) {
        showNotification('Cannot equip same beast twice', 'danger');
        return;
      }
      char.equipment[slotKey] = beast;
      closeModal('beast-select');
      onChange();
    });
  });
}

// ─── Item Info Modal ──────────────────────────────────────────────
function openItemInfoModal(item) {
  const body = `
    <div style="text-align: center; margin-bottom: var(--space-4);">
      <img src="${item.image || ''}" alt="${item.name}" style="max-width: 150px; border-radius: var(--radius-md);">
    </div>
    <div style="display: grid; gap: var(--space-2); font-size: var(--text-sm);">
      <div><strong>Type:</strong> ${item.type}</div>
      ${item.stat ? `<div><strong>Stat:</strong> ${item.stat}</div>` : ''}
      ${item.modifier ? `<div><strong>Modifier:</strong> +${item.modifier}</div>` : ''}
      ${item.spiritBonus ? `<div><strong>Spirit Bonus:</strong> +${item.spiritBonus}</div>` : ''}
      <div><strong>Effect:</strong> ${item.specialEffect || 'None'}</div>
      ${item.type === 'lighthouse' ? `
        <hr style="border-color: var(--border-subtle);">
        <div><strong>Radius:</strong> ${item.radius || 'N/A'}</div>
        <div><strong>Speed:</strong> ${item.speed || 'N/A'}</div>
        <div><strong>Abilities:</strong> ${(item.abilities || []).join(', ') || 'None'}</div>
        <div><strong>Sockets:</strong> ${item.sockets || 0}</div>
      ` : ''}
    </div>
  `;
  openModal({ id: 'item-info', title: item.name, size: 'sm', body });
}

// ─── Shop Modal ───────────────────────────────────────────────────
function openShopModal() {
  if (!shopSettings.isShopOpen) {
    showNotification('Shop is currently closed', 'info');
    return;
  }

  const shopItems = (shopSettings.shopItems || []).map(si => {
    const libItem = libs.items.find(i => i.id === si.id);
    return libItem ? { ...libItem, shopPrice: si.price, shopStock: si.stock } : null;
  }).filter(Boolean);

  const body = `<div class="modal-grid">${shopItems.length === 0 ? '<p style="color: var(--text-muted);">Shop is empty.</p>' :
    shopItems.map(item => {
      const owned = char.ownedItems.includes(item.id);
      const outOfStock = item.shopStock !== undefined && item.shopStock !== null && item.shopStock <= 0;
      const canBuy = !owned && !outOfStock && (char.currency || 0) >= item.shopPrice;
      return `<div class="card ${(!canBuy && !owned) ? 'disabled' : ''}">
        <img src="${item.image || ''}" alt="${item.name}">
        <div class="card-title">${item.name}</div>
        <div class="card-subtitle">${item.shopPrice} P${item.shopStock !== undefined ? ` • Stock: ${item.shopStock}` : ''}</div>
        <button class="btn-sm ${owned ? '' : 'btn-accent'}" data-buy-item="${item.id}" data-price="${item.shopPrice}" ${!canBuy || owned ? 'disabled' : ''} style="margin-top: var(--space-2); width: 100%;">
          ${owned ? 'Owned' : outOfStock ? 'Sold Out' : 'Buy'}
        </button>
      </div>`;
    }).join('')
    }</div>`;

  openModal({ id: 'shop', title: `Shop — ${char.currency || 0} Points`, body });

  document.querySelectorAll('[data-buy-item]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const itemId = btn.dataset.buyItem;
      const price = parseInt(btn.dataset.price);
      try {
        await buyItem(currentUser.uid, itemId, price);
        char.currency -= price;
        char.ownedItems.push(itemId);
        closeModal('shop');
        onChange();
        showNotification('Purchase successful!', 'success');
      } catch (err) {
        showNotification(err.message, 'danger');
      }
    });
  });
}

// ─── Sell Modal ───────────────────────────────────────────────────
function openSellModal() {
  const equippedIds = Object.values(char.equipment).filter(Boolean).map(i => i.id);
  const sellable = char.ownedItems
    .map(id => libs.items.find(i => i.id === id))
    .filter(i => i && !equippedIds.includes(i.id));

  const body = `<p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-3);">List items for sale. The GM will approve and set the price.</p>
  <div class="modal-grid">${sellable.length === 0 ? '<p style="color: var(--text-muted);">No unequipped items.</p>' :
      sellable.map(item => `<div class="card" data-sell-item="${item.id}">
      <img src="${item.image || ''}" alt="${item.name}">
      <div class="card-title">${item.name}</div>
      <button class="btn-sm btn-ghost" style="margin-top: var(--space-2); width: 100%;">List for Sale</button>
    </div>`).join('')
    }</div>`;

  openModal({ id: 'sell', title: 'Sell Items', body });

  document.querySelectorAll('[data-sell-item]').forEach(card => {
    card.addEventListener('click', async () => {
      const itemId = card.dataset.sellItem;
      const item = libs.items.find(i => i.id === itemId);
      const yes = await showConfirmation(`List ${item.name} for sale? It will be removed from your inventory until approved.`, { confirmText: 'List for Sale' });
      if (!yes) return;
      try {
        await listItemForSale(currentUser.uid, currentUser.displayName, itemId, item.name);
        char.ownedItems = char.ownedItems.filter(id => id !== itemId);
        closeModal('sell');
        onChange();
        showNotification(`${item.name} listed for sale`, 'success');
      } catch (err) {
        showNotification(err.message, 'danger');
      }
    });
  });
}

// ─── Trade Modal ──────────────────────────────────────────────────
function openTradeModal() {
  const others = partyMembers.filter(p => p.uid !== currentUser.uid);
  if (others.length === 0) {
    showNotification('No party members to trade with', 'info');
    return;
  }

  const equippedIds = Object.values(char.equipment).filter(Boolean).map(i => i.id);
  const tradableItems = char.ownedItems
    .map(id => libs.items.find(i => i.id === id))
    .filter(i => i && !equippedIds.includes(i.id));

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="margin-bottom: var(--space-4);">
      <label>Send to:</label>
      <select id="trade-target">
        ${others.map(p => `<option value="${p.uid}">${p.name || 'Unnamed'}</option>`).join('')}
      </select>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
      <div>
        <h4 style="margin-bottom: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Send Item</h4>
        <div class="modal-grid" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));">
          ${tradableItems.map(i => `<div class="card" data-trade-item="${i.id}" style="padding: var(--space-2);">
            <img src="${i.image || ''}" alt="${i.name}" style="height: 60px;">
            <div class="card-title" style="font-size: var(--text-xs);">${i.name}</div>
          </div>`).join('') || '<p style="color: var(--text-muted); font-size: var(--text-xs);">No items to trade</p>'}
        </div>
      </div>
      <div>
        <h4 style="margin-bottom: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Send Points</h4>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <input type="number" id="trade-amount" placeholder="Amount" min="1" style="flex: 1;">
          <button class="btn-sm btn-accent" id="trade-send-points">Send</button>
        </div>
        <div style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-muted);">Your balance: ${char.currency || 0} P</div>
      </div>
    </div>
  `;

  openModal({ id: 'trade', title: 'Trade', body });

  document.querySelectorAll('[data-trade-item]').forEach(card => {
    card.addEventListener('click', async () => {
      const itemId = card.dataset.tradeItem;
      const item = libs.items.find(i => i.id === itemId);
      const targetUid = document.getElementById('trade-target').value;
      const targetName = others.find(p => p.uid === targetUid)?.name || 'player';
      const yes = await showConfirmation(`Send ${item.name} to ${targetName}?`);
      if (!yes) return;
      try {
        await sendItem(currentUser.uid, targetUid, itemId);
        char.ownedItems = char.ownedItems.filter(id => id !== itemId);
        closeModal('trade');
        onChange();
        showNotification(`Sent ${item.name} to ${targetName}`, 'success');
      } catch (err) { showNotification(err.message, 'danger'); }
    });
  });

  document.getElementById('trade-send-points')?.addEventListener('click', async () => {
    const amount = parseInt(document.getElementById('trade-amount').value);
    if (isNaN(amount) || amount <= 0) { showNotification('Enter valid amount', 'danger'); return; }
    const targetUid = document.getElementById('trade-target').value;
    const targetName = others.find(p => p.uid === targetUid)?.name || 'player';
    const yes = await showConfirmation(`Send ${amount} points to ${targetName}?`);
    if (!yes) return;
    try {
      await sendCurrency(currentUser.uid, targetUid, amount);
      char.currency -= amount;
      closeModal('trade');
      onChange();
      showNotification(`Sent ${amount}P to ${targetName}`, 'success');
    } catch (err) { showNotification(err.message, 'danger'); }
  });
}

// ─── Compendium Modal ─────────────────────────────────────────────
function openCompendiumModal() {
  let activeTab = 'items';

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="tab-bar">
      <button class="active" data-comp-tab="items">Equipment</button>
      <button data-comp-tab="beasts">Bestiary</button>
    </div>
    <input type="text" class="modal-search" id="comp-search" placeholder="Search...">
    <div class="modal-grid" id="comp-grid"></div>
  `;

  openModal({ id: 'compendium', title: 'Compendium', size: 'lg', body });

  const renderComp = (filter = '') => {
    const lib = activeTab === 'items' ? libs.items : libs.beasts;
    const grid = document.getElementById('comp-grid');
    const filtered = lib.filter(e => e.name.toLowerCase().includes(filter));

    grid.innerHTML = filtered.map(entry => {
      const disc = entry.isDiscovered !== false;
      return `<div class="card ${!disc ? 'disabled' : ''}" ${disc ? `data-comp-info="${entry.id}"` : ''}>
        <img src="${disc ? (entry.image || '') : ''}" alt="${disc ? entry.name : '???'}">
        <div class="card-title">${disc ? entry.name : '???'}</div>
      </div>`;
    }).join('') || '<p style="color: var(--text-muted);">No entries.</p>';

    grid.querySelectorAll('[data-comp-info]').forEach(card => {
      card.addEventListener('click', () => {
        const entry = (activeTab === 'items' ? libs.items : libs.beasts).find(e => e.id === card.dataset.compInfo);
        if (entry) openItemInfoModal(entry);
      });
    });
  };

  body.querySelectorAll('[data-comp-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-comp-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.compTab;
      renderComp(document.getElementById('comp-search').value.toLowerCase());
    });
  });
  document.getElementById('comp-search').addEventListener('input', e => renderComp(e.target.value.toLowerCase()));
  renderComp();
}

// ─── Special Items Modal ──────────────────────────────────────────
function openSpecialItemsModal() {
  const renderItems = () => {
    const body = getModalBody('special-items');
    if (!body) return;
    body.innerHTML = (char.specialItems || []).length === 0
      ? '<p style="color: var(--text-muted);">No special items.</p>'
      : char.specialItems.map((item, i) => `
        <div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-3);">
          <div style="font-weight: 600;">${esc(item.name)}</div>
          <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); white-space: pre-wrap;">${esc(item.desc || '')}</div>
        </div>
      `).join('');
  };

  openModal({ id: 'special-items', title: 'Special Items', body: '' });
  renderItems();
}

// ─── Save / Change Handlers ──────────────────────────────────────
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
      console.error('Save failed:', err);
      showNotification('Save failed!', 'danger');
    }
  }, AUTOSAVE_DELAY);
}

async function handleSignOut() {
  if (unsubCharListener) unsubCharListener();
  if (unsubShopListener) unsubShopListener();
  try { await signOut(); window.location.href = '/'; }
  catch (err) { showNotification('Sign out failed', 'danger'); }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────
init();
