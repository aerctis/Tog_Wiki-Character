// src/pages/compendium.js
// Compendium page — browse items, skills, beasts, wiki, session logs.
// Discovery levels: undiscovered → seen → learnable → learned (per-player)

import { waitForAuth, signOut, isCurrentUserAdmin } from '../services/auth.service.js';
import { fetchAllLibraries } from '../services/library.service.js';
import { fetchWikiPages, saveWikiPage, deleteWikiPage, fetchSessionLogs, saveSessionLog, deleteSessionLog } from '../services/wiki.service.js';
import { fetchPlayerDiscovery, getDiscoveryLevel, setDiscoveryLevel, setDiscoveryLevelForAll, DISCOVERY_LEVELS } from '../services/discovery.service.js';
import { getPartyMembers } from '../services/admin.service.js';
import { initNotifications, showNotification } from '../components/shared/notification.js';
import { openModal, closeModal, getModalBody, showConfirmation } from '../components/shared/modal.js';
import { parseTextile, slugify } from '../services/wiki-parser.js';
import { STATS, POSITIONS, BEAST_TIERS } from '../config/constants.js';
import { calculateBeastStats, getBeastAbilities } from '../systems/beast-system.js';

// ─── State ────────────────────────────────────────────────────────
let currentUser = null;
let isAdmin = false;
let libs = { skills: [], items: [], beasts: [], synergies: [] };
let wikiPages = [];
let sessionLogs = [];
let activeSection = 'items'; // items | skills | beasts | wiki | sessions
let playerDiscovery = { skills: {}, items: {}, beasts: {} };
let partyUids = []; // for admin bulk discovery

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  initNotifications();

  const user = await waitForAuth();
  if (!user) { window.location.href = '/'; return; }
  currentUser = user;

  const nameEl = document.getElementById('user-display-name');
  if (nameEl) nameEl.textContent = user.displayName || '';

  document.getElementById('btn-sign-out')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = '/';
  });

  isAdmin = await isCurrentUserAdmin();
  const adminLink = document.getElementById('nav-admin');
  if (adminLink && isAdmin) adminLink.style.display = '';

  try {
    const promises = [
      fetchAllLibraries(),
      fetchWikiPages(),
      fetchSessionLogs(),
      fetchPlayerDiscovery(user.uid)
    ];
    if (isAdmin) promises.push(getPartyMembers().catch(() => []));

    const [libData, wiki, logs, disc, party] = await Promise.all(promises);
    libs = libData;
    wikiPages = wiki;
    sessionLogs = logs;
    playerDiscovery = disc;
    if (party) partyUids = party;
  } catch (err) {
    console.error('Failed to load compendium data:', err);
    showNotification('Failed to load data.', 'danger');
  }

  renderLayout();
}

// ─── Helpers ──────────────────────────────────────────────────────
function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function formatDate(d) {
  if (!d) return '';
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const QUESTION_SVG = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23111%22 width=%2280%22 height=%2280%22/><text x=%2240%22 y=%2248%22 text-anchor=%22middle%22 fill=%22%23333%22 font-size=%2228%22>?</text></svg>";
const ITEM_PLACEHOLDER = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23161618%22 width=%2280%22 height=%2280%22/><text x=%2240%22 y=%2245%22 text-anchor=%22middle%22 fill=%22%23333%22 font-size=%2224%22>⚔</text></svg>";
const SKILL_PLACEHOLDER = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23161618%22 width=%2280%22 height=%2280%22/><text x=%2240%22 y=%2245%22 text-anchor=%22middle%22 fill=%22%23333%22 font-size=%2224%22>✦</text></svg>";
const BEAST_PLACEHOLDER = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23161618%22 width=%2280%22 height=%2280%22/><text x=%2240%22 y=%2245%22 text-anchor=%22middle%22 fill=%22%23333%22 font-size=%2224%22>◈</text></svg>";

// Discovery CSS class based on level
function discClass(level) {
  switch (level) {
    case 'learned': return 'disc-learned';
    case 'learnable': return 'disc-learnable';
    case 'seen': return 'disc-seen';
    default: return 'disc-undiscovered';
  }
}

// ─── Layout ───────────────────────────────────────────────────────
function renderLayout() {
  const root = document.getElementById('compendium-root');
  root.innerHTML = `
    <div class="compendium-layout">
      <aside class="compendium-sidebar" id="comp-sidebar">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Browse</div>
          <a class="sidebar-link ${activeSection==='items'?'active':''}" data-section="items">
            <span class="sidebar-icon">⚔</span> Equipment
          </a>
          <a class="sidebar-link ${activeSection==='skills'?'active':''}" data-section="skills">
            <span class="sidebar-icon">✦</span> Skills
          </a>
          <a class="sidebar-link ${activeSection==='beasts'?'active':''}" data-section="beasts">
            <span class="sidebar-icon">◈</span> Bestiary
          </a>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">Knowledge</div>
          <a class="sidebar-link ${activeSection==='wiki'?'active':''}" data-section="wiki">
            <span class="sidebar-icon">◉</span> Wiki
          </a>
          <a class="sidebar-link ${activeSection==='sessions'?'active':''}" data-section="sessions">
            <span class="sidebar-icon">▣</span> Session Logs
          </a>
        </div>
      </aside>
      <div class="compendium-content" id="comp-content"></div>
    </div>
  `;

  root.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', () => {
      activeSection = link.dataset.section;
      renderLayout();
    });
  });

  renderSection();
}

function renderSection() {
  switch (activeSection) {
    case 'items': renderItemsSection(); break;
    case 'skills': renderSkillsSection(); break;
    case 'beasts': renderBeastsSection(); break;
    case 'wiki': renderWikiSection(); break;
    case 'sessions': renderSessionsSection(); break;
  }
}

