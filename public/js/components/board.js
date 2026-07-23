// board.js — kanban swimlane board view + task modal (Phase C2 + swimlanes)
// Renders a 2-D grid: rows = swimlanes, columns = workflow states.
// Each cell (laneId × colId) is independently droppable and has a "+ add" button.
// Imports only from ./modal.js; receives ctx (no circular import with app.js).

import { askConfirm, showToast, flashStatus, openModal, closeModal } from './modal.js';
import { mountAttachments } from './attachments.js';

function getEl(id) { return document.getElementById(id); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nowIso() { return new Date().toISOString(); }
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => {
    switch (c) {
      case '&': return '&' + 'amp;';
      case '<': return '&' + 'lt;';
      case '>': return '&' + 'gt;';
      case '"': return '&' + 'quot;';
      case "'": return '&' + '#39;';
    }
    return c;
  });
}

let dragTaskId = null;
let ctxRef = null;        // captured from renderBoard so static listeners can reach ctx
let staticWired = false;  // wire the static (non-rendered) buttons exactly once

function wireStatic() {
  const newTaskBtn = getEl('newTaskBtn');
  if (newTaskBtn) newTaskBtn.addEventListener('click', () => {
    const firstCol = ctxRef?.COLUMNS[0]?.id || 'backlog';
    const firstLane = ctxRef?.LANES[0]?.id || 'general';
    openTaskModal(null, firstCol, ctxRef, firstLane);
  });

  // agent select toggles the custom-agent field
  const agentSel = getEl('f-agent');
  if (agentSel) agentSel.addEventListener('change', () => {
    const wrap = getEl('f-agent-custom-wrap');
    if (wrap) wrap.style.display = agentSel.value === 'Other' ? 'block' : 'none';
  });

  const saveBtn = getEl('taskSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveTaskFromModal(ctxRef));
  const cancelBtn = getEl('taskCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeTaskModal(ctxRef));
  const delBtn = getEl('taskDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', () => deleteCurrentTask(ctxRef));
}

// ---------- board render ----------

export function renderBoard(state, ctx) {
  ctxRef = ctx;
  if (!staticWired) { wireStatic(); staticWired = true; }

  const boardEl = getEl('boardEl');
  if (!boardEl) return;

  const q = (getEl('boardSearch')?.value || '').toLowerCase();
  const COLUMNS = ctx.COLUMNS;
  const LANES = ctx.LANES;

  if (!COLUMNS.length || !LANES.length) {
    const message = !COLUMNS.length && !LANES.length
      ? 'This board has no workflow states or swimlanes yet. Add states in manage workflow and lanes in manage swimlanes.'
      : !COLUMNS.length
        ? 'This board has no workflow states yet. Add states in manage workflow.'
        : 'This board has no swimlanes yet. Add lanes in manage swimlanes.';
    boardEl.innerHTML = `<div class="empty-col" style="padding:40px;">${escapeHtml(message)}</div>`;
    return;
  }

  // Build the grid HTML.
  // Layout: CSS grid with (LANES.length + 1) rows × (COLUMNS.length + 1) cols.
  // Row 0   = column headers
  // Col 0   = lane labels
  // Rest    = cells

  const numCols = COLUMNS.length + 1; // +1 for lane-label column
  boardEl.innerHTML = '';
  boardEl.className = 'swim-board';
  boardEl.style.gridTemplateColumns = `140px repeat(${COLUMNS.length}, minmax(240px,1fr))`;

  // ---- Row 0: top-left corner + column headers ----
  const corner = document.createElement('div');
  corner.className = 'swim-corner';
  boardEl.appendChild(corner);

  COLUMNS.forEach(col => {
    const header = document.createElement('div');
    header.className = 'swim-col-header';
    header.style.setProperty('--accent', col.accent);
    header.innerHTML = `
      <span class="col-name">${escapeHtml(col.label)}</span>
      <span class="col-count" id="colcount-${col.id}"></span>`;
    boardEl.appendChild(header);
  });

  // ---- Rows 1…N: lane label + cells ----
  LANES.forEach(lane => {
    // Lane label cell
    const laneLabel = document.createElement('div');
    laneLabel.className = 'swim-lane-label';
    laneLabel.style.setProperty('--lane-accent', lane.accent);
    laneLabel.innerHTML = `<span class="lane-name">${escapeHtml(lane.label)}</span>`;
    boardEl.appendChild(laneLabel);

    // One cell per column
    COLUMNS.forEach(col => {
      let cellTasks = state.tasks.filter(t => t.column === col.id && t.laneId === lane.id);
      if (q) {
        cellTasks = cellTasks.filter(t =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.repoName || '').toLowerCase().includes(q) ||
          (t.tags || []).join(' ').toLowerCase().includes(q)
        );
      }

      const cell = document.createElement('div');
      cell.className = 'swim-cell';
      cell.dataset.col = col.id;
      cell.dataset.lane = lane.id;

      // Cards
      const cardsHtml = cellTasks.length
        ? cellTasks.map(t => {
          const agentLabel = t.agent === 'Other' && t.agentCustom ? t.agentCustom : t.agent;
          const tagsHtml = (t.tags || []).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join('');
          return `
            <div class="card" draggable="true" data-id="${t.id}">
              <div class="title">${escapeHtml(t.title)}</div>
              ${t.repoName ? `<div class="repo">${escapeHtml(t.repoName)}</div>` : ''}
              <div class="chips">
                ${agentLabel ? `<span class="chip agent">${escapeHtml(agentLabel)}</span>` : ''}
                ${tagsHtml}
              </div>
            </div>`;
        }).join('')
        : '<div class="empty-col">no cards</div>';

      cell.innerHTML = `
        <button class="btn column-add" data-col="${col.id}" data-lane="${lane.id}">+ add</button>
        <div class="cell-cards">${cardsHtml}</div>`;

      boardEl.appendChild(cell);
    });
  });

  // ---- Update column total counts in headers ----
  COLUMNS.forEach(col => {
    const countEl = getEl(`colcount-${col.id}`);
    if (countEl) {
      const total = state.tasks.filter(t => t.column === col.id).length;
      countEl.textContent = total;
    }
  });

  // ---- Attach event listeners ----

  // Cards: click to edit, drag to move
  boardEl.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openTaskModal(card.dataset.id, null, ctx, null));
    card.addEventListener('dragstart', e => {
      dragTaskId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  // "+ add" buttons: new task pre-filled with cell's col+lane
  boardEl.querySelectorAll('.column-add').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(null, btn.dataset.col, ctx, btn.dataset.lane));
  });

  // Cells: drag-over + drop (updates both column AND laneId)
  boardEl.querySelectorAll('.swim-cell').forEach(cell => {
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain') || dragTaskId;
      const colId = cell.dataset.col;
      const laneId = cell.dataset.lane;
      const task = state.tasks.find(t => t.id === id);
      if (task && (task.column !== colId || task.laneId !== laneId)) {
        task.column = colId;
        task.laneId = laneId;
        task.updatedAt = nowIso();
        ctx.saveTasks();
        ctx.renderAll();
      }
      dragTaskId = null;
    });
  });
}

