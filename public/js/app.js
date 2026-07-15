// app.js — Frontend core (Phase C1 of the modular refactor)
// Native ES module. No build step, no npm deps in the browser.
// Loaded by public/index.html via <script type="module" src="js/app.js"></script>.
//
// Responsibilities of THIS file (Phase C1):
//   - Hold the single global `state` object.
//   - Define the kanban `COLUMNS` array once and export it.
//   - Define the `LANES` array once and export it.
//   - Load data from the backend via api.js and bootstrap the app (initApp).
//   - Re-render all views (renderAll) by delegating to component modules.
//   - Wire tab routing and the board/library filter inputs.
//   - Provide persistence wrappers (saveTasks / saveLibrary / saveWorkflow /
//     saveLanes / deleteLane) that call api.js and surface a status flash.
//
// ============================================================================
// COMPONENT MODULE INTERFACE CONTRACT (Phase C2 must fulfill these EXACT
// named exports). app.js imports the names listed below; if a name is missing
// or misnamed the import will fail at load time.
// ============================================================================
//
// ./components/dashboard.js
//   renderDashboard(state, ctx)
//       Reads state.tasks and fills #statGrid, #stageBars, #agentBars,
//       #recentActivity. Pure read of state — no mutation.
//
// ./components/board.js
//   renderBoard(state, ctx)
//       Renders the kanban swimlane grid into #boardEl from state.tasks,
//       honoring the #boardSearch filter value. Each cell is keyed by
//       (laneId, colId). Must ATTACH event listeners (drag/drop, card click ->
//       openTaskModal, "+ add" buttons) — do NOT rely on inline onclick=""
//       handlers. Use ctx for cross-cutting actions.
//   openTaskModal(id, defaultColumn, ctx, defaultLane)
//       Opens #taskModalOverlay, populates the form from state.tasks[id] (or
//       blanks it for a new task in `defaultColumn`/`defaultLane`).
//       Sets state.currentTaskId.
//   closeTaskModal(ctx)
//       Hides #taskModalOverlay and clears state.currentTaskId.
//   saveTaskFromModal(ctx)
//       Reads the form fields, mutates state.tasks (insert or update), calls
//       ctx.saveTasks(), re-renders via ctx.renderAll(), then closeTaskModal.
//   deleteCurrentTask(ctx)
//       Reads state.currentTaskId, calls ctx.askConfirm(message, onConfirm);
//       on confirm removes the task from state.tasks, ctx.saveTasks(),
//       ctx.renderAll(), closeTaskModal.
//   (drag-and-drop handlers are internal to board.js but must call
//    ctx.saveTasks() + ctx.renderAll() on a successful cell change.)
//
// ./components/library.js
//   renderLibrary(state, ctx)
//       Renders #libGrid from state.library (newest first), honoring the
//       #libSearch filter. Attach listeners for copy/edit (no inline onclick).
//   openLibModal(id, ctx)
//       Opens #libModalOverlay, populates from state.library[id] or blanks it.
//       Sets state.currentLibId.
//   closeLibModal(ctx)
//       Hides #libModalOverlay and clears state.currentLibId.
//   saveLibFromModal(ctx)
//       Reads form, mutates state.library, ctx.saveLibrary(), ctx.renderAll(),
//       closeLibModal.
//   deleteCurrentLib(ctx)
//       ctx.askConfirm(...) -> remove from state.library, ctx.saveLibrary(),
//       ctx.renderAll(), closeLibModal.
//   copyLibBody(id, ctx)
//       navigator.clipboard.writeText(body) then ctx.showToast('copied...').
//
// ./components/modal.js
//   askConfirm(message, onConfirm)
//       Shows #confirmOverlay with `message`; wires #confirmDeleteBtn to call
//       onConfirm() once. This is the ONLY sanctioned path for destructive
//       actions (delete task / delete library entry / delete lane).
//   closeConfirm()
//       Hides #confirmOverlay and clears the pending callback.
//   showToast(msg)
//       Transient toast via #toast.
//   flashStatus(msg)
//       Transient "saved" pill via #statusPill.
//
// ./components/workflow.js
//   initWorkflow(ctx) — wires static buttons; captures ctxRef.
//
// ./components/lanes.js
//   initLanes(ctx) — wires static buttons; captures ctxRef.
//
// ----------------------------------------------------------------------------
// HOW COMPONENTS GET WHAT THEY NEED (no circular imports):
//   - Components import { askConfirm, showToast, flashStatus } directly from
//     './modal.js' (modal.js imports nothing from app.js or the other
//     components, so there is no cycle).
//   - Components receive `ctx` (built below) for the app-level actions that
//     live in app.js: { state, COLUMNS, LANES, saveTasks, saveLibrary,
//     saveWorkflow, deleteWorkflowState, saveLanes, deleteLane, renderAll }.
//   - Components therefore NEVER import from app.js, avoiding a cycle.
// ----------------------------------------------------------------------------