// ══════════════════════════════════════════════════════════════════
// SHARED: Admin Discovery Controls
// ══════════════════════════════════════════════════════════════════
function renderAdminDiscoveryBtn(category, id, currentLevel) {
  if (!isAdmin) return '';
  return `
    <div class="admin-discovery-controls" style="margin-top: var(--space-2); display: flex; gap: var(--space-1); flex-wrap: wrap;">
      <select class="discovery-select" data-disc-cat="${category}" data-disc-id="${id}" style="font-size: 0.6rem; padding: 2px 4px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-secondary);">
        <option value="undiscovered" ${currentLevel==='undiscovered'?'selected':''}>Undiscovered</option>
        <option value="seen" ${currentLevel==='seen'?'selected':''}>Seen</option>
        <option value="learnable" ${currentLevel==='learnable'?'selected':''}>Learnable</option>
        <option value="learned" ${currentLevel==='learned'?'selected':''}>Learned</option>
      </select>
      <button class="btn-xs btn-ghost disc-set-player" data-disc-cat="${category}" data-disc-id="${id}" title="Set for this player only" style="font-size: 0.55rem; padding: 1px 4px;">This Player</button>
      <button class="btn-xs btn-accent disc-set-all" data-disc-cat="${category}" data-disc-id="${id}" title="Set for ALL players" style="font-size: 0.55rem; padding: 1px 4px;">All Players</button>
    </div>
  `;
}

function attachAdminDiscoveryHandlers(container) {
  if (!isAdmin) return;

  container.querySelectorAll('.disc-set-player').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.dataset.discCat;
      const id = btn.dataset.discId;
      const select = container.querySelector(`.discovery-select[data-disc-cat="${cat}"][data-disc-id="${id}"]`);
      if (!select) return;
      const level = select.value;
      try {
        await setDiscoveryLevel(currentUser.uid, cat, id, level);
        playerDiscovery[cat][id] = level;
        showNotification(`Set to ${level} for this player`, 'success');
        renderSection();
      } catch (err) {
        showNotification('Failed to update discovery', 'danger');
      }
    });
  });

  container.querySelectorAll('.disc-set-all').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.dataset.discCat;
      const id = btn.dataset.discId;
      const select = container.querySelector(`.discovery-select[data-disc-cat="${cat}"][data-disc-id="${id}"]`);
      if (!select) return;
      const level = select.value;
      const allUids = partyUids.length > 0 ? partyUids : [currentUser.uid];
      const yes = await showConfirmation(`Set "${level}" for ALL ${allUids.length} players?`);
      if (!yes) return;
      try {
        await setDiscoveryLevelForAll(allUids, cat, id, level);
        playerDiscovery[cat][id] = level;
        showNotification(`Set to ${level} for ${allUids.length} players`, 'success');
        renderSection();
      } catch (err) {
        showNotification('Failed to update discovery', 'danger');
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// EQUIPMENT SECTION
// ══════════════════════════════════════════════════════════════════
function renderItemsSection() {
  const content = document.getElementById('comp-content');

  content.innerHTML = `
    <div class="section-header">
      <h2>Equipment</h2>
    </div>
    <div class="compendium-search">
      <input type="text" id="items-search" placeholder="Search equipment...">
    </div>
    <div class="comp-card-grid" id="items-grid"></div>
  `;

  const renderGrid = (filter = '') => {
    const grid = document.getElementById('items-grid');
    const items = libs.items.filter(i => {
      const level = getDiscoveryLevel(playerDiscovery, 'items', i.id);
      // Only filter by name if learnable/learned (player can see name)
      if (filter) {
        if (level === 'learned' || level === 'learnable') {
          return (i.name || '').toLowerCase().includes(filter);
        }
        return false; // Can't search undiscovered/seen items
      }
      return true;
    }).sort((a,b) => {
      const la = getDiscoveryLevel(playerDiscovery, 'items', a.id);
      const lb = getDiscoveryLevel(playerDiscovery, 'items', b.id);
      const order = { learned: 0, learnable: 1, seen: 2, undiscovered: 3 };
      if (order[la] !== order[lb]) return order[la] - order[lb];
      return (a.name || '').localeCompare(b.name || '');
    });

    grid.innerHTML = items.map(item => {
      const level = getDiscoveryLevel(playerDiscovery, 'items', item.id);
      const canClick = level === 'learned' || level === 'learnable';
      const showName = level === 'learned' || level === 'learnable';
      const showImage = level !== 'undiscovered';

      let imgSrc;
      if (level === 'undiscovered') imgSrc = QUESTION_SVG;
      else if (level === 'seen') imgSrc = item.image || ITEM_PLACEHOLDER;
      else imgSrc = item.image || ITEM_PLACEHOLDER;

      return `
        <div class="comp-card ${discClass(level)}" ${canClick ? `data-item-id="${item.id}"` : ''}>
          <img class="comp-card-img" src="${imgSrc}" alt="${showName ? esc(item.name) : '???'}">
          <div class="comp-card-name">${showName ? esc(item.name) : (level === 'seen' ? '???' : '???')}</div>
          ${showName && item.equipmentType ? `<div class="comp-card-meta">${esc(item.equipmentType)}</div>` : ''}
          ${isAdmin ? `<div class="comp-card-disc-badge">${level}</div>` : ''}
        </div>`;
    }).join('') || '<div class="comp-empty"><div class="comp-empty-icon">⚔</div><div class="comp-empty-text">No equipment found</div></div>';

    grid.querySelectorAll('[data-item-id]').forEach(card => {
      card.addEventListener('click', () => {
        const item = libs.items.find(i => i.id === card.dataset.itemId);
        if (item) openItemDetail(item);
      });
    });
  };

  renderGrid();
  document.getElementById('items-search').addEventListener('input', e => renderGrid(e.target.value.toLowerCase()));
}

function openItemDetail(item) {
  const level = getDiscoveryLevel(playerDiscovery, 'items', item.id);
  const statsHtml = item.statBonuses ? Object.entries(item.statBonuses)
    .filter(([k,v]) => v)
    .map(([stat, val]) => `<div class="detail-meta-item"><strong>${esc(stat)}:</strong> +${val}</div>`)
    .join('') : '';

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `
    <div class="detail-panel">
      <div>
        <img class="detail-image" src="${item.image || ''}" alt="${esc(item.name)}">
      </div>
      <div>
        <div class="detail-title">${esc(item.name)}</div>
        <div class="detail-meta">
          ${item.equipmentType ? `<div class="detail-meta-item"><strong>Type:</strong> ${esc(item.equipmentType)}</div>` : ''}
          ${item.slot ? `<div class="detail-meta-item"><strong>Slot:</strong> ${esc(item.slot)}</div>` : ''}
          ${item.rarity ? `<div class="detail-meta-item"><strong>Rarity:</strong> ${esc(item.rarity)}</div>` : ''}
          ${item.price != null ? `<div class="detail-meta-item"><strong>Price:</strong> ${item.price}</div>` : ''}
        </div>
        ${item.description ? `<div class="detail-desc">${esc(item.description)}</div>` : ''}
        ${statsHtml ? `
          <div style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-widest); color: var(--text-muted); margin-bottom: var(--space-2); font-weight: 500;">Stat Bonuses</div>
          <div class="detail-meta">${statsHtml}</div>
        ` : ''}
        ${item.specialEffect ? `
          <div style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-widest); color: var(--text-muted); margin-bottom: var(--space-2); margin-top: var(--space-3); font-weight: 500;">Special Effect</div>
          <div class="detail-desc">${esc(item.specialEffect)}</div>
        ` : ''}
        ${renderAdminDiscoveryBtn('items', item.id, level)}
      </div>
    </div>
  `;
  openModal({ id: 'item-detail', title: item.name, body: bodyEl, size: 'lg' });
  attachAdminDiscoveryHandlers(bodyEl);
}

