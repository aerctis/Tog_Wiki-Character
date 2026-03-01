// src/pages/admin/dashboard.js
// Admin dashboard — player management, content CRUD, shop, market.

import { waitForAuth, signOut, isCurrentUserAdmin } from '../../services/auth.service.js';
import { fetchAllLibraries, listenToCollection } from '../../services/library.service.js';
import { initNotifications, showNotification } from '../../components/shared/notification.js';
import { openModal, closeModal, showConfirmation, getModalBody, showInputModal } from '../../components/shared/modal.js';
import { STATS, POSITIONS, BEAST_TIERS, EQUIPMENT_SLOTS } from '../../config/constants.js';
import {
  getPartyMembers, setPartyMembers, fetchPartyCharacters, fetchAllUsers,
  setPlayerLevel, setPlayerFloor, adjustPlayerCurrency, setPlayerStatMultiplier,
  adjustBonusStatPoints, adjustBonusSkillPoints, adjustBeastPoints,
  resetPlayerStats, grantDeallocationPoints, addSkillSlots, removeSkillSlot,
  giveItem, removeItem, giveBeast, setBeastLevel, addProficiency, removeProficiency,
  addSpecialItem, removeSpecialItem, levelUpAll,
  saveSkill, deleteSkill, saveItem, deleteItem, saveBeast, deleteBeast,
  saveSynergy, deleteSynergy, toggleDiscovery,
  getShopSettings, setShopOpen, setShopItems,
  fetchMarketListings, approveMarketSale, rejectMarketSale, fetchBeastSynergies
} from '../../services/admin.service.js';
import { listenToCharacter } from '../../services/character.service.js';
import { calculateBeastStats, getBeastAbilities } from '../../systems/beast-system.js';
import { calculateBaseStats, calculateTotalStats, calculateStatCap, calculateAvailableStatPoints } from '../../systems/stat-calculator.js';
import { aggregateSkillBonuses, calculateUsedSkillPoints, calculateAvailableSkillPoints, calculateSpirit, getActiveTiers } from '../../systems/skill-engine.js';
import { calculateMaxHP, calculateSpeed, calculateAttack, calculateDefense } from '../../systems/combat-math.js';
import { fetchPlayerDiscovery, setDiscoveryLevel, setDiscoveryLevelForAll } from '../../services/discovery.service.js';

let libs = { skills: [], items: [], beasts: [], synergies: [] };
let partyUids = [];
let partyChars = [];
let allUsers = [];
let shopSettings = {};
let currentUser = null;
let charListeners = {};
let activeTab = 'players';

async function init() {
  initNotifications();
  const user = await waitForAuth();
  if (!user) { window.location.href = '/'; return; }
  currentUser = user;

  document.getElementById('user-display-name').textContent = user.displayName || '';
  document.getElementById('btn-sign-out').addEventListener('click', async () => { await signOut(); window.location.href = '/'; });

  if (!(await isCurrentUserAdmin())) {
    showNotification('Access denied — admin only.', 'danger');
    setTimeout(() => { window.location.href = '/sheet.html'; }, 1500);
    return;
  }

  try {
    [libs, partyUids, allUsers, shopSettings] = await Promise.all([
      fetchAllLibraries(), getPartyMembers(), fetchAllUsers(), getShopSettings()
    ]);
    libs.synergies = await fetchBeastSynergies();
    if (partyUids.length > 0) partyChars = await fetchPartyCharacters(partyUids);
  } catch (err) {
    console.error('Admin load error:', err);
    showNotification('Failed to load data', 'danger');
    return;
  }

  // Real-time listeners for party characters
  for (const uid of partyUids) {
    charListeners[uid] = listenToCharacter(uid, data => {
      const idx = partyChars.findIndex(c => c.uid === uid);
      if (idx >= 0) partyChars[idx] = { uid, ...data };
      else partyChars.push({ uid, ...data });
      if (activeTab === 'players') renderPlayersTab();
    });
  }

  // Real-time library updates
  listenToCollection('skills', data => { libs.skills = data; });
  listenToCollection('items', data => { libs.items = data; });
  listenToCollection('beasts', data => { libs.beasts = data; });

  renderTabs();
  renderPlayersTab();
}

