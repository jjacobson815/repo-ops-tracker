// lanes.js — manage-lanes modal (mirrors workflow.js structure)
// Native ES module. Imports only from ./modal.js (no cycle with app.js).
// Receives ctx for app-level actions: { state, LANES, saveLanes, deleteLane, renderAll }.

import { askConfirm, showToast, openModal, closeModal } from './modal.js';

function getEl(id) { return document.getElementById(id); }

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

/** Derive a safe lowercase kebab-case id from a user label, unique within existing lanes. */
function makeId(label, lanes) {
  const base = label.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'lane';
  let id = base;
  let suffix = 2;
  while (lanes.some(l => l.id === id)) id = `${base}-${suffix++}`;
  return id;
}

let ctxRef = null;
let pendingDeleteLaneId = null;
let staticWired = false;

// ---------- delete-panel helpers ----------

function hideDeletePanel() {
  pendingDeleteLaneId = null;
  const panel = getEl('laneDeletePanel');
  if (panel) panel.hidden = true;
}

// ---------- list render ----------

function renderLaneList() {
  const list = getEl('lanesList');
  if (!list || !ctxRef) return;
  const { lanes, tasks } = ctxRef.state;
  list.innerHTML = lanes.map((lane, index) => {
    const count = tasks.filter(t => t.laneId === lane.id).length;
    return `<div class="lane-item">
      <span class="lane-item-swatch" style="background:${lane.accent}"></span>
      <input class="lane-item-input" data-lane-label="${lane.id}" value="${escapeHtml(lane.label)}" maxlength="40" aria-label="Lane name">
      <input class="lane-item-color" type="color" data-lane-color="${lane.id}" value="${lane.accent}" aria-label="Lane color">
      <span class="lane-item-meta">${count} card${count === 1 ? '' : 's'}</span>
      <button class="btn ghost" data-move-lane="${lane.id}" data-direction="up"${index === 0 ? ' disabled' : ''}>up</button>
      <button class="btn ghost" data-move-lane="${lane.id}" data-direction="down"${index === lanes.length - 1 ? ' disabled' : ''}>down</button>
      <button class="btn ghost" data-save-lane="${lane.id}">save</button>
      <button class="btn danger" data-delete-lane="${lane.id}">delete</button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-delete-lane]').forEach(btn =>
    btn.addEventListener('click', () => beginDeleteLane(btn.dataset.deleteLane)));
  list.querySelectorAll('[data-save-lane]').forEach(btn =>
    btn.addEventListener('click', () => saveOneLane(btn.dataset.saveLane)));
  list.querySelectorAll('[data-move-lane]').forEach(btn =>
    btn.addEventListener('click', () => moveLane(btn.dataset.moveLane, btn.dataset.direction)));
}

// ---------- persist helper ----------

async function persistLanes(nextLanes, message) {
  const result = await ctxRef.saveLanes(nextLanes);
  if (!result.ok) {
    showToast(result.error || 'could not save lanes');
    return false;
  }
  // Update the shared LANES array in-place so board.js sees the change
  ctxRef.LANES.splice(0, ctxRef.LANES.length, ...nextLanes);
  ctxRef.state.lanes.splice(0, ctxRef.state.lanes.length, ...nextLanes);
  renderLaneList();
  ctxRef.renderAll();
  showToast(message);
  return true;
}

// ---------- actions ----------

async function saveOneLane(laneId) {
  const label = getEl('lanesList')?.querySelector(`[data-lane-label="${laneId}"]`)?.value.trim();
  const accent = getEl('lanesList')?.querySelector(`[data-lane-color="${laneId}"]`)?.value;
  if (!label) { showToast('lane name required'); return; }
  const nextLanes = ctxRef.state.lanes.map(l => l.id === laneId ? { ...l, label, accent } : l);
  await persistLanes(nextLanes, 'lane saved');
}

async function moveLane(laneId, direction) {
  const lanes = ctxRef.state.lanes;
  const index = lanes.findIndex(l => l.id === laneId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= lanes.length) return;
  const nextLanes = [...lanes];
  [nextLanes[index], nextLanes[targetIndex]] = [nextLanes[targetIndex], nextLanes[index]];
  await persistLanes(nextLanes, 'lanes reordered');
}

function beginDeleteLane(laneId) {
  const { lanes, tasks } = ctxRef.state;
  const lane = lanes.find(l => l.id === laneId);
  const alternatives = lanes.filter(l => l.id !== laneId);
  if (!lane || alternatives.length === 0) {
    showToast('keep at least one swimlane');
    return;
  }
  pendingDeleteLaneId = laneId;
  const count = tasks.filter(t => t.laneId === laneId).length;
  const message = getEl('laneDeleteMessage');
  const select = getEl('laneReplacementSelect');
  const wrap = getEl('laneReplacementWrap');
  if (message) message.textContent = count
    ? `Move ${count} card${count === 1 ? '' : 's'} before deleting "${lane.label}".`
    : `Delete the empty "${lane.label}" lane?`;
  if (select) select.innerHTML = alternatives.map(l =>
    `<option value="${l.id}">${escapeHtml(l.label)}</option>`).join('');
  if (wrap) wrap.hidden = count === 0;
  const panel = getEl('laneDeletePanel');
  if (panel) panel.hidden = false;
}

async function confirmDeleteLane() {
  if (!pendingDeleteLaneId || !ctxRef) return;
  const lane = ctxRef.state.lanes.find(l => l.id === pendingDeleteLaneId);
  const count = ctxRef.state.tasks.filter(t => t.laneId === pendingDeleteLaneId).length;
  const replacementLaneId = getEl('laneReplacementSelect')?.value;
  if (count && !replacementLaneId) {
    showToast('choose a lane for the cards');
    return;
  }
  askConfirm(
    `Delete "${lane?.label || 'this'}"${count ? ` and move ${count} card${count === 1 ? '' : 's'}` : ''}?`,
    async () => {
      const result = await ctxRef.deleteLane(pendingDeleteLaneId, replacementLaneId);
      if (!result.ok) {
        showToast(result.error || 'could not delete lane');
        return;
      }
      // Sync local state from server response
      ctxRef.LANES.splice(0, ctxRef.LANES.length, ...result.lanes);
      ctxRef.state.lanes.splice(0, ctxRef.state.lanes.length, ...result.lanes);
      if (count) {
        ctxRef.state.tasks.forEach(t => {
          if (t.laneId === pendingDeleteLaneId) t.laneId = replacementLaneId;
        });
      }
      hideDeletePanel();
      renderLaneList();
      ctxRef.renderAll();
      showToast('lane deleted');
    }
  );
}

async function addLane() {
  const name = getEl('laneName')?.value.trim();
  const accent = getEl('laneColor')?.value || '#4FD1C5';
  if (!name) { showToast('lane name required'); return; }
  const lanes = ctxRef.state.lanes;
  const nextLanes = [...lanes, { id: makeId(name, lanes), label: name, accent }];
  const saved = await persistLanes(nextLanes, 'lane added');
  if (saved) {
    const nameEl = getEl('laneName');
    if (nameEl) nameEl.value = '';
  }
}

// ---------- wiring ----------

function wireStatic() {
  getEl('manageLanesBtn')?.addEventListener('click', () => openLanesModal(ctxRef));
  getEl('lanesCloseBtn')?.addEventListener('click', closeLanesModal);
  getEl('addLaneBtn')?.addEventListener('click', addLane);
  getEl('cancelDeleteLaneBtn')?.addEventListener('click', hideDeletePanel);
  getEl('confirmDeleteLaneBtn')?.addEventListener('click', confirmDeleteLane);
}

export function initLanes(ctx) {
  ctxRef = ctx;
  if (!staticWired) {
    wireStatic();
    staticWired = true;
  }
}

export function openLanesModal(ctx) {
  ctxRef = ctx;
  hideDeletePanel();
  renderLaneList();
  openModal('lanesModalOverlay');
}

export function closeLanesModal() {
  hideDeletePanel();
  closeModal('lanesModalOverlay');
}