// ══════════════════════════════════════════════════════════════════
// SKILLS SECTION
// ══════════════════════════════════════════════════════════════════
function renderSkillsSection() {
  const content = document.getElementById('comp-content');
  const positions = ['All', ...POSITIONS];
  let activePos = 'All';

  content.innerHTML = `
    <div class="section-header">
      <h2>Skills</h2>
    </div>
    <div class="comp-tabs" id="skill-pos-tabs"></div>
    <div class="compendium-search">
      <input type="text" id="skills-search" placeholder="Search skills...">
    </div>
    <div class="comp-card-grid" id="skills-grid"></div>
  `;

  const renderTabs = () => {
    document.getElementById('skill-pos-tabs').innerHTML = positions.map(p =>
      `<button class="comp-tab ${p === activePos ? 'active' : ''}" data-pos="${p}">${p}</button>`
    ).join('');
    document.querySelectorAll('#skill-pos-tabs [data-pos]').forEach(btn => {
      btn.addEventListener('click', () => {
        activePos = btn.dataset.pos;
        renderTabs();
        renderGrid(document.getElementById('skills-search').value.toLowerCase());
      });
    });
  };

  const renderGrid = (filter = '') => {
    const grid = document.getElementById('skills-grid');
    const skills = libs.skills.filter(s => {
      if (activePos !== 'All' && !(s.positionTags || []).includes(activePos)) return false;
      const level = getDiscoveryLevel(playerDiscovery, 'skills', s.id);
      if (filter) {
        if (level === 'learned' || level === 'learnable') {
          return (s.name || '').toLowerCase().includes(filter);
        }
        return false;
      }
      return true;
    }).sort((a,b) => {
      const la = getDiscoveryLevel(playerDiscovery, 'skills', a.id);
      const lb = getDiscoveryLevel(playerDiscovery, 'skills', b.id);
      const order = { learned: 0, learnable: 1, seen: 2, undiscovered: 3 };
      if (order[la] !== order[lb]) return order[la] - order[lb];
      return (a.name || '').localeCompare(b.name || '');
    });

    grid.innerHTML = skills.map(skill => {
      const level = getDiscoveryLevel(playerDiscovery, 'skills', skill.id);
      const canClick = level === 'learned' || level === 'learnable';
      const showName = level === 'learned' || level === 'learnable';

      let imgSrc;
      if (level === 'undiscovered') imgSrc = QUESTION_SVG;
      else if (level === 'seen') imgSrc = skill.icon || SKILL_PLACEHOLDER;
      else imgSrc = skill.icon || SKILL_PLACEHOLDER;

      return `
        <div class="comp-card ${discClass(level)}" ${canClick ? `data-skill-id="${skill.id}"` : ''}>
          <img class="comp-card-img" src="${imgSrc}" alt="${showName ? esc(skill.name) : '???'}">
          <div class="comp-card-name">${showName ? esc(skill.name) : '???'}</div>
          ${showName ? `<div class="comp-card-meta">${(skill.positionTags || []).join(', ') || skill.skillType || ''}</div>` : ''}
          ${isAdmin ? `<div class="comp-card-disc-badge">${level}</div>` : ''}
        </div>`;
    }).join('') || '<div class="comp-empty"><div class="comp-empty-icon">✦</div><div class="comp-empty-text">No skills found</div></div>';

    grid.querySelectorAll('[data-skill-id]').forEach(card => {
      card.addEventListener('click', () => {
        const skill = libs.skills.find(s => s.id === card.dataset.skillId);
        if (skill) openSkillDetail(skill);
      });
    });
  };

  renderTabs();
  renderGrid();
  document.getElementById('skills-search').addEventListener('input', e => renderGrid(e.target.value.toLowerCase()));
}