import {
  getBoards,
  getBoard,
  saveBoards,
  updateBoard,
  deleteBoard,
  getTasks,
  saveTasks as apiSaveTasks,
  getBoardTasks,
  saveBoardTasks,
  getLibrary,
  saveLibrary as apiSaveLibrary,
  getWorkflow,
  saveWorkflow as apiSaveWorkflow,
  deleteWorkflowState as apiDeleteWorkflowState,
  getLanes,
  getBoardLanes,
  saveLanes as apiSaveLanes,
  deleteBoardLane,
  getBoardWorkflow,
  saveBoardWorkflow,
  deleteBoardWorkflowState
} from './api.js';
import { renderDashboard } from './components/dashboard.js';
import {
  renderBoard,
  openTaskModal,
  closeTaskModal,
  saveTaskFromModal,
  deleteCurrentTask
} from './components/board.js';
import {
  renderLibrary,
  openLibModal,
  closeLibModal,
  saveLibFromModal,
  deleteCurrentLib,
  copyLibBody
} from './components/library.js';
import { askConfirm, closeConfirm, showToast, flashStatus } from './components/modal.js';
import { initWorkflow } from './components/workflow.js';
import { initLanes } from './components/lanes.js';

// Kanban stages — defined ONCE here and exported for board.js / modal.js reuse.
// Do not hardcode column ids anywhere else.
export const COLUMNS = [];

// Swimlanes — defined ONCE here, exported for board.js / lanes.js reuse.
// Populated from /api/lanes on boot.
export const LANES = [];

// Single global application state. Mutated in place by component controllers;
// never reassigned wholesale (so imported references stay valid).
export const state = {
  boards: [],
  currentBoardId: null,
  tasks: [],
  library: [],
  workflow: COLUMNS,
  lanes: LANES,
  currentTaskId: null,
  currentLibId: null,
};

// Context object handed to component render/controller functions. Keeps the
// app-level actions (persistence + re-render) available without components
// importing app.js (prevents a circular dependency).
const ctx = {
  state,
  COLUMNS,
  LANES,
  saveTasks,
  saveLibrary,
  saveWorkflow,
  deleteWorkflowState,
  saveLanes,
  deleteLane,
  renderAll,
};

// ---- persistence wrappers -------------------------------------------------
// These wrap the raw api calls: they persist the current arrays and surface a
// status flash. They are passed into components via `ctx`.

export async function saveTasks() {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const res = await saveBoardTasks(state.currentBoardId, state.tasks);
    if (!res.ok) throw new Error('tasks save failed');
    flashStatus('saved');
  } catch (e) {
    flashStatus('save failed');
  }
}

export async function saveLibrary() {
  try {
    const res = await apiSaveLibrary(state.library);
    if (!res.ok) throw new Error('library save failed');
    flashStatus('saved');
  } catch (e) {
    flashStatus('save failed');
  }
}

export async function saveWorkflow(workflow) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const res = await saveBoardWorkflow(state.currentBoardId, workflow);
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    flashStatus('saved');
    return { ok: true };
  } catch (e) {
    flashStatus('save failed');
    return { ok: false, error: 'could not save workflow' };
  }
}

export async function deleteWorkflowState(stateId, replacementStateId) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const res = await deleteBoardWorkflowState(state.currentBoardId, stateId, replacementStateId);
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    flashStatus('saved');
    return { ok: true, workflow: body.workflow };
  } catch (e) {
    flashStatus('save failed');
    return { ok: false, error: 'could not delete workflow state' };
  }
}

