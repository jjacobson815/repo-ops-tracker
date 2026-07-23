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
//   openLibViewModal(id, ctx)
//       Opens #libViewModalOverlay (read-only markdown popover) for
//       state.library[id]; sets state.currentLibViewId. Renders body via
//       marked + DOMPurify (XSS-safe).
//   closeLibViewModal()
//       Hides #libViewModalOverlay and clears state.currentLibViewId.
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

// Persistence now runs entirely client-side against IndexedDB via store.js
// (Dexie). The old fetch layer (api.js) is deleted; the ctx contract these
// wrappers expose to components is unchanged (see store.js / RECON.md). The
// aliases below keep the wrapper bodies readable against the former API names.
import {
  ensureSeeded,
  getAllBoards as getBoards,
  getBoardById as getBoard,
  updateBoard,
  deleteBoard,
  getAllTasks as getTasks,
  getTasksByBoard as getBoardTasks,
  saveTasksForBoard as saveBoardTasks,
  getAllLibraryEntries as getLibrary,
  saveAllLibraryEntries as apiSaveLibrary,
  getLanesByBoard as getBoardLanes,
  saveLanesForBoard as saveBoardLanes,
  deleteBoardLane,
  getWorkflowByBoard as getBoardWorkflow,
  saveWorkflowForBoard as saveBoardWorkflow,
  deleteBoardWorkflowState,
  importBoard as apiImportBoard
} from './store.js';
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
import { initBoards, openBoardsView } from './components/boards.js';
import { syncPobPlanNow, startPobPlanAutoPoll, isPobPlanAutoPollEnabled, markPobPlanAutoPollEnabled } from './pob-plan-watch.js';

// Local HTML-escaping helper (this project duplicates this per-file rather
// than sharing a single util module). Used to safely interpolate untrusted
// values (e.g. board titles/ids) into innerHTML.
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => {
    switch (c) {
      case '&': return '\u0026amp;';
      case '<': return '\u0026lt;';
      case '>': return '\u0026gt;';
      case '"': return '\u0026quot;';
      case "'": return '\u0026#39;';
    }
    return c;
  });
}

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
  currentLibViewId: null,
};

let previouslyActiveTab = null;

function returnFromManageBoards() {
  const target = previouslyActiveTab || 'dashboard';
  document.querySelector(`.tab-btn[data-tab="${target}"]`)?.click();
}

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
  getAllTasksAcrossBoards, fetchBoardBundleSource, importBoardBundle, generateBoardDraft,
  renameBoard, removeBoard, reloadBoards, returnFromManageBoards,
};

// ---- persistence wrappers -------------------------------------------------
// These wrap the raw api calls: they persist the current arrays and surface a
// status flash. They are passed into components via `ctx`.

export async function saveTasks() {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    await saveBoardTasks(state.currentBoardId, state.tasks);
    flashStatus('saved');
  } catch (e) {
    flashStatus('save failed');
  }
}

export async function saveLibrary() {
  try {
    await apiSaveLibrary(state.library);
    flashStatus('saved');
  } catch (e) {
    flashStatus('save failed');
  }
}

export async function saveWorkflow(workflow) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    await saveBoardWorkflow(state.currentBoardId, workflow);
    flashStatus('saved');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'could not save workflow' };
  }
}

export async function deleteWorkflowState(stateId, replacementStateId) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const { workflow } = await deleteBoardWorkflowState(state.currentBoardId, stateId, replacementStateId);
    flashStatus('saved');
    return { ok: true, workflow };
  } catch (e) {
    return { ok: false, error: e.message || 'could not delete workflow state' };
  }
}

export async function saveLanes(lanes) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    await saveBoardLanes(state.currentBoardId, lanes);
    flashStatus('saved');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'could not save lanes' };
  }
}

export async function deleteLane(laneId, replacementLaneId) {
  try {
    if (!state.currentBoardId) throw new Error('no current board');
    const { lanes } = await deleteBoardLane(state.currentBoardId, laneId, replacementLaneId);
    flashStatus('saved');
    return { ok: true, lanes };
  } catch (e) {
    return { ok: false, error: e.message || 'could not delete lane' };
  }
}

export async function getAllTasksAcrossBoards() {
  try {
    const tasks = await getTasks();
    return Array.isArray(tasks) ? tasks : [];
  } catch (e) {
    return [];
  }
}

export async function fetchBoardBundleSource(boardId) {
  const [board, tasks, workflow, lanes, library] = await Promise.all([
    getBoard(boardId),
    getBoardTasks(boardId),
    getBoardWorkflow(boardId),
    getBoardLanes(boardId),
    getLibrary()
  ]);
  return {
    board,
    tasks: Array.isArray(tasks) ? tasks : [],
    workflow: Array.isArray(workflow) ? workflow : [],
    lanes: Array.isArray(lanes) ? lanes : [],
    library: Array.isArray(library) ? library : []
  };
}

export async function importBoardBundle(bundle) {
  try {
    const { boardId } = await apiImportBoard(bundle);
    // The library is global (not board-scoped). An import may create new
    // instructions, so refresh state.library from the store. reloadBoards()
    // (called by the caller) triggers switchBoard() -> renderAll(), which will
    // then surface the imported instructions in the library view.
    try {
      const lib = await getLibrary();
      if (Array.isArray(lib)) state.library = lib;
    } catch (_) { /* keep prior library on read failure */ }
    return { ok: true, boardId };
  } catch (e) {
    // store.importBoard throws the same rejection messages the API returned.
    return { ok: false, error: e.message || 'could not import board' };
  }
}