function openSkillDetail(skill) {
  const level = getDiscoveryLevel(playerDiscovery, 'skills', skill.id);
  let tableHtml = '';
  if (skill.effects && skill.effects.length > 0) {
    let rows = '';
    for (let i = 1; i <= (skill.maxLevel || 5); i++) {
      const e = skill.effects[i - 1];
      let effectText = '-';
      if (e) {
        effectText = e.stat ? `${e.stat}: ${e.type === 'add' ? '+' : 'x'}${e.value}` : '';
        if (e.stat2) effectText += `, ${e.stat2}: +${e.value2}`;
        if (e.description) effectText = e.description;
      }
      const cost = skill.costPerLevel ? skill.costPerLevel[i - 1] : i;
      rows += `<tr><td>${i}</td><td>${cost}</td><td>${effectText}</td></tr>`;
    }
    tableHtml = `
      <div style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-widest); color: var(--text-muted); margin-bottom: var(--space-2); margin-top: var(--space-4); font-weight: 500;">Progression</div>
      <table class="detail-stats-table">
        <thead><tr><th>Lvl</th><th>Cost</th><th>Effect</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `
    <div class="detail-panel">
      <div>
        <img class="detail-image" src="${skill.icon || ''}" alt="${esc(skill.name)}">
        <div style="margin-top: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary); display: flex; flex-direction: column; gap: var(--space-2);">
          ${skill.skillType ? `<div><strong style="color: var(--text-primary);">Type:</strong> ${esc(skill.skillType)}</div>` : ''}
          ${skill.spiritCost ? `<div><strong style="color: var(--text-primary);">Spirit Cost:</strong> ${skill.spiritCost}</div>` : ''}
          ${skill.charges ? `<div><strong style="color: var(--text-primary);">Charges:</strong> ${skill.charges}</div>` : ''}
          <div><strong style="color: var(--text-primary);">Positions:</strong> ${(skill.positionTags || []).join(', ') || 'Any'}</div>
          <div><strong style="color: var(--text-primary);">Max Level:</strong> ${skill.maxLevel || '?'}</div>
        </div>
      </div>
      <div>
        <div class="detail-title">${esc(skill.name)}</div>
        ${skill.description ? `<div class="detail-desc">${esc(skill.description)}</div>` : ''}
        ${tableHtml}
        ${renderAdminDiscoveryBtn('skills', skill.id, level)}
      </div>
    </div>
  `;
  openModal({ id: 'skill-detail', title: skill.name, body: bodyEl, size: 'lg' });
  attachAdminDiscoveryHandlers(bodyEl);
}

// ══════════════════════════════════════════════════════════════════
// BESTIARY SECTION
// ══════════════════════════════════════════════════════════════════
function renderBeastsSection() {
  const content = document.getElementById('comp-content');

  content.innerHTML = `
    <div class="section-header">
      <h2>Bestiary</h2>
    </div>
    <div class="compendium-search">
      <input type="text" id="beasts-search" placeholder="Search beasts...">
    </div>
    <div class="comp-card-grid" id="beasts-grid"></div>
  `;

  const renderGrid = (filter = '') => {
    const grid = document.getElementById('beasts-grid');
    const beasts = libs.beasts.filter(b => {
      const level = getDiscoveryLevel(playerDiscovery, 'beasts', b.id);
      if (filter) {
        if (level === 'learned' || level === 'learnable') {
          return (b.name || '').toLowerCase().includes(filter);
        }
        return false;
      }
      return true;
    }).sort((a,b) => {
      const la = getDiscoveryLevel(playerDiscovery, 'beasts', a.id);
      const lb = getDiscoveryLevel(playerDiscovery, 'beasts', b.id);
      const order = { learned: 0, learnable: 1, seen: 2, undiscovered: 3 };
      if (order[la] !== order[lb]) return order[la] - order[lb];
      return (a.name || '').localeCompare(b.name || '');
    });

    grid.innerHTML = beasts.map(beast => {
      const level = getDiscoveryLevel(playerDiscovery, 'beasts', beast.id);
      const canClick = level === 'learned' || level === 'learnable';
      const showName = level === 'learned' || level === 'learnable';
      const tierLabel = BEAST_TIERS[beast.tier]?.label || '';

      let imgSrc;
      if (level === 'undiscovered') imgSrc = QUESTION_SVG;
      else imgSrc = beast.image || BEAST_PLACEHOLDER;

      return `
        <div class="comp-card ${discClass(level)}" ${canClick ? `data-beast-id="${beast.id}"` : ''}>
          <img class="comp-card-img" src="${imgSrc}" alt="${showName ? esc(beast.name) : '???'}">
          <div class="comp-card-name">${showName ? esc(beast.name) : '???'}</div>
          ${showName && tierLabel ? `<div class="comp-card-meta">${tierLabel}</div>` : ''}
          ${isAdmin ? `<div class="comp-card-disc-badge">${level}</div>` : ''}
        </div>`;
    }).join('') || '<div class="comp-empty"><div class="comp-empty-icon">◈</div><div class="comp-empty-text">No beasts found</div></div>';

    grid.querySelectorAll('[data-beast-id]').forEach(card => {
      card.addEventListener('click', () => {
        const beast = libs.beasts.find(b => b.id === card.dataset.beastId);
        if (beast) openBeastDetail(beast);
      });
    });
  };

  renderGrid();
  document.getElementById('beasts-search').addEventListener('input', e => renderGrid(e.target.value.toLowerCase()));
}

function openBeastDetail(beast) {
  const level = getDiscoveryLevel(playerDiscovery, 'beasts', beast.id);
  const stats = calculateBeastStats(beast, 1);
  const abilities = getBeastAbilities(beast, 1);
  const tierLabel = BEAST_TIERS[beast.tier]?.label || `Tier ${beast.tier}`;

  let abilitiesHtml = '';
  if (abilities.length > 0) {
    abilitiesHtml = `
      <div style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-widest); color: var(--text-muted); margin: var(--space-4) 0 var(--space-2); font-weight: 500;">Abilities</div>
      ${abilities.map(ab => {
        const evo = ab.currentEvolution;
        return `<div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); padding: var(--space-3); margin-bottom: var(--space-2);">
          <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-sm);">${esc(evo?.name || ab.name || 'Unknown')}</div>
          ${evo?.description ? `<div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: var(--space-1);">${esc(evo.description)}</div>` : ''}
        </div>`;
      }).join('')}
    `;
  }

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `
    <div class="detail-panel">
      <div>
        <img class="detail-image" src="${beast.image || ''}" alt="${esc(beast.name)}">
      </div>
      <div>
        <div class="detail-title">${esc(beast.name)}</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><strong>Tier:</strong> ${esc(tierLabel)}</div>
          ${beast.synergyTags?.length ? `<div class="detail-meta-item"><strong>Tags:</strong> ${beast.synergyTags.join(', ')}</div>` : ''}
        </div>
        ${beast.description ? `<div class="detail-desc">${esc(beast.description)}</div>` : ''}
        <div style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-widest); color: var(--text-muted); margin-bottom: var(--space-2); font-weight: 500;">Base Stats (Level 1)</div>
        <div class="beast-stats-grid">
          <div class="beast-stat-box"><div class="beast-stat-label">HP</div><div class="beast-stat-value">${stats.hp}</div></div>
          <div class="beast-stat-box"><div class="beast-stat-label">ATK</div><div class="beast-stat-value">${stats.attack}</div></div>
          <div class="beast-stat-box"><div class="beast-stat-label">DEF</div><div class="beast-stat-value">${stats.defense}</div></div>
          <div class="beast-stat-box"><div class="beast-stat-label">SPD</div><div class="beast-stat-value">${stats.speed}</div></div>
        </div>
        ${abilitiesHtml}
        ${renderAdminDiscoveryBtn('beasts', beast.id, level)}
      </div>
    </div>
  `;
  openModal({ id: 'beast-detail', title: beast.name, body: bodyEl, size: 'lg' });
  attachAdminDiscoveryHandlers(bodyEl);
}

// ══════════════════════════════════════════════════════════════════
// WIKI SECTION — with browser back/forward support
// ══════════════════════════════════════════════════════════════════
let wikiViewStack = []; // breadcrumb history
let wikiHistoryIndex = -1; // current position in history
let wikiHistory = []; // full history for back/forward
let popstateActive = false;

function wikiPushHistory(pageId) {
  // Trim forward history
  if (wikiHistoryIndex < wikiHistory.length - 1) {
    wikiHistory = wikiHistory.slice(0, wikiHistoryIndex + 1);
  }
  wikiHistory.push(pageId);
  wikiHistoryIndex = wikiHistory.length - 1;
  history.pushState({ wiki: pageId }, '', `#wiki/${pageId || ''}`);
}

function renderWikiSection(pageId, fromPopState) {
  const content = document.getElementById('comp-content');

  if (pageId === '__all__') {
    if (!fromPopState) wikiPushHistory('__all__');
    renderWikiAllPages();
    return;
  }

  let page;
  if (pageId) {
    page = wikiPages.find(p => p.id === pageId);
  } else {
    page = wikiPages.find(p => p.isMainPage) || wikiPages[0];
  }

  if (!page) {
    content.innerHTML = `
      <div class="section-header">
        <h2>Wiki</h2>
        <div class="section-header-actions">
          ${isAdmin ? '<button class="btn-sm btn-accent" id="btn-new-wiki">+ New Page</button>' : ''}
        </div>
      </div>
      <div class="comp-empty"><div class="comp-empty-icon">◉</div><div class="comp-empty-text">No wiki pages yet.</div></div>
    `;
    document.getElementById('btn-new-wiki')?.addEventListener('click', () => openWikiEditor(null));
    return;
  }

  // Push browser history if not from popstate
  if (!fromPopState) wikiPushHistory(page.id);

  // Breadcrumb stack
  const stackIdx = wikiViewStack.indexOf(page.id);
  if (stackIdx >= 0) {
    wikiViewStack = wikiViewStack.slice(0, stackIdx + 1);
  } else {
    wikiViewStack.push(page.id);
  }

  const wikiLinkHandler = (slug, label) => {
    const target = wikiPages.find(p =>
      slugify(p.title || '') === slugify(slug) ||
      (p.title || '').toLowerCase() === slug.toLowerCase()
    );
    if (target) {
      return `<span class="wiki-link" data-wiki-nav="${target.id}">${esc(label)}</span>`;
    }
    return `<span style="color: var(--text-muted); border-bottom: 1px dashed var(--text-muted); cursor: default;" title="Page not found: ${esc(slug)}">${esc(label)}</span>`;
  };

  let renderedContent;
  if (page.format === 'markdown' || page.format === 'md') {
    renderedContent = renderMarkdown(page.content || '');
  } else {
    renderedContent = parseTextile(page.content || '', wikiLinkHandler);
  }

  // Breadcrumbs
  const breadcrumbs = wikiViewStack.map((id, i) => {
    const p = wikiPages.find(w => w.id === id);
    const name = p?.title || id;
    if (i === wikiViewStack.length - 1) {
      return `<span style="color: var(--text-primary);">${esc(name)}</span>`;
    }
    return `<span class="wiki-link" data-wiki-nav="${id}" style="color: var(--accent-text); cursor: pointer;">${esc(name)}</span>`;
  }).join(' <span style="color: var(--text-muted); margin: 0 var(--space-1);">›</span> ');

  // Back/forward buttons
  const canBack = wikiHistoryIndex > 0;
  const canForward = wikiHistoryIndex < wikiHistory.length - 1;

  content.innerHTML = `
    <div class="section-header">
      <h2>Wiki</h2>
      <div class="section-header-actions">
        <button class="btn-sm btn-ghost ${canBack ? '' : 'disabled'}" id="btn-wiki-back" title="Back" ${canBack ? '' : 'disabled'}>←</button>
        <button class="btn-sm btn-ghost ${canForward ? '' : 'disabled'}" id="btn-wiki-forward" title="Forward" ${canForward ? '' : 'disabled'}>→</button>
        <button class="btn-sm btn-ghost" id="btn-wiki-all">All Pages</button>
        ${isAdmin ? '<button class="btn-sm btn-accent" id="btn-new-wiki">+ New Page</button>' : ''}
      </div>
    </div>
    <div style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-4); display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1);">
      ${breadcrumbs}
    </div>
    <div class="wiki-page" id="wiki-page-body">
      ${renderedContent}
    </div>
    ${isAdmin ? `
      <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-color); display: flex; gap: var(--space-2);">
        <button class="btn-sm btn-accent" id="wiki-edit-btn">Edit Page</button>
        <button class="btn-sm btn-danger" id="wiki-delete-btn">Delete</button>
      </div>
    ` : ''}
  `;

  // Navigation event listeners
  content.querySelectorAll('[data-wiki-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      renderWikiSection(link.dataset.wikiNav);
    });
  });

  // Back/Forward buttons
  document.getElementById('btn-wiki-back')?.addEventListener('click', () => {
    if (wikiHistoryIndex > 0) {
      wikiHistoryIndex--;
      const prevId = wikiHistory[wikiHistoryIndex];
      wikiViewStack = [];
      renderWikiSection(prevId, true);
      history.back();
    }
  });
  document.getElementById('btn-wiki-forward')?.addEventListener('click', () => {
    if (wikiHistoryIndex < wikiHistory.length - 1) {
      wikiHistoryIndex++;
      const nextId = wikiHistory[wikiHistoryIndex];
      wikiViewStack = [];
      renderWikiSection(nextId, true);
      history.forward();
    }
  });

  document.getElementById('btn-wiki-all')?.addEventListener('click', () => {
    wikiViewStack = [];
    renderWikiSection('__all__');
  });
  document.getElementById('btn-new-wiki')?.addEventListener('click', () => openWikiEditor(null));

  document.getElementById('wiki-edit-btn')?.addEventListener('click', () => openWikiEditor(page));
  document.getElementById('wiki-delete-btn')?.addEventListener('click', async () => {
    const yes = await showConfirmation(`Delete wiki page "${page.title}"?`, { danger: true });
    if (!yes) return;
    try {
      await deleteWikiPage(page.id);
      wikiPages = wikiPages.filter(p => p.id !== page.id);
      wikiViewStack = [];
      renderWikiSection();
      showNotification('Page deleted.', 'success');
    } catch (err) {
      showNotification('Delete failed.', 'danger');
    }
  });
}

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.wiki !== undefined && activeSection === 'wiki') {
    popstateActive = true;
    const pageId = e.state.wiki;
    // Find the index in our history
    const idx = wikiHistory.lastIndexOf(pageId);
    if (idx >= 0) wikiHistoryIndex = idx;
    wikiViewStack = [];
    renderWikiSection(pageId, true);
    popstateActive = false;
  }
});