// ═══════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════
function renderTabs() {
  const root = document.getElementById('admin-root');
  root.innerHTML = `
    <div class="tab-bar" id="admin-tabs">
      <button class="active" data-tab="players">Players</button>
      <button data-tab="content">Content</button>
      <button data-tab="shop">Shop</button>
      <button data-tab="market">Market</button>
      <button data-tab="party">Party Config</button>
    </div>
    <div id="admin-content"></div>
  `;
  root.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => {
      root.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      const renderers = { players: renderPlayersTab, content: renderContentTab, shop: renderShopTab, market: renderMarketTab, party: renderPartyTab };
      renderers[activeTab]?.();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// PLAYERS TAB — Summary cards + quick actions
// ═══════════════════════════════════════════════════════════════════
function renderPlayersTab() {
  const el = document.getElementById('admin-content');
  if (!el) return;

  let html = `
    <div class="admin-batch-actions">
      <button class="btn-accent btn-sm" id="btn-level-all">⬆ Level Up All</button>
    </div>
    <div class="player-cards-grid">
  `;

  for (const pc of partyChars) {
    const totalAllocated = Object.values(pc.manualStatPoints || {}).reduce((s, v) => s + v, 0);
    const locked = Object.values(pc.lockedStatPoints || {}).reduce((s, v) => s + v, 0);
    const unlocked = totalAllocated - locked;

    html += `
      <div class="admin-player-card">
        <div class="apc-header">
          <div>
            <h4>${esc(pc.name || 'Unnamed')}</h4>
            <span class="apc-position">${pc.position || 'Guide'}</span>
          </div>
          <div class="apc-level">Lv. ${pc.level || 1}</div>
        </div>
        <div class="apc-stats-row">
          <div class="apc-stat"><span class="label">Floor</span><span class="val">${pc.floor || 1}</span></div>
          <div class="apc-stat"><span class="label">HP</span><span class="val">${pc.currentHP || 0}</span></div>
          <div class="apc-stat"><span class="label">Currency</span><span class="val">${pc.currency || 0}</span></div>
          <div class="apc-stat"><span class="label">SP</span><span class="val">${pc.bonusStatPoints || 0}b</span></div>
          <div class="apc-stat"><span class="label">SkP</span><span class="val">${pc.bonusSkillPoints || 0}b</span></div>
          <div class="apc-stat"><span class="label">BP</span><span class="val">${pc.beastPoints || 0}</span></div>
        </div>
        ${unlocked > 0 ? `<div class="apc-warning">⚠ ${unlocked} unlocked stat points</div>` : ''}
        <div class="apc-actions">
          <button class="btn-sm" data-a="level" data-u="${pc.uid}" title="Set Level">Lvl</button>
          <button class="btn-sm" data-a="floor" data-u="${pc.uid}" title="Set Floor">Flr</button>
          <button class="btn-sm" data-a="currency" data-u="${pc.uid}" title="Adjust Currency">Pts</button>
          <button class="btn-sm" data-a="points" data-u="${pc.uid}" title="Grant Points">Pts</button>
          <button class="btn-sm" data-a="items" data-u="${pc.uid}" title="Give/Remove Items">Items</button>
          <button class="btn-sm" data-a="beasts" data-u="${pc.uid}" title="Manage Beasts">Beasts</button>
          <button class="btn-sm" data-a="slots" data-u="${pc.uid}" title="Manage Skill Slots">Slots</button>
          <button class="btn-sm" data-a="profs" data-u="${pc.uid}" title="Proficiencies">Profs</button>
          <button class="btn-sm" data-a="special" data-u="${pc.uid}" title="Special Items">Special</button>
          <button class="btn-sm" data-a="mult" data-u="${pc.uid}" title="Stat Multiplier">×</button>
          <button class="btn-sm" data-a="stats" data-u="${pc.uid}" title="Reset/Dealloc Stats">Stats</button>
          <button class="btn-sm btn-accent" data-a="view" data-u="${pc.uid}">View Sheet</button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  if (partyChars.length === 0) {
    html = '<p style="color: var(--text-muted); padding: var(--space-6); text-align: center;">No party members. Go to Party Config tab to add players.</p>';
  }
  el.innerHTML = html;

  document.getElementById('btn-level-all')?.addEventListener('click', async () => {
    if (await showConfirmation('Level up ALL party members by 1?')) {
      await levelUpAll(partyUids);
      showNotification('All leveled up!', 'success');
    }
  });

  el.querySelectorAll('[data-a]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.u;
      const pc = partyChars.find(c => c.uid === uid);
      if (!pc) return;
      const actions = {
        level: () => promptNumber('Set Level', pc.level || 1, v => setPlayerLevel(uid, v)),
        floor: () => promptNumber('Set Floor', pc.floor || 1, v => setPlayerFloor(uid, v)),
        currency: () => promptAdjust('Adjust Currency (use - for subtract)', v => adjustPlayerCurrency(uid, v)),
        points: () => openPointsModal(uid, pc),
        items: () => openManageItemsModal(uid, pc),
        beasts: () => openManageBeastsModal(uid, pc),
        slots: () => openManageSlotsModal(uid, pc),
        profs: () => openManageProfsModal(uid, pc),
        special: () => openManageSpecialModal(uid, pc),
        mult: () => promptFloat('Set Stat Multiplier', pc.statMultiplier || 2.0, v => setPlayerStatMultiplier(uid, v)),
        stats: () => openStatsResetModal(uid, pc),
        view: () => openViewSheetModal(uid, pc)
      };
      actions[btn.dataset.a]?.();
    });
  });
}

// ─── Quick prompts ────────────────────────────────────────────────
async function promptNumber(label, current, fn) {
  const val = await showInputModal({ title: label, label, currentValue: current, type: 'number', submitLabel: 'Set' });
  if (val === null) return;
  const num = parseInt(val);
  if (isNaN(num) || num < 1) { showNotification('Invalid number', 'danger'); return; }
  try { await fn(num); showNotification(`${label}: ${num}`, 'success'); }
  catch (e) { showNotification(e.message, 'danger'); }
}

async function promptFloat(label, current, fn) {
  const val = await showInputModal({ title: label, label, currentValue: current, type: 'number', submitLabel: 'Set' });
  if (val === null) return;
  const num = parseFloat(val);
  if (isNaN(num)) { showNotification('Invalid number', 'danger'); return; }
  try { await fn(num); showNotification(`${label}: ${num}`, 'success'); }
  catch (e) { showNotification(e.message, 'danger'); }
}

async function promptAdjust(label, fn) {
  const val = await showInputModal({ title: 'Adjust', label: label + ' (use negative to subtract)', type: 'number', defaultValue: '0', submitLabel: 'Apply' });
  if (val === null) return;
  const num = parseInt(val);
  if (isNaN(num) || num === 0) { showNotification('Invalid amount', 'danger'); return; }
  try { await fn(num); showNotification(`Adjusted by ${num > 0 ? '+' : ''}${num}`, 'success'); }
  catch (e) { showNotification(e.message, 'danger'); }
}

// ─── Points Modal (stat/skill/beast points) ──────────────────────
function openPointsModal(uid, pc) {
  const body = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-4);">
      <div class="admin-points-section">
        <h4>Stat Points</h4>
        <div class="admin-points-current">Bonus: ${pc.bonusStatPoints || 0}</div>
        <div style="display: flex; gap: var(--space-2);">
          <input type="number" id="sp-amount" value="1" min="1" style="width: 60px;">
          <button class="btn-sm btn-accent" id="sp-add">+</button>
          <button class="btn-sm" id="sp-sub">−</button>
        </div>
      </div>
      <div class="admin-points-section">
        <h4>Skill Points</h4>
        <div class="admin-points-current">Bonus: ${pc.bonusSkillPoints || 0}</div>
        <div style="display: flex; gap: var(--space-2);">
          <input type="number" id="skp-amount" value="1" min="1" style="width: 60px;">
          <button class="btn-sm btn-accent" id="skp-add">+</button>
          <button class="btn-sm" id="skp-sub">−</button>
        </div>
      </div>
      <div class="admin-points-section">
        <h4>Beast Points</h4>
        <div class="admin-points-current">Total: ${pc.beastPoints || 0}</div>
        <div style="display: flex; gap: var(--space-2);">
          <input type="number" id="bp-amount" value="1" min="1" style="width: 60px;">
          <button class="btn-sm btn-accent" id="bp-add">+</button>
          <button class="btn-sm" id="bp-sub">−</button>
        </div>
      </div>
    </div>
  `;
  openModal({ id: 'points', title: `Points — ${pc.name}`, body });

  const bind = (addId, subId, inputId, fn) => {
    document.getElementById(addId)?.addEventListener('click', async () => {
      const amt = parseInt(document.getElementById(inputId).value) || 1;
      await fn(uid, amt); showNotification(`+${amt}`, 'success');
    });
    document.getElementById(subId)?.addEventListener('click', async () => {
      const amt = parseInt(document.getElementById(inputId).value) || 1;
      await fn(uid, -amt); showNotification(`-${amt}`, 'success');
    });
  };
  bind('sp-add', 'sp-sub', 'sp-amount', adjustBonusStatPoints);
  bind('skp-add', 'skp-sub', 'skp-amount', adjustBonusSkillPoints);
  bind('bp-add', 'bp-sub', 'bp-amount', adjustBeastPoints);
}

// ─── Manage Items Modal ──────────────────────────────────────────
function openManageItemsModal(uid, pc) {
  const render = () => {
    const b = getModalBody('manage-items');
    if (!b) return;
    const owned = (pc.ownedItems || []).map(id => libs.items.find(i => i.id === id)).filter(Boolean);
    const discoveredItems = libs.items.filter(i => i.isDiscovered !== false);

    b.innerHTML = `
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Owned Items</h4>
      <div class="modal-grid" style="margin-bottom: var(--space-4);">
        ${owned.length === 0 ? '<p style="color: var(--text-muted);">None</p>' :
        owned.map(item => `<div class="card">
            <img src="${item.image || ''}" alt="${item.name}"><div class="card-title">${item.name}</div>
            <button class="btn-sm" data-remove-item="${item.id}" style="margin-top: var(--space-2); width: 100%;">Remove</button>
          </div>`).join('')}
      </div>
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Give Item</h4>
      <input type="text" id="give-item-search" placeholder="Search items..." class="modal-search">
      <div class="modal-grid" id="give-items-grid"></div>
    `;

    // Remove buttons
    b.querySelectorAll('[data-remove-item]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await removeItem(uid, btn.dataset.removeItem);
        pc.ownedItems = (pc.ownedItems || []).filter(id => id !== btn.dataset.removeItem);
        showNotification('Item removed', 'success');
        render();
      });
    });

    // Give items grid
    const renderGiveGrid = (filter = '') => {
      const grid = document.getElementById('give-items-grid');
      const filtered = discoveredItems.filter(i => i.name.toLowerCase().includes(filter));
      grid.innerHTML = filtered.map(item => `<div class="card" data-give-item="${item.id}">
        <img src="${item.image || ''}" alt="${item.name}"><div class="card-title">${item.name}</div>
      </div>`).join('') || '<p style="color: var(--text-muted);">No items.</p>';
      grid.querySelectorAll('[data-give-item]').forEach(card => {
        card.addEventListener('click', async () => {
          await giveItem(uid, card.dataset.giveItem);
          if (!pc.ownedItems) pc.ownedItems = [];
          pc.ownedItems.push(card.dataset.giveItem);
          showNotification('Item given!', 'success');
          render();
        });
      });
    };
    renderGiveGrid();
    document.getElementById('give-item-search')?.addEventListener('input', e => renderGiveGrid(e.target.value.toLowerCase()));
  };

  openModal({ id: 'manage-items', title: `Items — ${pc.name}`, size: 'lg', body: '' });
  render();
}

