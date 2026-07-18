// boards.js — manage-boards modal: create, rename, delete, duplicate, export, import.
// Native ES module. Imports only from ./modal.js (no cycle with app.js).
// Receives ctx: { state, getAllTasksAcrossBoards, fetchBoardBundleSource,
// importBoardBundle, renameBoard, removeBoard, reloadBoards }.

import { askConfirm, showToast } from './modal.js';

function getEl(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '\u0026': '\u0026amp;',
    '\u003c': '\u0026lt;',
    '\u003e': '\u0026gt;',
    '\u0022': '\u0026quot;',
    '\u0027': '\u0026#39;'
  }[c]));
}
function nowStamp() { return new Date().toISOString().slice(0, 10); }
function slugify(title) {
  return (title || 'board').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'board';
}

let ctxRef = null;
let pendingDeleteBoardId = null;
let staticWired = false;
let taskCountsByBoard = {};

// ---------- portable bundle conversion ----------

function toPortableBundle({ board, workflow, lanes, tasks }) {
  const sortedWorkflow = [...workflow].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedLanes = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);
  const workflowIndex = new Map(sortedWorkflow.map((w, i) => [w.id, i]));
  const laneIndex = new Map(sortedLanes.map((l, i) => [l.id, i]));
  return {
    schemaVersion: 1,
    board: { title: board?.title || 'Untitled board', description: board?.description || '' },
    workflow: sortedWorkflow.map((w) => ({ label: w.label, accent: w.accent, isComplete: !!w.isComplete })),
    lanes: sortedLanes.map((l) => ({ label: l.label, accent: l.accent })),
    tasks: tasks
      .filter((t) => workflowIndex.has(t.column) && laneIndex.has(t.laneId))
      .map((t) => ({
        title: t.title, repoName: t.repoName || '', repoUrl: t.repoUrl || '',
        agent: t.agent || '', agentCustom: t.agentCustom || '', notes: t.notes || '',
        tags: Array.isArray(t.tags) ? t.tags : [],
        columnIndex: workflowIndex.get(t.column), laneIndex: laneIndex.get(t.laneId),
        createdAt: t.createdAt, updatedAt: t.updatedAt
      }))
  };
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- actions ----------

async function exportBoard(boardId) {
  try {
    const source = await ctxRef.fetchBoardBundleSource(boardId);
    if (!source.board) { showToast('board not found'); return; }
    downloadJson(`${slugify(source.board.title)}-${nowStamp()}.json`, toPortableBundle(source));
    showToast('board exported');
  } catch (e) {
    showToast('export failed');
  }
}

async function duplicateBoard(boardId) {
  try {
    const source = await ctxRef.fetchBoardBundleSource(boardId);
    if (!source.board) { showToast('board not found'); return; }
    const bundle = toPortableBundle(source);
    bundle.board.title = `${bundle.board.title} (copy)`;
    const result = await ctxRef.importBoardBundle(bundle);
    if (!result.ok) { showToast(result.error || 'duplicate failed'); return; }
    await ctxRef.reloadBoards(result.boardId);
    await refreshBoardsList();
    showToast('board duplicated');
  } catch (e) {
    showToast('duplicate failed');
  }
}

async function importFromFile(file) {
  if (!file) return;
  let bundle;
  try {
    bundle = JSON.parse(await file.text());
  } catch (e) {
    showToast('not valid JSON');
    return;
  }
  const result = await ctxRef.importBoardBundle(bundle);
  if (!result.ok) { showToast(result.error || 'import failed'); return; }
  await ctxRef.reloadBoards(result.boardId);
  await refreshBoardsList();
  showToast('board imported');
}

function blankTemplate(title, description) {
  return {
    schemaVersion: 1,
    board: { title, description },
    workflow: [
      { label: 'backlog', accent: '#8891A5', isComplete: false },
      { label: 'in-progress', accent: '#4FD1C5', isComplete: false },
      { label: 'done', accent: '#4ADE80', isComplete: true }
    ],
    lanes: [{ label: 'general', accent: '#4FD1C5' }],
    tasks: []
  };
}

async function createBlankBoard() {
  const title = getEl('newBoardTitle')?.value.trim();
  if (!title) { showToast('board title required'); return; }
  const description = getEl('newBoardDescription')?.value.trim() || '';
  const result = await ctxRef.importBoardBundle(blankTemplate(title, description));
  if (!result.ok) { showToast(result.error || 'could not create board'); return; }
  await ctxRef.reloadBoards(result.boardId);
  await refreshBoardsList();
  getEl('newBoardTitle').value = '';
  getEl('newBoardDescription').value = '';
  showToast('board created');
}

async function saveOneBoard(boardId) {
  const title = getEl('boardsList')?.querySelector(`[data-board-title="${boardId}"]`)?.value.trim();
  const description = getEl('boardsList')?.querySelector(`[data-board-desc="${boardId}"]`)?.value ?? '';
  if (!title) { showToast('board title required'); return; }
  const result = await ctxRef.renameBoard(boardId, { title, description });
  if (!result.ok) { showToast(result.error || 'could not save board'); return; }
  await ctxRef.reloadBoards();
  await refreshBoardsList();
  showToast('board saved');
}