function renderWikiAllPages() {
  const content = document.getElementById('comp-content');

  content.innerHTML = `
    <div class="section-header">
      <h2>All Wiki Pages</h2>
      <div class="section-header-actions">
        <button class="btn-sm btn-ghost" id="btn-wiki-home">← Main Page</button>
        ${isAdmin ? '<button class="btn-sm btn-accent" id="btn-new-wiki">+ New Page</button>' : ''}
      </div>
    </div>
    <div class="compendium-search">
      <input type="text" id="wiki-search" placeholder="Search wiki pages...">
    </div>
    <div class="wiki-page-list" id="wiki-list"></div>
  `;

  const renderList = (filter = '') => {
    const list = document.getElementById('wiki-list');
    const pages = wikiPages.filter(p => {
      if (filter && !(p.title || '').toLowerCase().includes(filter)) return false;
      return true;
    }).sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    list.innerHTML = pages.map(p => `
      <div class="wiki-page-item" data-wiki-id="${p.id}">
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <div class="wiki-page-item-title">${esc(p.title || 'Untitled')}</div>
          ${p.isMainPage ? '<span style="font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-text); font-weight: 600;">Home</span>' : ''}
          ${p.isDraft ? '<span class="badge-draft">Draft</span>' : ''}
        </div>
        <div class="wiki-page-item-date">${formatDate(p.updatedAt)}</div>
      </div>
    `).join('') || '<div class="comp-empty"><div class="comp-empty-icon">◉</div><div class="comp-empty-text">No wiki pages found</div></div>';

    list.querySelectorAll('[data-wiki-id]').forEach(item => {
      item.addEventListener('click', () => {
        wikiViewStack = [];
        renderWikiSection(item.dataset.wikiId);
      });
    });
  };

  renderList();
  document.getElementById('wiki-search')?.addEventListener('input', e => renderList(e.target.value.toLowerCase()));
  document.getElementById('btn-wiki-home')?.addEventListener('click', () => {
    wikiViewStack = [];
    renderWikiSection();
  });
  document.getElementById('btn-new-wiki')?.addEventListener('click', () => openWikiEditor(null));
}