// AI board generation requires a server-side secret (OPENAI_API_KEY) and cannot
// run in the offline/on-device build — see RECON.md §c-3. Signature preserved;
// returns a clean unsupported-result the manage-boards UI already surfaces.
export async function generateBoardDraft(brief) {
  void brief;
  return { ok: false, error: 'AI board generation requires a server and is unavailable in offline mode' };
}

export async function renameBoard(boardId, patch) {
  try {
    const board = await updateBoard(boardId, patch);
    return { ok: true, board };
  } catch (e) {
    return { ok: false, error: e.message || 'could not rename board' };
  }
}

export async function removeBoard(boardId) {
  try {
    const boards = await deleteBoard(boardId);
    return { ok: true, boards };
  } catch (e) {
    return { ok: false, error: e.message || 'could not delete board' };
  }
}

export async function reloadBoards(selectBoardId) {
  try {
    state.boards = await getBoards();
    const targetId = selectBoardId && state.boards.some((b) => b.id === selectBoardId)
      ? selectBoardId
      : state.currentBoardId;
    if (targetId && targetId !== state.currentBoardId) {
      await switchBoard(targetId);
    }
    refreshBoardSelector();
  } catch (e) {
    showToast('failed to reload boards');
  }
}

// ---- bootstrap ------------------------------------------------------------

export async function initApp() {
  try {
    // First run: populate the default board / workflow / lanes / prompts
    // (replaces the old server-boot seeding).
    await ensureSeeded();
    state.boards = await getBoards();
    state.currentBoardId = state.boards.find(b => b.isDefault)?.id || state.boards[0]?.id || null;
    const initialLibrary = await getLibrary();
    state.library = Array.isArray(initialLibrary) ? initialLibrary : [];

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
    btn.addEventListener('click', async () => {
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (btn.dataset.tab === 'manage-boards' && activeTab && activeTab !== 'manage-boards') {
        previouslyActiveTab = activeTab;
      }
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = document.getElementById('view-' + btn.dataset.tab);
      if (view) view.classList.add('active');
      if (btn.dataset.tab === 'manage-boards') await openBoardsView(ctx);
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
    `<option value="${escapeHtml(board.id)}">${escapeHtml(board.title)}</option>`
  ).join('');
  selector.value = state.currentBoardId || '';
}

export async function switchBoard(boardId) {
  if (!boardId || state.currentBoardId === boardId) return;
  const previousBoardId = state.currentBoardId;
  try {
    const [tasks, workflow, lanes] = await Promise.all([
      getBoardTasks(boardId),
      getBoardWorkflow(boardId),
      getBoardLanes(boardId)
    ]);

    state.currentBoardId = boardId;
    state.tasks = Array.isArray(tasks) ? tasks : [];
    COLUMNS.splice(0, COLUMNS.length, ...(Array.isArray(workflow) ? workflow : []));
    LANES.splice(0, LANES.length, ...(Array.isArray(lanes) ? lanes : []));
    renderAll();
  } catch (err) {
    state.currentBoardId = previousBoardId;
    refreshBoardSelector();
    showToast('failed to switch board');
  }
}

// ---- PoB plan sync ----------------------------------------------------

// Re-reads the CURRENT board's tasks/workflow/lanes and re-renders. Unlike
// switchBoard(), this works even when the target board id already equals
// state.currentBoardId — needed after a pob-plan-watch sync writes new
// content into whichever board you happen to be looking at.
async function refreshCurrentBoardData() {
  if (!state.currentBoardId) return;
  try {
    const [tasks, workflow, lanes] = await Promise.all([
      getBoardTasks(state.currentBoardId),
      getBoardWorkflow(state.currentBoardId),
      getBoardLanes(state.currentBoardId)
    ]);
    state.tasks = Array.isArray(tasks) ? tasks : [];
    COLUMNS.splice(0, COLUMNS.length, ...(Array.isArray(workflow) ? workflow : []));
    LANES.splice(0, LANES.length, ...(Array.isArray(lanes) ? lanes : []));
    renderAll();
  } catch (_) { /* non-fatal */ }
}

async function onPobPlanApplied() {
  await reloadBoards();
  await refreshCurrentBoardData();
}

function wirePobPlanSync() {
  const btn = document.getElementById('pobPlanSyncBtn');
  const status = document.getElementById('pobPlanSyncStatus');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (status) status.textContent = 'syncing…';
    try {
      const result = await syncPobPlanNow({ force: true });
      if (!result.ok) {
        if (status) status.textContent = result.reason || 'sync failed';
      } else {
        await onPobPlanApplied();
        if (status) status.textContent = `synced ${result.boardCount} boards, ${result.taskCount} cards (generated ${new Date(result.generatedAt).toLocaleString()})`;
        showToast('PoB plan synced');
        // First successful manual sync opts this browser into background
        // auto-refresh going forward — see isPobPlanAutoPollEnabled() for why
        // this isn't on by default.
        if (!isPobPlanAutoPollEnabled()) {
          markPobPlanAutoPollEnabled();
          startPobPlanAutoPoll(onPobPlanApplied);
        }
      }
    } catch (e) {
      if (status) status.textContent = 'sync failed';
    } finally {
      btn.disabled = false;
    }
  });
}

// ---- boot -----------------------------------------------------------------

function boot() {
  wireTabs();
  wireFilters();
  wireBoardSelector();
  wirePobPlanSync();
  initWorkflow(ctx);
  initLanes(ctx);
  initBoards(ctx);
  initApp();
  if (isPobPlanAutoPollEnabled()) {
    startPobPlanAutoPoll(onPobPlanApplied);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