// ─── Manage Beasts Modal ─────────────────────────────────────────
function openManageBeastsModal(uid, pc) {
  const render = () => {
    const b = getModalBody('manage-beasts');
    if (!b) return;
    const owned = Object.entries(pc.ownedBeasts || {}).map(([id, data]) => {
      const beast = libs.beasts.find(b => b.id === id);
      return beast ? { ...beast, playerData: data } : null;
    }).filter(Boolean);

    b.innerHTML = `
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Tamed Beasts (BP: ${pc.beastPoints || 0})</h4>
      <div class="modal-grid" style="margin-bottom: var(--space-4);">
        ${owned.length === 0 ? '<p style="color: var(--text-muted);">None</p>' :
        owned.map(beast => `<div class="card">
            <img src="${beast.image || ''}" alt="${beast.name}"><div class="card-title">${beast.name}</div>
            <div class="card-subtitle">Lv. ${beast.playerData.level}</div>
            <div style="display: flex; gap: var(--space-1); margin-top: var(--space-2);">
              <button class="btn-sm" data-beast-delevel="${beast.id}" ${beast.playerData.level <= 1 ? 'disabled' : ''}>−</button>
              <button class="btn-sm" data-beast-lvlup="${beast.id}">+</button>
            </div>
          </div>`).join('')}
      </div>
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Give Beast</h4>
      <div class="modal-grid" id="give-beasts-grid">
        ${libs.beasts.filter(b => b.isDiscovered !== false).map(beast => `<div class="card" data-give-beast="${beast.id}">
          <img src="${beast.image || ''}" alt="${beast.name}"><div class="card-title">${beast.name}</div>
          <div class="card-subtitle">Tier ${beast.tier || 1}</div>
        </div>`).join('') || '<p style="color: var(--text-muted);">No beasts in library.</p>'}
      </div>
    `;

    b.querySelectorAll('[data-beast-delevel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.beastDelevel;
        const newLvl = (pc.ownedBeasts[id]?.level || 1) - 1;
        if (newLvl < 1) return;
        await setBeastLevel(uid, id, newLvl);
        pc.ownedBeasts[id].level = newLvl;
        showNotification('Beast de-leveled', 'success');
        render();
      });
    });
    b.querySelectorAll('[data-beast-lvlup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.beastLvlup;
        const newLvl = (pc.ownedBeasts[id]?.level || 1) + 1;
        await setBeastLevel(uid, id, newLvl);
        pc.ownedBeasts[id].level = newLvl;
        showNotification('Beast leveled up', 'success');
        render();
      });
    });
    b.querySelectorAll('[data-give-beast]').forEach(card => {
      card.addEventListener('click', async () => {
        await giveBeast(uid, card.dataset.giveBeast);
        if (!pc.ownedBeasts) pc.ownedBeasts = {};
        pc.ownedBeasts[card.dataset.giveBeast] = { level: 1, nickname: '' };
        showNotification('Beast given!', 'success');
        render();
      });
    });
  };
  openModal({ id: 'manage-beasts', title: `Beasts — ${pc.name}`, size: 'lg', body: '' });
  render();
}

// ─── Manage Skill Slots Modal ────────────────────────────────────
function openManageSlotsModal(uid, pc) {
  const render = () => {
    const b = getModalBody('manage-slots');
    if (!b) return;
    const existingTiers = Object.keys(pc.skillsByTier || {}).map(Number).filter(t => !isNaN(t)).sort((a,b) => a-b);
    const maxTier = Math.max(5, ...existingTiers, 0);
    let html = '';
    for (let tier = 1; tier <= maxTier; tier++) {
      const slots = pc.skillsByTier?.[tier] || pc.skillsByTier?.[String(tier)] || [];
      html += `<div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
        <span><strong>Tier ${tier}</strong> — ${slots.length} slot${slots.length !== 1 ? 's' : ''}</span>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn-sm" data-slot-remove="${tier}" ${slots.length === 0 ? 'disabled' : ''}>−</button>
          <button class="btn-sm btn-accent" data-slot-add="${tier}">+</button>
        </div>
      </div>`;
    }
    html += `<div style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-color); display: flex; gap: var(--space-2); align-items: center;">
      <label style="font-size: var(--text-xs); color: var(--text-muted);">New Tier:</label>
      <input type="number" id="new-tier-input" min="1" value="${maxTier + 1}" style="width: 60px;">
      <button class="btn-sm btn-accent" id="btn-add-new-tier">Add Tier Slot</button>
    </div>`;
    b.innerHTML = html;

    b.querySelectorAll('[data-slot-add]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const t = parseInt(btn.dataset.slotAdd);
        await addSkillSlots(uid, t);
        if (!pc.skillsByTier) pc.skillsByTier = {};
        if (!pc.skillsByTier[t]) pc.skillsByTier[t] = [];
        pc.skillsByTier[t].push(null);
        showNotification('Slot added', 'success');
        render();
      });
    });
    b.querySelectorAll('[data-slot-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const t = parseInt(btn.dataset.slotRemove);
        await removeSkillSlot(uid, t);
        if (pc.skillsByTier?.[t]?.length > 0) pc.skillsByTier[t].pop();
        showNotification('Slot removed', 'success');
        render();
      });
    });
    b.querySelector('#btn-add-new-tier')?.addEventListener('click', async () => {
      const t = parseInt(b.querySelector('#new-tier-input').value);
      if (isNaN(t) || t < 1) { showNotification('Invalid tier number', 'danger'); return; }
      await addSkillSlots(uid, t);
      if (!pc.skillsByTier) pc.skillsByTier = {};
      if (!pc.skillsByTier[t]) pc.skillsByTier[t] = [];
      pc.skillsByTier[t].push(null);
      showNotification(`Tier ${t} slot added`, 'success');
      render();
    });
  };
  openModal({ id: 'manage-slots', title: `Skill Slots — ${pc.name}`, size: 'sm', body: '' });
  render();
}

// ─── Manage Proficiencies Modal ──────────────────────────────────
function openManageProfsModal(uid, pc) {
  const render = () => {
    const b = getModalBody('manage-profs');
    if (!b) return;
    const current = pc.proficientCategories || [];
    const allTypes = [...new Set(libs.skills.map(s => s.skillType).filter(Boolean))];
    const available = allTypes.filter(t => !current.includes(t));

    b.innerHTML = `
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Current Proficiencies</h4>
      <div class="tag-list" style="margin-bottom: var(--space-4);">
        ${current.length === 0 ? '<span style="color: var(--text-muted);">None</span>' :
        current.map(c => `<span class="tag">${c}<span class="tag-remove" data-remove-prof="${c}">×</span></span>`).join('')}
      </div>
      <h4 style="margin-bottom: var(--space-3); color: var(--text-secondary);">Add Proficiency</h4>
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
        ${available.map(t => `<button class="btn-sm" data-add-prof="${t}">${t}</button>`).join('') || '<span style="color: var(--text-muted);">All assigned</span>'}
      </div>
      <div style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle);">
        <label>Custom:</label>
        <div style="display: flex; gap: var(--space-2);">
          <input type="text" id="custom-prof-name" placeholder="Category name...">
          <button class="btn-sm btn-accent" id="add-custom-prof">Add</button>
        </div>
      </div>
    `;

    b.querySelectorAll('[data-remove-prof]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await removeProficiency(uid, btn.dataset.removeProf);
        pc.proficientCategories = current.filter(c => c !== btn.dataset.removeProf);
        showNotification('Removed', 'success'); render();
      });
    });
    b.querySelectorAll('[data-add-prof]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await addProficiency(uid, btn.dataset.addProf);
        if (!pc.proficientCategories) pc.proficientCategories = [];
        pc.proficientCategories.push(btn.dataset.addProf);
        showNotification('Added', 'success'); render();
      });
    });
    document.getElementById('add-custom-prof')?.addEventListener('click', async () => {
      const name = document.getElementById('custom-prof-name')?.value?.trim();
      if (!name) return;
      await addProficiency(uid, name);
      if (!pc.proficientCategories) pc.proficientCategories = [];
      pc.proficientCategories.push(name);
      showNotification('Added', 'success'); render();
    });
  };
  openModal({ id: 'manage-profs', title: `Proficiencies — ${pc.name}`, body: '' });
  render();
}