function openWikiEditor(existingPage) {
  const isEdit = !!existingPage;
  let editorMode = 'write';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'md-editor-container';

  const render = () => {
    const title = bodyEl.querySelector('#we-title')?.value || existingPage?.title || '';
    const content = bodyEl.querySelector('#we-content')?.value || existingPage?.content || '';

    bodyEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        <div>
          <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest);">Page Title</label>
          <input type="text" id="we-title" value="${esc(title)}" placeholder="Page title..." style="width:100%; margin-top: var(--space-1);">
        </div>
        <div class="md-editor-tabs">
          <button class="md-editor-tab ${editorMode==='write'?'active':''}" data-mode="write">Write</button>
          <button class="md-editor-tab ${editorMode==='preview'?'active':''}" data-mode="preview">Preview</button>
        </div>
        ${editorMode === 'write' ? `
          <div class="md-editor-toolbar">
            <button data-action="bold" title="Bold">B</button>
            <button data-action="italic" title="Italic"><em>I</em></button>
            <button data-action="heading" title="Heading">H</button>
            <button data-action="link" title="Link">🔗</button>
            <button data-action="wikilink" title="Wiki Link">[[]]</button>
            <span class="separator"></span>
            <button data-action="list" title="List">• List</button>
            <button data-action="image" title="Image">🖼</button>
            <button data-action="hr" title="Divider">—</button>
          </div>
          <textarea class="md-editor-textarea" id="we-content" placeholder="Write your content using Markdown...">${esc(content)}</textarea>
        ` : `
          <div class="md-editor-preview wiki-page" id="we-preview">${renderMarkdown(content)}</div>
        `}
        <div class="md-editor-actions">
          <label style="font-size: var(--text-xs); color: var(--text-secondary); display: flex; align-items: center; gap: var(--space-2);">
            <input type="checkbox" id="we-draft" ${existingPage?.isDraft ? 'checked' : ''}> Save as draft
          </label>
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn-sm btn-ghost" id="we-cancel">Cancel</button>
            <button class="btn-sm btn-accent" id="we-save">${isEdit ? 'Save' : 'Create'}</button>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-mode]').forEach(tab => {
      tab.addEventListener('click', () => { editorMode = tab.dataset.mode; render(); });
    });

    bodyEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = bodyEl.querySelector('#we-content');
        if (!ta) return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const sel = ta.value.substring(start, end);
        let insert = '';
        switch (btn.dataset.action) {
          case 'bold': insert = `**${sel || 'bold text'}**`; break;
          case 'italic': insert = `*${sel || 'italic text'}*`; break;
          case 'heading': insert = `\n## ${sel || 'Heading'}\n`; break;
          case 'link': insert = `[${sel || 'link text'}](url)`; break;
          case 'wikilink': insert = `[[${sel || 'Page Name'}]]`; break;
          case 'list': insert = `\n- ${sel || 'item'}\n`; break;
          case 'image': insert = `![${sel || 'alt text'}](image-url)`; break;
          case 'hr': insert = '\n---\n'; break;
        }
        ta.value = ta.value.substring(0, start) + insert + ta.value.substring(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insert.length;
      });
    });

    bodyEl.querySelector('#we-save')?.addEventListener('click', async () => {
      const titleVal = bodyEl.querySelector('#we-title').value.trim();
      const contentVal = bodyEl.querySelector('#we-content')?.value || existingPage?.content || '';
      const isDraftVal = bodyEl.querySelector('#we-draft')?.checked || false;
      if (!titleVal) { showNotification('Title is required.', 'danger'); return; }
      try {
        const data = {
          title: titleVal,
          content: editorMode === 'preview' ? (existingPage?.content || contentVal) : contentVal,
          format: 'markdown',
          isDraft: isDraftVal,
          slug: slugify(titleVal)
        };
        if (!isEdit) data.createdAt = new Date().toISOString();
        const savedId = await saveWikiPage(isEdit ? existingPage.id : null, data);
        if (isEdit) {
          const idx = wikiPages.findIndex(p => p.id === existingPage.id);
          if (idx >= 0) wikiPages[idx] = { ...wikiPages[idx], ...data };
        } else {
          wikiPages.push({ id: savedId, ...data, updatedAt: new Date() });
        }
        closeModal('wiki-editor');
        wikiViewStack = [];
        renderWikiSection(savedId || existingPage?.id);
        showNotification(isEdit ? 'Page saved.' : 'Page created.', 'success');
      } catch (err) {
        showNotification('Save failed.', 'danger');
        console.error(err);
      }
    });

    bodyEl.querySelector('#we-cancel')?.addEventListener('click', () => closeModal('wiki-editor'));
  };

  render();
  openModal({ id: 'wiki-editor', title: isEdit ? `Edit: ${existingPage.title}` : 'New Wiki Page', body: bodyEl, size: 'xl' });
}