// ---------- task modal ----------

export function openTaskModal(id, defaultColumn, ctx, defaultLane) {
  const state = ctx.state;
  state.currentTaskId = id;

  // Populate column select
  const colSelect = getEl('f-column');
  if (colSelect) colSelect.innerHTML = ctx.COLUMNS.map(c =>
    `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('');

  // Populate lane select
  const laneSelect = getEl('f-lane');
  if (laneSelect) laneSelect.innerHTML = ctx.LANES.map(l =>
    `<option value="${l.id}">${escapeHtml(l.label)}</option>`).join('');

  const customWrap = getEl('f-agent-custom-wrap');
  if (customWrap) customWrap.style.display = 'none';

  if (id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    getEl('taskModalTitle').textContent = 'edit task';
    getEl('f-title').value = t.title || '';
    getEl('f-repo').value = t.repoName || '';
    getEl('f-url').value = t.repoUrl || '';
    getEl('f-agent').value = t.agent || 'Claude';
    getEl('f-agent-custom').value = t.agentCustom || '';
    if (t.agent === 'Other' && customWrap) customWrap.style.display = 'block';
    if (colSelect) colSelect.value = t.column;
    if (laneSelect) laneSelect.value = t.laneId || (ctx.LANES[0]?.id || 'general');
    getEl('f-tags').value = (t.tags || []).join(', ');
    getEl('f-notes').value = t.notes || '';
    const delBtn = getEl('taskDeleteBtn');
    if (delBtn) delBtn.style.display = 'inline-block';
  } else {
    getEl('taskModalTitle').textContent = 'new task';
    getEl('f-title').value = '';
    getEl('f-repo').value = '';
    getEl('f-url').value = '';
    getEl('f-agent').value = 'Claude';
    getEl('f-agent-custom').value = '';
    if (colSelect) colSelect.value = defaultColumn || ctx.COLUMNS[0]?.id || 'backlog';
    if (laneSelect) laneSelect.value = defaultLane || ctx.LANES[0]?.id || 'general';
    getEl('f-tags').value = '';
    getEl('f-notes').value = '';
    const delBtn = getEl('taskDeleteBtn');
    if (delBtn) delBtn.style.display = 'none';
  }

  const attachmentsContainer = getEl('taskAttachments');
  if (attachmentsContainer) mountAttachments(attachmentsContainer, 'task', id || null);

  openModal('taskModalOverlay');
  getEl('f-title')?.focus();
}

export function closeTaskModal(ctx) {
  closeModal('taskModalOverlay');
  if (ctx && ctx.state) ctx.state.currentTaskId = null;
}

export function saveTaskFromModal(ctx) {
  const state = ctx.state;
  const title = getEl('f-title').value.trim();
  if (!title) { showToast('title required'); return; }
  const tags = getEl('f-tags').value.split(',').map(s => s.trim()).filter(Boolean);
  const payload = {
    title,
    repoName: getEl('f-repo').value.trim(),
    repoUrl: getEl('f-url').value.trim(),
    agent: getEl('f-agent').value,
    agentCustom: getEl('f-agent-custom').value.trim(),
    column: getEl('f-column').value,
    laneId: getEl('f-lane')?.value || (ctx.LANES[0]?.id || 'general'),
    boardId: state.currentBoardId,
    tags,
    notes: getEl('f-notes').value,
    updatedAt: nowIso()
  };
  if (state.currentTaskId) {
    const t = state.tasks.find(x => x.id === state.currentTaskId);
    if (t) Object.assign(t, payload);
  } else {
    payload.id = uid();
    payload.createdAt = nowIso();
    state.tasks.push(payload);
  }
  ctx.saveTasks(state.tasks);
  ctx.renderAll();
  closeTaskModal(ctx);
}

export function deleteCurrentTask(ctx) {
  const state = ctx.state;
  if (!state.currentTaskId) return;
  const t = state.tasks.find(x => x.id === state.currentTaskId);
  askConfirm(`Delete "${t ? t.title : 'this task'}"? This can't be undone.`, () => {
    state.tasks = state.tasks.filter(x => x.id !== state.currentTaskId);
    ctx.saveTasks();
    ctx.renderAll();
    closeTaskModal(ctx);
  });
}