// ─── Manage Special Items Modal ──────────────────────────────────
function openManageSpecialModal(uid, pc) {
  const render = () => {
    const b = getModalBody('manage-special');
    if (!b) return;
    const items = pc.specialItems || [];
    b.innerHTML = `
      ${items.map((item, i) => `<div style="background: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-2); display: flex; justify-content: space-between; align-items: flex-start;">
        <div><strong>${esc(item.name)}</strong><div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">${esc(item.desc || '')}</div></div>
        <button class="btn-sm" data-remove-special="${i}" style="flex-shrink: 0;">×</button>
      </div>`).join('') || '<p style="color: var(--text-muted); margin-bottom: var(--space-3);">None</p>'}
      <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-3); margin-top: var(--space-3);">
        <input type="text" id="special-name" placeholder="Item name..." style="margin-bottom: var(--space-2);">
        <textarea id="special-desc" placeholder="Description..." style="width: 100%; min-height: 60px; resize: vertical; margin-bottom: var(--space-2);"></textarea>
        <button class="btn-sm btn-accent" id="add-special">Add Special Item</button>
      </div>
    `;
    b.querySelectorAll('[data-remove-special]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await removeSpecialItem(uid, parseInt(btn.dataset.removeSpecial));
        pc.specialItems.splice(parseInt(btn.dataset.removeSpecial), 1);
        showNotification('Removed', 'success'); render();
      });
    });
    document.getElementById('add-special')?.addEventListener('click', async () => {
      const name = document.getElementById('special-name')?.value?.trim();
      const desc = document.getElementById('special-desc')?.value?.trim();
      if (!name) { showNotification('Enter a name', 'danger'); return; }
      await addSpecialItem(uid, { name, desc: desc || '' });
      if (!pc.specialItems) pc.specialItems = [];
      pc.specialItems.push({ name, desc: desc || '' });
      showNotification('Added!', 'success'); render();
    });
  };
  openModal({ id: 'manage-special', title: `Special Items — ${pc.name}`, body: '' });
  render();
}

// ─── Stats Reset/Dealloc Modal ───────────────────────────────────
function openStatsResetModal(uid, pc) {
  const body = `
    <div style="display: grid; gap: var(--space-4);">
      <div>
        <h4>Grant Deallocation Points</h4>
        <p style="color: var(--text-secondary); font-size: var(--text-sm);">Player can use these to unlock and remove locked stat points.</p>
        <div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">
          <input type="number" id="dealloc-amount" value="1" min="1" style="width: 60px;">
          <button class="btn-sm btn-accent" id="grant-dealloc">Grant</button>
        </div>
        <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1);">Current: ${pc.deallocationPoints || 0}</div>
      </div>
      <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-4);">
        <h4>Full Stat Reset</h4>
        <p style="color: var(--text-secondary); font-size: var(--text-sm);">Reset ALL stat allocations to 0 (both locked and unlocked).</p>
        <button class="btn-sm btn-danger" id="full-reset" style="margin-top: var(--space-2);">Full Reset</button>
      </div>
    </div>
  `;
  openModal({ id: 'stats-reset', title: `Stats — ${pc.name}`, size: 'sm', body });

  document.getElementById('grant-dealloc')?.addEventListener('click', async () => {
    const amt = parseInt(document.getElementById('dealloc-amount').value) || 1;
    await grantDeallocationPoints(uid, amt);
    showNotification(`Granted ${amt} deallocation point(s)`, 'success');
    closeModal('stats-reset');
  });
  document.getElementById('full-reset')?.addEventListener('click', async () => {
    if (await showConfirmation('Full reset all stat allocations? This cannot be undone.', { danger: true })) {
      await resetPlayerStats(uid);
      showNotification('Stats reset!', 'success');
      closeModal('stats-reset');
    }
  });
}