// ══════════════════════════════════════════════════════════════════
// SESSION LOGS SECTION
// ══════════════════════════════════════════════════════════════════
function renderSessionsSection() {
  const content = document.getElementById('comp-content');

  content.innerHTML = `
    <div class="section-header">
      <h2>Session Logs</h2>
      <div class="section-header-actions">
        ${isAdmin ? '<button class="btn-sm btn-accent" id="btn-new-session">+ New Session</button>' : ''}
      </div>
    </div>
    <div class="session-logs-grid" id="sessions-grid"></div>
  `;

  const renderGrid = () => {
    const grid = document.getElementById('sessions-grid');
    const logs = sessionLogs.sort((a, b) => (b.sessionNumber || 0) - (a.sessionNumber || 0));

    grid.innerHTML = logs.map(log => `
      <div class="session-log-card" data-log-id="${log.id}">
        <div class="session-log-number">Session ${log.sessionNumber || '?'}</div>
        <div class="session-log-title">${esc(log.title || 'Untitled Session')}</div>
        <div class="session-log-date">${formatDate(log.date || log.updatedAt)}</div>
        ${log.isDraft ? '<span class="badge-draft" style="margin-top: var(--space-2);">Draft</span>' : ''}
        ${log.summary ? `<div class="session-log-summary">${esc(log.summary)}</div>` : ''}
      </div>
    `).join('') || '<div class="comp-empty"><div class="comp-empty-icon">▣</div><div class="comp-empty-text">No session logs yet</div></div>';

    grid.querySelectorAll('[data-log-id]').forEach(card => {
      card.addEventListener('click', () => openSessionLog(card.dataset.logId));
    });
  };

  renderGrid();
  document.getElementById('btn-new-session')?.addEventListener('click', () => openSessionEditor(null));
}

function openSessionLog(logId) {
  const log = sessionLogs.find(l => l.id === logId);
  if (!log) return;
  const rendered = renderMarkdown(log.content || '');
  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `
    <div style="margin-bottom: var(--space-4);">
      <div class="session-log-number" style="margin-bottom: var(--space-1);">Session ${log.sessionNumber || '?'}</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted);">${formatDate(log.date || log.updatedAt)}</div>
    </div>
    <div class="wiki-page">${rendered}</div>
    ${isAdmin ? `
      <div style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-color); display: flex; gap: var(--space-2);">
        <button class="btn-sm btn-accent" id="log-edit-btn">Edit</button>
        <button class="btn-sm btn-danger" id="log-delete-btn">Delete</button>
      </div>
    ` : ''}
  `;
  openModal({ id: 'session-view', title: log.title || 'Session Log', body: bodyEl, size: 'lg' });
  bodyEl.querySelector('#log-edit-btn')?.addEventListener('click', () => { closeModal('session-view'); openSessionEditor(log); });
  bodyEl.querySelector('#log-delete-btn')?.addEventListener('click', async () => {
    const yes = await showConfirmation(`Delete session log "${log.title}"?`, { danger: true });
    if (!yes) return;
    try {
      await deleteSessionLog(log.id);
      sessionLogs = sessionLogs.filter(l => l.id !== log.id);
      closeModal('session-view');
      renderSessionsSection();
      showNotification('Session log deleted.', 'success');
    } catch (err) { showNotification('Delete failed.', 'danger'); }
  });
}