function hideDeleteBoardPanel() {
  pendingDeleteBoardId = null;
  const panel = getEl('boardDeletePanel');
  if (panel) panel.hidden = true;
}

function beginDeleteBoard(boardId) {
  const { boards } = ctxRef.state;
  if (boards.length <= 1) { showToast('keep at least one board'); return; }
  const board = boards.find((b) => b.id === boardId);
  pendingDeleteBoardId = boardId;
  const count = taskCountsByBoard[boardId] || 0;
  const message = getEl('boardDeleteMessage');
  if (message) message.textContent = count
    ? `Delete "${board?.title}" and its ${count} card${count === 1 ? '' : 's'}? This can't be undone.`
    : `Delete "${board?.title}"? This can't be undone.`;
  const panel = getEl('boardDeletePanel');
  if (panel) panel.hidden = false;
}

async function confirmDeleteBoard() {
  if (!pendingDeleteBoardId || !ctxRef) return;
  const boardId = pendingDeleteBoardId;
  const board = ctxRef.state.boards.find((b) => b.id === boardId);
  askConfirm(`Delete "${board?.title || 'this board'}"? This can't be undone.`, async () => {
    const result = await ctxRef.removeBoard(boardId);
    if (!result.ok) { showToast(result.error || 'could not delete board'); return; }
    const wasActive = ctxRef.state.currentBoardId === boardId;
    hideDeleteBoardPanel();
    if (wasActive) {
      const fallback = result.boards.find((b) => b.isDefault)?.id || result.boards[0]?.id;
      await ctxRef.reloadBoards(fallback);
    } else {
      await ctxRef.reloadBoards();
    }
    await refreshBoardsList();
    showToast('board deleted');
  });
}

// ---------- list render ----------

async function refreshBoardsList() {
  const list = getEl('boardsList');
  if (!list || !ctxRef) return;
  const allTasks = await ctxRef.getAllTasksAcrossBoards();
  taskCountsByBoard = {};
  allTasks.forEach((t) => { taskCountsByBoard[t.boardId] = (taskCountsByBoard[t.boardId] || 0) + 1; });

  const boards = ctxRef.state.boards;
  list.innerHTML = boards.map((board) => {
    const count = taskCountsByBoard[board.id] || 0;
    return `<div class="board-item">
      <div class="board-item-row">
        <input class="board-item-input" data-board-title="${board.id}" value="${escapeHtml(board.title)}" maxlength="200" aria-label="Board title">
        ${board.isDefault ? '<span class="board-item-badge">default</span>' : ''}
        <span class="lane-item-meta">${count} card${count === 1 ? '' : 's'}</span>
      </div>
      <textarea class="board-item-desc" data-board-desc="${board.id}" maxlength="500" rows="1" aria-label="Board description">${escapeHtml(board.description)}</textarea>
      <div class="board-item-actions">
        <button class="btn ghost" data-save-board="${board.id}">save</button>
        <button class="btn ghost" data-export-board="${board.id}">export</button>
        <button class="btn ghost" data-duplicate-board="${board.id}">duplicate</button>
        <button class="btn danger" data-delete-board="${board.id}"${boards.length <= 1 ? ' disabled' : ''}>delete</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-save-board]').forEach((btn) =>
    btn.addEventListener('click', () => saveOneBoard(btn.dataset.saveBoard)));
  list.querySelectorAll('[data-export-board]').forEach((btn) =>
    btn.addEventListener('click', () => exportBoard(btn.dataset.exportBoard)));
  list.querySelectorAll('[data-duplicate-board]').forEach((btn) =>
    btn.addEventListener('click', () => duplicateBoard(btn.dataset.duplicateBoard)));
  list.querySelectorAll('[data-delete-board]').forEach((btn) =>
    btn.addEventListener('click', () => beginDeleteBoard(btn.dataset.deleteBoard)));
}

// ---------- wiring ----------

function wireStatic() {
  getEl('manageBoardsBtn')?.addEventListener('click', () => openBoardsModal(ctxRef));
  getEl('boardsCloseBtn')?.addEventListener('click', closeBoardsModal);
  getEl('addBoardBtn')?.addEventListener('click', createBlankBoard);
  getEl('importBoardBtn')?.addEventListener('click', () => getEl('importBoardFile')?.click());
  getEl('importBoardFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    importFromFile(file);
    e.target.value = '';
  });
  getEl('cancelDeleteBoardBtn')?.addEventListener('click', hideDeleteBoardPanel);
  getEl('confirmDeleteBoardBtn')?.addEventListener('click', confirmDeleteBoard);
}

export function initBoards(ctx) {
  ctxRef = ctx;
  if (!staticWired) { wireStatic(); staticWired = true; }
}

export async function openBoardsModal(ctx) {
  ctxRef = ctx;
  hideDeleteBoardPanel();
  await refreshBoardsList();
  getEl('boardsModalOverlay')?.classList.add('show');
}

export function closeBoardsModal() {
  hideDeleteBoardPanel();
  getEl('boardsModalOverlay')?.classList.remove('show');
}