// ─── View Full Sheet Modal ───────────────────────────────────────
function openViewSheetModal(uid, pc) {
  const baseStats = calculateBaseStats(pc.level || 1, pc.position || 'Guide', pc.affinities || {}, pc.manualStatPoints || {});
  const skillBonuses = aggregateSkillBonuses(pc.skillsByTier || {}, pc.proficientSkills || []);
  const totalStats = calculateTotalStats(baseStats, skillBonuses);
  const spirit = calculateSpirit(pc.skillsByTier || {}, pc.equipment || {});
  const maxHP = calculateMaxHP(totalStats, pc.level || 1, skillBonuses);
  const speed = calculateSpeed(pc.level || 1, pc.floor || 1, totalStats, skillBonuses);

  const statsRows = STATS.map(s => {
    const val = totalStats[s] || 0;
    const manual = pc.manualStatPoints?.[s] || 0;
    const locked = pc.lockedStatPoints?.[s] || 0;
    return `<tr><td>${s}</td><td style="text-align:right; font-weight:600;">${val.toFixed(1)}</td><td style="text-align:right; color: var(--text-muted);">${manual}${locked > 0 ? ` <span style="color: var(--accent); font-size: 0.65rem;">${locked} locked</span>` : ''}</td></tr>`;
  }).join('');

  const equippedItems = Object.entries(pc.equipment || {}).filter(([_, v]) => v).map(([slot, item]) =>
    `<span class="tag">${EQUIPMENT_SLOTS[slot]?.label || slot}: ${item.name}</span>`
  ).join('') || '<span style="color: var(--text-muted);">None</span>';

  const skills = Object.entries(pc.skillsByTier || {}).flatMap(([tier, slots]) =>
    slots.filter(Boolean).map(s => `<span class="tag">T${tier}: ${s.name} (Lv.${s.level})</span>`)
  ).join('') || '<span style="color: var(--text-muted);">None</span>';

  const beasts = Object.entries(pc.ownedBeasts || {}).map(([id, data]) => {
    const b = libs.beasts.find(x => x.id === id);
    return b ? `<span class="tag">${b.name} Lv.${data.level}</span>` : '';
  }).join('') || '<span style="color: var(--text-muted);">None</span>';

  const body = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6);">
      <div>
        <h4 style="color: var(--accent); margin-bottom: var(--space-3);">Identity</h4>
        <div style="font-size: var(--text-sm); display: grid; gap: var(--space-1);">
          <div><strong>Name:</strong> ${esc(pc.name)}</div>
          <div><strong>Race:</strong> ${esc(pc.race)}</div>
          <div><strong>Position:</strong> ${pc.position}</div>
          <div><strong>Level:</strong> ${pc.level} | <strong>Floor:</strong> ${pc.floor}</div>
          <div><strong>HP:</strong> ${pc.currentHP} / ${maxHP}</div>
          <div><strong>Speed:</strong> ${speed}</div>
          <div><strong>Spirit:</strong> ${spirit.current} / ${spirit.max}</div>
          <div><strong>Currency:</strong> ${pc.currency || 0}</div>
          <div><strong>Multiplier:</strong> ${pc.statMultiplier || 2.0}</div>
        </div>
        <h4 style="color: var(--accent); margin: var(--space-4) 0 var(--space-2);">Equipment</h4>
        <div class="tag-list">${equippedItems}</div>
        <h4 style="color: var(--accent); margin: var(--space-4) 0 var(--space-2);">Skills</h4>
        <div class="tag-list">${skills}</div>
        <h4 style="color: var(--accent); margin: var(--space-4) 0 var(--space-2);">Beasts</h4>
        <div class="tag-list">${beasts}</div>
      </div>
      <div>
        <h4 style="color: var(--accent); margin-bottom: var(--space-3);">Stats</h4>
        <table class="stats-table" style="font-size: var(--text-sm);">
          <thead><tr><th>Stat</th><th style="text-align:right;">Total</th><th style="text-align:right;">Alloc</th></tr></thead>
          <tbody>${statsRows}</tbody>
        </table>
        <h4 style="color: var(--accent); margin: var(--space-4) 0 var(--space-2);">Proficiencies</h4>
        <div class="tag-list">${(pc.proficientCategories || []).map(c => `<span class="tag">${c}</span>`).join('') || '<span style="color: var(--text-muted);">None</span>'}</div>
        ${pc.backstory ? `<h4 style="color: var(--accent); margin: var(--space-4) 0 var(--space-2);">Backstory</h4><div style="font-size: var(--text-sm); color: var(--text-secondary); white-space: pre-wrap; max-height: 200px; overflow-y: auto;">${esc(pc.backstory)}</div>` : ''}
      </div>
    </div>
  `;
  openModal({ id: 'view-sheet', title: `${pc.name || 'Unnamed'} — Full Sheet`, size: 'xl', body });
}

// ═══════════════════════════════════════════════════════════════════
// CONTENT TAB — CRUD for skills, items, beasts
// ═══════════════════════════════════════════════════════════════════
function renderContentTab() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  let contentType = 'skills';

  const render = () => {
    const lib = contentType === 'skills' ? libs.skills : contentType === 'items' ? libs.items : libs.beasts;
    el.innerHTML = `
      <div class="tab-bar" style="margin-bottom: var(--space-4);">
        <button class="${contentType === 'skills' ? 'active' : ''}" data-ct="skills">Skills (${libs.skills.length})</button>
        <button class="${contentType === 'items' ? 'active' : ''}" data-ct="items">Items (${libs.items.length})</button>
        <button class="${contentType === 'beasts' ? 'active' : ''}" data-ct="beasts">Beasts (${libs.beasts.length})</button>
      </div>
      <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4);">
        <button class="btn-accent btn-sm" id="btn-create-new">+ New ${contentType.slice(0, -1)}</button>
        <input type="text" id="content-search" placeholder="Search..." style="flex: 1;">
      </div>
      <div class="modal-grid" id="content-grid"></div>
    `;
    el.querySelectorAll('[data-ct]').forEach(btn => {
      btn.addEventListener('click', async () => { contentType = btn.dataset.ct; render(); });
    });
    document.getElementById('btn-create-new')?.addEventListener('click', () => openContentEditor(contentType, null));

    const renderGrid = (filter = '') => {
      const grid = document.getElementById('content-grid');
      const filtered = lib.filter(e => e.name?.toLowerCase().includes(filter));
      grid.innerHTML = filtered.map(entry => `
        <div class="card" data-edit-content="${entry.id}" style="position: relative;">
          <img src="${entry.image || entry.icon || ''}" alt="${entry.name}">
          <div class="card-title">${entry.name || 'Untitled'}</div>
          <div class="card-actions">
            <button class="btn-sm" data-disc-detail="${entry.id}" title="Discovery settings" style="font-size: 0.55rem; padding: 2px 6px;">Discovery</button>
          </div>
        </div>
      `).join('') || '<p style="color: var(--text-muted);">No entries.</p>';

      grid.querySelectorAll('[data-edit-content]').forEach(card => {
        card.addEventListener('click', () => openContentEditor(contentType, card.dataset.editContent));
      });
      grid.querySelectorAll('[data-disc-detail]').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const id = btn.dataset.discDetail;
          const entry = lib.find(e => e.id === id);
          if (!entry) return;
          openDiscoveryModal(contentType, id, entry.name || 'Untitled');
        });
      });
    };
    renderGrid();
    document.getElementById('content-search')?.addEventListener('input', e => renderGrid(e.target.value.toLowerCase()));
  };
  render();
}

async function openDiscoveryModal(category, entryId, entryName) {
  // Load current discovery state for each party member
  const playerStates = [];
  for (const pc of partyChars) {
    try {
      const disc = await fetchPlayerDiscovery(pc.uid);
      const level = disc[category]?.[entryId] || 'undiscovered';
      playerStates.push({ uid: pc.uid, name: pc.name || 'Unnamed', level });
    } catch {
      playerStates.push({ uid: pc.uid, name: pc.name || 'Unnamed', level: 'undiscovered' });
    }
  }

  const levels = ['undiscovered', 'seen', 'learnable', 'learned'];
  const levelLabels = { undiscovered: '✖ Undiscovered', seen: '👁 Seen', learnable: '🕮 Learnable', learned: '✓ Learned' };

  const renderBody = () => {
    const rows = playerStates.map(ps => `
      <div style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
        <span style="flex: 1; font-weight: 500; color: var(--text-bright);">${esc(ps.name)}</span>
        <select class="disc-player-select" data-uid="${ps.uid}" style="font-size: var(--text-xs); padding: 2px 6px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-secondary);">
          ${levels.map(l => `<option value="${l}" ${ps.level === l ? 'selected' : ''}>${levelLabels[l]}</option>`).join('')}
        </select>
        <button class="btn-sm" data-save-player="${ps.uid}" style="font-size: 0.55rem; padding: 2px 6px;">Set</button>
      </div>
    `).join('');

    return `
      <div style="margin-bottom: var(--space-4);">
        <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest); margin-bottom: var(--space-2);">Set for all players</div>
        <div style="display: flex; gap: var(--space-2); align-items: center;">
          <select id="disc-all-select" style="font-size: var(--text-xs); padding: 2px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-secondary); flex: 1;">
            ${levels.map(l => `<option value="${l}">${levelLabels[l]}</option>`).join('')}
          </select>
          <button class="btn-sm btn-accent" id="disc-set-all" style="font-size: 0.55rem; padding: 2px 8px;">Set All</button>
        </div>
      </div>
      <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest); margin-bottom: var(--space-2);">Per player</div>
      ${rows}
    `;
  };

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = renderBody();

  openModal({ id: 'disc-detail', title: `Discovery — ${entryName}`, body: bodyEl, size: 'sm' });

  // Per-player set
  bodyEl.querySelectorAll('[data-save-player]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.savePlayer;
      const select = bodyEl.querySelector(`.disc-player-select[data-uid="${uid}"]`);
      if (!select) return;
      const level = select.value;
      try {
        await setDiscoveryLevel(uid, category, entryId, level);
        const ps = playerStates.find(p => p.uid === uid);
        if (ps) ps.level = level;
        showNotification(`Set to ${level}`, 'success');
      } catch (err) {
        showNotification('Failed: ' + err.message, 'danger');
      }
    });
  });

  // Set all
  document.getElementById('disc-set-all')?.addEventListener('click', async () => {
    const select = document.getElementById('disc-all-select');
    if (!select) return;
    const level = select.value;
    const allUids = partyChars.map(p => p.uid);
    if (await showConfirmation(`Set "${level}" for ALL ${allUids.length} players?`)) {
      try {
        await setDiscoveryLevelForAll(allUids, category, entryId, level);
        playerStates.forEach(ps => ps.level = level);
        bodyEl.innerHTML = renderBody();
        // Re-attach handlers after re-render
        attachDiscHandlers();
        showNotification(`Set to ${level} for all`, 'success');
      } catch (err) {
        showNotification('Failed: ' + err.message, 'danger');
      }
    }
  });

  function attachDiscHandlers() {
    bodyEl.querySelectorAll('[data-save-player]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.savePlayer;
        const select = bodyEl.querySelector(`.disc-player-select[data-uid="${uid}"]`);
        if (!select) return;
        const level = select.value;
        try {
          await setDiscoveryLevel(uid, category, entryId, level);
          const ps = playerStates.find(p => p.uid === uid);
          if (ps) ps.level = level;
          showNotification(`Set to ${level}`, 'success');
        } catch (err) {
          showNotification('Failed: ' + err.message, 'danger');
        }
      });
    });
    document.getElementById('disc-set-all')?.addEventListener('click', async () => {
      const select = document.getElementById('disc-all-select');
      if (!select) return;
      const level = select.value;
      const allUids = partyChars.map(p => p.uid);
      if (await showConfirmation(`Set "${level}" for ALL ${allUids.length} players?`)) {
        try {
          await setDiscoveryLevelForAll(allUids, category, entryId, level);
          playerStates.forEach(ps => ps.level = level);
          bodyEl.innerHTML = renderBody();
          attachDiscHandlers();
          showNotification(`Set to ${level} for all`, 'success');
        } catch (err) {
          showNotification('Failed: ' + err.message, 'danger');
        }
      }
    });
  }
}

function openContentEditor(type, id) {
  const existing = id ? (type === 'skills' ? libs.skills : type === 'items' ? libs.items : libs.beasts).find(e => e.id === id) : null;

  let formHtml = '';
  if (type === 'skills') {
    const s = existing || {};
    formHtml = `
      <div class="admin-form-grid">
        <div class="field-group"><label>Name</label><input type="text" id="ce-name" value="${esc(s.name || '')}"></div>
        <div class="field-group"><label>Icon</label>
          <div style="display:flex;gap:var(--space-2);align-items:center;">
            <input type="text" id="ce-icon" value="${esc(s.icon || '')}" placeholder="Paste URL or upload" style="flex:1;">
            <button class="btn-sm btn-outline" id="ce-img-upload-btn" type="button">Upload</button>
            <input type="file" id="ce-img-file" accept="image/*" style="display:none;">
          </div>
        </div>
        <div class="field-group"><label>Skill Type / Category</label><input type="text" id="ce-skillType" value="${esc(s.skillType || '')}"></div>
        <div class="field-group"><label>Position Tags (comma-sep)</label><input type="text" id="ce-positions" value="${(s.positionTags || []).join(', ')}"></div>
        <div class="field-group"><label>Tier</label><input type="number" id="ce-tier" min="1" value="${s.tier || 1}"></div>
        <div class="field-group"><label>Max Level</label><input type="number" id="ce-maxLevel" value="${s.maxLevel || 5}"></div>
        <div class="field-group"><label>Charges</label><input type="number" id="ce-charges" value="${s.charges || 0}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Description</label><textarea id="ce-desc" style="width:100%; min-height: 80px;">${esc(s.description || '')}</textarea></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Cost per Level (JSON array — index 0 is the learn cost, subsequent are upgrade costs)</label><input type="text" id="ce-costPerLevel" value="${JSON.stringify(s.costPerLevel || [1, 2, 3, 4, 5])}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Spirit Cost per Level (JSON array — leave empty or [0] for no spirit cost)</label><input type="text" id="ce-spiritCostPerLevel" value="${JSON.stringify(s.spiritCostPerLevel || [])}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Effects (JSON array)</label><textarea id="ce-effects" style="width:100%; min-height:100px; font-family: var(--font-mono); font-size: var(--text-xs);">${JSON.stringify(s.effects || [], null, 2)}</textarea></div>
      </div>
      <div class="field-group"><label><input type="checkbox" id="ce-discovered" ${s.isDiscovered !== false ? 'checked' : ''}> Discovered</label></div>
    `;
  } else if (type === 'items') {
    const s = existing || {};
    formHtml = `
      <div class="admin-form-grid">
        <div class="field-group"><label>Name</label><input type="text" id="ce-name" value="${esc(s.name || '')}"></div>
        <div class="field-group"><label>Image</label>
          <div style="display:flex;gap:var(--space-2);align-items:center;">
            <input type="text" id="ce-image" value="${esc(s.image || '')}" placeholder="Paste URL or upload" style="flex:1;">
            <button class="btn-sm btn-outline" id="ce-img-upload-btn" type="button">Upload</button>
            <input type="file" id="ce-img-file" accept="image/*" style="display:none;">
          </div>
          ${s.image ? '<img src="' + '${esc(s.image)}' + '" style="max-height:40px;margin-top:4px;opacity:0.7;">' : ''}
        </div>
        <div class="field-group"><label>Type</label><select id="ce-type">
          ${['weapon', 'armor', 'accessory', 'lighthouse', 'module'].map(t => `<option ${s.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div class="field-group"><label>Stat</label><select id="ce-stat"><option value="">None</option>${STATS.map(st => `<option ${s.stat === st ? 'selected' : ''}>${st}</option>`).join('')}</select></div>
        <div class="field-group"><label>Modifier</label><input type="number" id="ce-modifier" value="${s.modifier || 0}"></div>
        <div class="field-group"><label>Spirit Bonus</label><input type="number" id="ce-spiritBonus" value="${s.spiritBonus || 0}"></div>
        <div class="field-group"><label>Price</label><input type="number" id="ce-price" value="${s.price || 0}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Special Effect</label><input type="text" id="ce-specialEffect" value="${esc(s.specialEffect || '')}"></div>
        <div class="field-group"><label>Radius (lighthouse)</label><input type="number" id="ce-radius" value="${s.radius || 0}"></div>
        <div class="field-group"><label>Speed (lighthouse)</label><input type="number" id="ce-speed" value="${s.speed || 0}"></div>
        <div class="field-group"><label>Sockets (lighthouse)</label><input type="number" id="ce-sockets" value="${s.sockets || 0}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Abilities (lighthouse, comma-sep)</label><input type="text" id="ce-abilities" value="${(s.abilities || []).join(', ')}"></div>
      </div>
      <div class="field-group"><label><input type="checkbox" id="ce-discovered" ${s.isDiscovered !== false ? 'checked' : ''}> Discovered</label></div>
    `;
  } else {
    const s = existing || {};
    formHtml = `
      <div class="admin-form-grid">
        <div class="field-group"><label>Name</label><input type="text" id="ce-name" value="${esc(s.name || '')}"></div>
        <div class="field-group"><label>Image</label>
          <div style="display:flex;gap:var(--space-2);align-items:center;">
            <input type="text" id="ce-image" value="${esc(s.image || '')}" placeholder="Paste URL or upload" style="flex:1;">
            <button class="btn-sm btn-outline" id="ce-img-upload-btn" type="button">Upload</button>
            <input type="file" id="ce-img-file" accept="image/*" style="display:none;">
          </div>
          ${s.image ? '<img src="' + '${esc(s.image)}' + '" style="max-height:40px;margin-top:4px;opacity:0.7;">' : ''}
        </div>
        <div class="field-group"><label>Tier (1-5)</label><input type="number" id="ce-tier" min="1" max="5" value="${s.tier || 1}"></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Description</label><textarea id="ce-desc" style="width:100%; min-height:80px;">${esc(s.description || '')}</textarea></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Base Stats (JSON: {hp, attack, defense, speed})</label><input type="text" id="ce-baseStats" value='${JSON.stringify(s.baseStats || { hp: 10, attack: 5, defense: 5, speed: 5 })}'></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Growth Rates (JSON: {hp, attack, defense, speed})</label><input type="text" id="ce-growthRates" value='${JSON.stringify(s.growthRates || { hp: 2, attack: 1, defense: 1, speed: 1 })}'></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Abilities (JSON array)</label><textarea id="ce-beastAbilities" style="width:100%; min-height:100px; font-family: var(--font-mono); font-size: var(--text-xs);">${JSON.stringify(s.abilities || [], null, 2)}</textarea></div>
        <div class="field-group" style="grid-column: 1/-1;"><label>Synergy Tags (comma-sep)</label><input type="text" id="ce-synergyTags" value="${(s.synergyTags || []).join(', ')}"></div>
      </div>
      <div class="field-group"><label><input type="checkbox" id="ce-discovered" ${s.isDiscovered !== false ? 'checked' : ''}> Discovered</label></div>
    `;
  }

  const footer = `<div class="modal-footer">
    ${existing ? `<button class="btn-danger" id="ce-delete">Delete</button>` : ''}
    <button class="btn-ghost" id="ce-cancel">Cancel</button>
    <button class="btn-accent" id="ce-save">${existing ? 'Save' : 'Create'}</button>
  </div>`;

  openModal({ id: 'content-editor', title: `${existing ? 'Edit' : 'New'} ${type.slice(0, -1)}`, size: 'lg', body: formHtml + footer });

  document.getElementById('ce-cancel')?.addEventListener('click', () => closeModal('content-editor'));

  // Image upload handler — converts file to base64 data URL
  const uploadBtn = document.getElementById('ce-img-upload-btn');
  const fileInput = document.getElementById('ce-img-file');
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 500000) { showNotification('Image too large (max 500KB). Compress or use a URL.', 'danger'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        const target = document.getElementById('ce-image') || document.getElementById('ce-icon');
        if (target) { target.value = e.target.result; }
        showNotification('Image uploaded', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('ce-delete')?.addEventListener('click', async () => {
    if (!await showConfirmation('Delete this entry? This cannot be undone.', { danger: true })) return;
    const deleteFn = type === 'skills' ? deleteSkill : type === 'items' ? deleteItem : deleteBeast;
    await deleteFn(id);
    showNotification('Deleted', 'success');
    closeModal('content-editor');
    renderContentTab();
  });

  document.getElementById('ce-save')?.addEventListener('click', async () => {
    try {
      let data = {};
      if (type === 'skills') {
        const spiritArr = document.getElementById('ce-spiritCostPerLevel').value.trim();
        const parsedSpirit = spiritArr ? JSON.parse(spiritArr) : [];
        data = {
          name: document.getElementById('ce-name').value.trim(),
          icon: document.getElementById('ce-icon').value.trim(),
          skillType: document.getElementById('ce-skillType').value.trim(),
          positionTags: document.getElementById('ce-positions').value.split(',').map(s => s.trim()).filter(Boolean),
          tier: parseInt(document.getElementById('ce-tier').value) || 1,
          maxLevel: parseInt(document.getElementById('ce-maxLevel').value) || 5,
          spiritCostPerLevel: parsedSpirit,
          spiritCost: parsedSpirit.length > 0 ? parsedSpirit[0] : 0,
          charges: parseInt(document.getElementById('ce-charges').value) || 0,
          description: document.getElementById('ce-desc').value.trim(),
          costPerLevel: JSON.parse(document.getElementById('ce-costPerLevel').value),
          effects: JSON.parse(document.getElementById('ce-effects').value),
          isDiscovered: document.getElementById('ce-discovered').checked
        };
        // Auto-create wiki page on new skill creation
        if (!existing && data.name) {
          try {
            const wikiTitle = data.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const { saveWikiPage } = await import('../../services/wiki.service.js');
            const wikiId = await saveWikiPage(null, {
              title: wikiTitle,
              content: `# ${wikiTitle}\n\n*This page is a placeholder for the skill "${data.name}". Edit to add details.*`,
              format: 'markdown',
              isDraft: true,
              linkedSkillId: null, // will be set after skill is saved
              createdAt: new Date().toISOString()
            });
            data.wikiPageId = wikiId;
          } catch (wikiErr) {
            console.warn('Failed to auto-create wiki page:', wikiErr);
          }
        }
      } else if (type === 'items') {
        data = {
          name: document.getElementById('ce-name').value.trim(),
          image: document.getElementById('ce-image').value.trim(),
          type: document.getElementById('ce-type').value,
          stat: document.getElementById('ce-stat').value || null,
          modifier: parseInt(document.getElementById('ce-modifier').value) || 0,
          spiritBonus: parseInt(document.getElementById('ce-spiritBonus').value) || 0,
          price: parseInt(document.getElementById('ce-price').value) || 0,
          specialEffect: document.getElementById('ce-specialEffect').value.trim(),
          radius: parseInt(document.getElementById('ce-radius').value) || 0,
          speed: parseInt(document.getElementById('ce-speed').value) || 0,
          sockets: parseInt(document.getElementById('ce-sockets').value) || 0,
          abilities: document.getElementById('ce-abilities').value.split(',').map(s => s.trim()).filter(Boolean),
          isDiscovered: document.getElementById('ce-discovered').checked
        };
      } else {
        data = {
          name: document.getElementById('ce-name').value.trim(),
          image: document.getElementById('ce-image').value.trim(),
          tier: parseInt(document.getElementById('ce-tier').value) || 1,
          description: document.getElementById('ce-desc').value.trim(),
          baseStats: JSON.parse(document.getElementById('ce-baseStats').value),
          growthRates: JSON.parse(document.getElementById('ce-growthRates').value),
          abilities: JSON.parse(document.getElementById('ce-beastAbilities').value),
          synergyTags: document.getElementById('ce-synergyTags').value.split(',').map(s => s.trim()).filter(Boolean),
          isDiscovered: document.getElementById('ce-discovered')?.checked ?? true
        };
      }
      if (!data.name) { showNotification('Name is required', 'danger'); return; }
      const saveFn = type === 'skills' ? saveSkill : type === 'items' ? saveItem : saveBeast;
      const savedId = await saveFn(id, data);
      // For new skills, update the wiki page with the linkedSkillId
      if (type === 'skills' && !existing && data.wikiPageId && savedId) {
        try {
          const { saveWikiPage } = await import('../../services/wiki.service.js');
          await saveWikiPage(data.wikiPageId, { linkedSkillId: savedId });
        } catch (e) { console.warn('Wiki link update failed:', e); }
      }
      // If skill name changed, update linked wiki page title
      if (type === 'skills' && existing && data.name !== existing.name && existing.wikiPageId) {
        try {
          const { saveWikiPage } = await import('../../services/wiki.service.js');
          const newTitle = data.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          await saveWikiPage(existing.wikiPageId, { title: newTitle });
        } catch (e) { console.warn('Wiki title update failed:', e); }
      }

      showNotification(existing ? 'Updated!' : 'Created!', 'success');
      closeModal('content-editor');
      renderContentTab();
    } catch (err) {
      showNotification('Error: ' + err.message, 'danger');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// SHOP TAB
// ═══════════════════════════════════════════════════════════════════
function renderShopTab() {
  const el = document.getElementById('admin-content');
  if (!el) return;

  const isOpen = shopSettings.isShopOpen;
  const shopItems = shopSettings.shopItems || [];

  el.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
      <h3 style="color: var(--text-primary);">Shop Management</h3>
      <button class="btn-sm ${isOpen ? 'btn-danger' : 'btn-accent'}" id="toggle-shop">${isOpen ? 'Close Shop' : 'Open Shop'}</button>
    </div>
    <div style="margin-bottom: var(--space-4);">
      <h4 style="color: var(--text-secondary); margin-bottom: var(--space-3);">Current Shop Items</h4>
      <div id="shop-items-list">
        ${shopItems.length === 0 ? '<p style="color: var(--text-muted);">No items in shop.</p>' :
      shopItems.map((si, i) => {
        const item = libs.items.find(x => x.id === si.id);
        return `<div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
              <span><strong>${item?.name || si.id}</strong> — ${si.price}P${si.stock !== undefined ? ` (Stock: ${si.stock})` : ' (∞)'}</span>
              <div style="display: flex; gap: var(--space-2);">
                <button class="btn-sm" data-edit-shop="${i}">Edit</button>
                <button class="btn-sm" data-remove-shop="${i}">×</button>
              </div>
            </div>`;
      }).join('')}
      </div>
    </div>
    <h4 style="color: var(--text-secondary); margin-bottom: var(--space-3);">Add to Shop</h4>
    <input type="text" id="shop-add-search" placeholder="Search items..." class="modal-search">
    <div class="modal-grid" id="shop-add-grid"></div>
  `;

  document.getElementById('toggle-shop')?.addEventListener('click', async () => {
    await setShopOpen(!isOpen);
    shopSettings.isShopOpen = !isOpen;
    showNotification(isOpen ? 'Shop closed' : 'Shop opened', 'success');
    renderShopTab();
  });

  el.querySelectorAll('[data-remove-shop]').forEach(btn => {
    btn.addEventListener('click', async () => {
      shopItems.splice(parseInt(btn.dataset.removeShop), 1);
      await setShopItems(shopItems);
      shopSettings.shopItems = shopItems;
      showNotification('Removed', 'success');
      renderShopTab();
    });
  });

  el.querySelectorAll('[data-edit-shop]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.editShop);
      const si = shopItems[idx];
      const price = await showInputModal({ title: 'Edit Price', label: 'Price', currentValue: si.price, type: 'number' });
      if (price === null) return;
      const stock = await showInputModal({ title: 'Stock', label: 'Stock (blank = unlimited)', defaultValue: si.stock ?? '', type: 'number' });
      si.price = parseInt(price) || si.price;
      si.stock = stock === '' ? undefined : parseInt(stock);
      setShopItems(shopItems).then(() => { shopSettings.shopItems = shopItems; renderShopTab(); });
    });
  });

  const renderAddGrid = (filter = '') => {
    const grid = document.getElementById('shop-add-grid');
    const shopIds = shopItems.map(s => s.id);
    const available = libs.items.filter(i => !shopIds.includes(i.id) && i.name.toLowerCase().includes(filter));
    grid.innerHTML = available.map(item => `<div class="card" data-add-shop="${item.id}">
      <img src="${item.image || ''}" alt="${item.name}"><div class="card-title">${item.name}</div>
      <div class="card-subtitle">Suggested: ${item.price || 0}P</div>
    </div>`).join('') || '<p style="color: var(--text-muted);">No items to add.</p>';

    grid.querySelectorAll('[data-add-shop]').forEach(card => {
      card.addEventListener('click', async () => {
        const item = libs.items.find(i => i.id === card.dataset.addShop);
        const price = await showInputModal({ title: 'Set Price', label: `Price for ${item.name}`, defaultValue: item.price || 10, type: 'number' });
        if (price === null) return;
        const stock = await showInputModal({ title: 'Stock Limit', label: 'Stock (blank = unlimited)', type: 'number' });
        const entry = { id: item.id, price: parseInt(price) || 10 };
        if (stock !== null && stock !== '') entry.stock = parseInt(stock);
        shopItems.push(entry);
        await setShopItems(shopItems);
        shopSettings.shopItems = shopItems;
        showNotification('Added to shop', 'success');
        renderShopTab();
      });
    });
  };
  renderAddGrid();
  document.getElementById('shop-add-search')?.addEventListener('input', e => renderAddGrid(e.target.value.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════
// MARKET TAB
// ═══════════════════════════════════════════════════════════════════
async function renderMarketTab() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  const listings = await fetchMarketListings();

  el.innerHTML = `
    <h3 style="color: var(--text-primary); margin-bottom: var(--space-4);">Player Sell Listings</h3>
    ${listings.length === 0 ? '<p style="color: var(--text-muted);">No pending listings.</p>' :
      listings.map(l => `<div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
        <div>
          <strong>${l.itemName || l.itemId}</strong>
          <div style="color: var(--text-muted); font-size: var(--text-sm);">Seller: ${l.sellerName || 'Unknown'}</div>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn-sm btn-accent" data-approve-listing="${l.id}">Approve</button>
          <button class="btn-sm btn-danger" data-reject-listing="${l.id}">Reject</button>
        </div>
      </div>`).join('')}
  `;

  el.querySelectorAll('[data-approve-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const price = await showInputModal({ title: 'Approve Sale', label: 'Price to pay seller', type: 'number', submitLabel: 'Approve' });
      if (price === null) return;
      const p = parseInt(price);
      if (isNaN(p) || p < 0) { showNotification('Invalid price', 'danger'); return; }
      await approveMarketSale(btn.dataset.approveListing, p);
      showNotification('Sale approved!', 'success');
      renderMarketTab();
    });
  });

  el.querySelectorAll('[data-reject-listing]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await showConfirmation('Reject and return item to seller?', { danger: true })) return;
      await rejectMarketSale(btn.dataset.rejectListing);
      showNotification('Rejected — item returned', 'success');
      renderMarketTab();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// PARTY CONFIG TAB
// ═══════════════════════════════════════════════════════════════════
function renderPartyTab() {
  const el = document.getElementById('admin-content');
  if (!el) return;

  const nonParty = allUsers.filter(u => !partyUids.includes(u.uid) && u.uid !== currentUser.uid);

  el.innerHTML = `
    <h3 style="color: var(--text-primary); margin-bottom: var(--space-4);">Party Members</h3>
    <div style="margin-bottom: var(--space-4);">
      ${partyUids.length === 0 ? '<p style="color: var(--text-muted);">No members selected.</p>' :
      partyUids.map(uid => {
        const user = allUsers.find(u => u.uid === uid);
        const pc = partyChars.find(c => c.uid === uid);
        return `<div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
            <span><strong>${user?.displayName || uid}</strong>${pc ? ` — ${pc.name || 'No character'}` : ''}</span>
            <button class="btn-sm" data-remove-member="${uid}">Remove</button>
          </div>`;
      }).join('')}
    </div>
    <h4 style="color: var(--text-secondary); margin-bottom: var(--space-3);">Add Members</h4>
    ${nonParty.length === 0 ? '<p style="color: var(--text-muted);">No other users registered.</p>' :
      nonParty.map(u => `<div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
        <span>${u.displayName || u.uid} (${u.email || ''})</span>
        <button class="btn-sm btn-accent" data-add-member="${u.uid}">Add</button>
      </div>`).join('')}
  `;

  el.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.addEventListener('click', async () => {
      partyUids = partyUids.filter(u => u !== btn.dataset.removeMember);
      await setPartyMembers(partyUids);
      showNotification('Removed', 'success');
      renderPartyTab();
    });
  });

  el.querySelectorAll('[data-add-member]').forEach(btn => {
    btn.addEventListener('click', async () => {
      partyUids.push(btn.dataset.addMember);
      await setPartyMembers(partyUids);
      // Start listening to this character
      const uid = btn.dataset.addMember;
      charListeners[uid] = listenToCharacter(uid, data => {
        const idx = partyChars.findIndex(c => c.uid === uid);
        if (idx >= 0) partyChars[idx] = { uid, ...data };
        else partyChars.push({ uid, ...data });
      });
      showNotification('Added!', 'success');
      renderPartyTab();
    });
  });
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();