function openSessionEditor(existingLog) {
  const isEdit = !!existingLog;
  let editorMode = 'write';
  const bodyEl = document.createElement('div');
  bodyEl.className = 'md-editor-container';

  const render = () => {
    const title = bodyEl.querySelector('#se-title')?.value || existingLog?.title || '';
    const content = bodyEl.querySelector('#se-content')?.value || existingLog?.content || '';
    const sessionNum = bodyEl.querySelector('#se-number')?.value || existingLog?.sessionNumber || (sessionLogs.length > 0 ? Math.max(...sessionLogs.map(l => l.sessionNumber || 0)) + 1 : 1);
    const summary = bodyEl.querySelector('#se-summary')?.value || existingLog?.summary || '';
    const dateVal = bodyEl.querySelector('#se-date')?.value || existingLog?.date || new Date().toISOString().split('T')[0];

    bodyEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        <div style="display: grid; grid-template-columns: 1fr 120px 160px; gap: var(--space-3);">
          <div>
            <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest);">Title</label>
            <input type="text" id="se-title" value="${esc(title)}" placeholder="Session title..." style="width:100%; margin-top: var(--space-1);">
          </div>
          <div>
            <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest);">Session #</label>
            <input type="number" id="se-number" value="${sessionNum}" min="1" style="width:100%; margin-top: var(--space-1);">
          </div>
          <div>
            <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest);">Date</label>
            <input type="date" id="se-date" value="${dateVal}" style="width:100%; margin-top: var(--space-1);">
          </div>
        </div>
        <div>
          <label style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: var(--tracking-widest);">Summary</label>
          <input type="text" id="se-summary" value="${esc(summary)}" placeholder="Brief summary..." style="width:100%; margin-top: var(--space-1);">
        </div>
        <div class="md-editor-tabs">
          <button class="md-editor-tab ${editorMode==='write'?'active':''}" data-mode="write">Write</button>
          <button class="md-editor-tab ${editorMode==='preview'?'active':''}" data-mode="preview">Preview</button>
        </div>
        ${editorMode === 'write' ? `
          <textarea class="md-editor-textarea" id="se-content" placeholder="Write your session log using Markdown...">${esc(content)}</textarea>
        ` : `
          <div class="md-editor-preview wiki-page">${renderMarkdown(content)}</div>
        `}
        <div class="md-editor-actions">
          <label style="font-size: var(--text-xs); color: var(--text-secondary); display: flex; align-items: center; gap: var(--space-2);">
            <input type="checkbox" id="se-draft" ${existingLog?.isDraft ? 'checked' : ''}> Draft
          </label>
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn-sm btn-ghost" id="se-cancel">Cancel</button>
            <button class="btn-sm btn-accent" id="se-save">${isEdit ? 'Save' : 'Create'}</button>
          </div>
        </div>
      </div>
    `;

    bodyEl.querySelectorAll('[data-mode]').forEach(tab => {
      tab.addEventListener('click', () => { editorMode = tab.dataset.mode; render(); });
    });

    bodyEl.querySelector('#se-save')?.addEventListener('click', async () => {
      const titleVal = bodyEl.querySelector('#se-title').value.trim();
      const contentVal = bodyEl.querySelector('#se-content')?.value || existingLog?.content || '';
      const numVal = parseInt(bodyEl.querySelector('#se-number').value) || 1;
      const summaryVal = bodyEl.querySelector('#se-summary').value.trim();
      const dateValSave = bodyEl.querySelector('#se-date').value;
      const isDraftVal = bodyEl.querySelector('#se-draft')?.checked || false;
      if (!titleVal) { showNotification('Title required.', 'danger'); return; }
      try {
        const data = { title: titleVal, content: editorMode === 'preview' ? (existingLog?.content || contentVal) : contentVal, sessionNumber: numVal, summary: summaryVal, date: dateValSave, isDraft: isDraftVal, format: 'markdown' };
        if (!isEdit) data.createdAt = new Date().toISOString();
        const savedId = await saveSessionLog(isEdit ? existingLog.id : null, data);
        if (isEdit) { const idx = sessionLogs.findIndex(l => l.id === existingLog.id); if (idx >= 0) sessionLogs[idx] = { ...sessionLogs[idx], ...data }; }
        else { sessionLogs.push({ id: savedId, ...data, updatedAt: new Date() }); }
        closeModal('session-editor');
        renderSessionsSection();
        showNotification(isEdit ? 'Session saved.' : 'Session created.', 'success');
      } catch (err) { showNotification('Save failed.', 'danger'); console.error(err); }
    });

    bodyEl.querySelector('#se-cancel')?.addEventListener('click', () => closeModal('session-editor'));
  };

  render();
  openModal({ id: 'session-editor', title: isEdit ? `Edit: ${existingLog.title}` : 'New Session Log', body: bodyEl, size: 'xl' });
}

// ══════════════════════════════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════════════════════════════
function renderMarkdown(md) {
  if (!md) return '<p style="color: var(--text-muted);">No content.</p>';
  let html = md;
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; height:auto; border: 1px solid var(--border-color); margin: var(--space-3) 0;">');
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^---+$/gm, '<hr style="border: none; border-top: 1px solid var(--border-color); margin: var(--space-4) 0;">');
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_, page) => {
    const target = wikiPages.find(p =>
      slugify(p.title || '') === slugify(page) || (p.title || '').toLowerCase() === page.toLowerCase()
    );
    if (target) return `<span class="wiki-link" data-wiki-nav="${esc(target.id)}">${esc(page)}</span>`;
    return `<span style="color: var(--text-muted);">${esc(page)}</span>`;
  });
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^- /, ''));
    return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, ''));
    return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
  });
  html = html.split('\n').map(line => {
    const t = line.trim();
    if (!t) return '';
    if (/^<(h[1-6]|ul|ol|li|blockquote|hr|img|table|div|pre)/.test(t)) return line;
    return `<p>${t}</p>`;
  }).join('\n');
  html = html.replace(/<p><\/p>/g, '');
  return html;
}

// ─── Go ───────────────────────────────────────────────────────────
init();