export async function saveLanes(lanes) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const res = await saveBoardLanes(state.currentBoardId, lanes);
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    flashStatus('saved');
    return { ok: true };
  } catch (e) {
    flashStatus('save failed');
    return { ok: false, error: 'could not save lanes' };
  }
}

export async function deleteLane(laneId, replacementLaneId) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const res = await deleteBoardLane(state.currentBoardId, laneId, replacementLaneId);
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    flashStatus('saved');
    return { ok: true, lanes: body.lanes };
  } catch (e) {
    flashStatus('save failed');
    return { ok: false, error: 'could not delete lane' };
  }
}

// ---- bootstrap ------------------------------------------------------------

export async function initApp() {
  try {
    state.boards = await getBoards();
    state.currentBoardId = state.boards.find(b => b.isDefault)?.id || state.boards[0]?.id || null;
    state.library = Array.isArray(await getLibrary()) ? await getLibrary() : [];

    refreshBoardSelector();

    if (!state.currentBoardId) {
      showToast('no board available');
      return;
    }

    const [tasks, workflow, lanes] = await Promise.all([
      getBoardTasks(state.currentBoardId),
      getBoardWorkflow(state.currentBoardId),
      getBoardLanes(state.currentBoardId)
    ]);

    state.tasks = Array.isArray(tasks) ? tasks : [];
    COLUMNS.splice(0, COLUMNS.length, ...(Array.isArray(workflow) ? workflow : []));
    LANES.splice(0, LANES.length, ...(Array.isArray(lanes) ? lanes : []));

    const defaultLaneId = LANES[0]?.id || 'general';
    let needsMigration = false;
    state.tasks.forEach(t => {
      if (!t.boardId) {
        t.boardId = state.currentBoardId;
        needsMigration = true;
      }
      if (!t.laneId) {
        t.laneId = defaultLaneId;
        needsMigration = true;
      }
    });
    if (needsMigration) {
      try { await saveBoardTasks(state.currentBoardId, state.tasks); } catch (_) { /* non-fatal */ }
    }
  } catch (e) {
    showToast('failed to load data');
    state.tasks = [];
    state.library = [];
  }
  renderAll();
}

export function renderAll() {
  renderDashboard(state, ctx);
  renderBoard(state, ctx);
  renderLibrary(state, ctx);
}

// ---- tab routing ----------------------------------------------------------

function wireTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = document.getElementById('view-' + btn.dataset.tab);
      if (view) view.classList.add('active');
    });
  });
}

// ---- filter inputs --------------------------------------------------------

function wireFilters() {
  const boardSearch = document.getElementById('boardSearch');
  if (boardSearch) boardSearch.addEventListener('input', () => renderBoard(state, ctx));

  const libSearch = document.getElementById('libSearch');
  if (libSearch) libSearch.addEventListener('input', () => renderLibrary(state, ctx));
}

function wireBoardSelector() {
  const selector = document.getElementById('boardSelector');
  if (!selector) return;
  selector.addEventListener('change', async (event) => {
    await switchBoard(event.target.value);
  });
}

function refreshBoardSelector() {
  const selector = document.getElementById('boardSelector');
  if (!selector) return;
  selector.innerHTML = state.boards.map(board =>
    `<option value="${board.id}">${board.title}</option>`
  ).join('');
  selector.value = state.currentBoardId || '';
}

export async function switchBoard(boardId) {
  if (!boardId || state.currentBoardId === boardId) return;
  state.currentBoardId = boardId;
  const [tasks, workflow, lanes] = await Promise.all([
    getBoardTasks(boardId),
    getBoardWorkflow(boardId),
    getBoardLanes(boardId)
  ]);
  state.tasks = Array.isArray(tasks) ? tasks : [];
  COLUMNS.splice(0, COLUMNS.length, ...(Array.isArray(workflow) ? workflow : []));
  LANES.splice(0, LANES.length, ...(Array.isArray(lanes) ? lanes : []));
  renderAll();
}

// ---- boot -----------------------------------------------------------------

function boot() {
  wireTabs();
  wireFilters();
  wireBoardSelector();
  initWorkflow(ctx);
  initLanes(ctx);
  initApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
