// app.js — Frontend core (Phase C1 of the modular refactor)
// Native ES module. No build step, no npm deps in the browser.
// Loaded by public/index.html via <script type="module" src="js/app.js"></script>.
//
// Responsibilities of THIS file (Phase C1):
//   - Hold the single global `state` object.
//   - Load the workflow states (kanban stages) from the backend and expose
//     getWorkflow()/setWorkflow() getters (the old hardcoded COLUMNS is gone).
//   - Load data from the backend via api.js and bootstrap the app (initApp).
//   - Re-render all views (renderAll) by delegating to component modules.
//   - Wire tab routing and the board/library filter inputs.
//   - Provide persistence wrappers (saveTasks / saveLibrary) that call api.js
//     and surface a status flash.
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
//       Renders the kanban board into #boardEl from state.tasks, honoring the
//       #boardSearch filter value. Must ATTACH event listeners (drag/drop,
//       card click -> openTaskModal, "+ add" buttons) — do NOT rely on the
//       inline onclick="" handlers left in public/index.html; those reference
//       globals that no longer exist. Use ctx for cross-cutting actions.
//   openTaskModal(id, defaultColumn, ctx)
//       Opens #taskModalOverlay, populates the form from state.tasks[id] (or
//       blanks it for a new task in `defaultColumn`). Sets state.currentTaskId.
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
//    ctx.saveTasks() + ctx.renderAll() on a successful column change.)
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
//       actions (delete task / delete library entry).
//   closeConfirm()
//       Hides #confirmOverlay and clears the pending callback.
//   showToast(msg)
//       Transient toast via #toast.
//   flashStatus(msg)
//       Transient "saved" pill via #statusPill.
//   (modal.js is also responsible for wiring #confirmDeleteBtn and the
//    click-outside-to-close behavior on #taskModalOverlay / #libModalOverlay /
//    #confirmOverlay, replacing the old inline handlers.)
//
// ----------------------------------------------------------------------------
// HOW COMPONENTS GET WHAT THEY NEED (no circular imports):
//   - Components import { askConfirm, showToast, flashStatus } directly from
//     './modal.js' (modal.js imports nothing from app.js or the other
//     components, so there is no cycle).
//   - Components receive `ctx` (built below) for the app-level actions that
//     live in app.js: { state, getWorkflow, setWorkflow, saveTasks,
//     saveLibrary, saveWorkflow, renderAll }.
//   - Components therefore NEVER import from app.js, avoiding a cycle.
// ----------------------------------------------------------------------------

import {
  getTasks,
  saveTasks as apiSaveTasks,
  getLibrary,
  saveLibrary as apiSaveLibrary,
  getWorkflow as apiGetWorkflow,
  saveWorkflow as apiSaveWorkflow
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
import { renderWorkflow } from './components/workflow.js';
import { askConfirm, closeConfirm, showToast, flashStatus } from './components/modal.js';

// Workflow states (kanban stages) are loaded from the backend (GET /api/workflow)
// and held here as the single source of truth — they are no longer hardcoded.
// Components read them via getWorkflow() and mutate via setWorkflow(); the `ctx`
// object threads both into components so they never import app.js directly
// (avoids a circular dependency). Keep the named-export style used for the old
// COLUMNS so importers that expect a getter keep working.
let workflow = [];

export function getWorkflow(){ return workflow; }
export function setWorkflow(w){ workflow = Array.isArray(w) ? w : []; }

// Single global application state. Mutated in place by component controllers;
// never reassigned wholesale (so imported references stay valid).
export const state = {
  tasks: [],
  library: [],
  currentTaskId: null,
  currentLibId: null,
};

// Context object handed to component render/controller functions. Keeps the
// app-level actions (persistence + re-render) available without components
// importing app.js (prevents a circular dependency).
const ctx = {
  state,
  getWorkflow,
  setWorkflow,
  saveTasks,
  saveLibrary,
  saveWorkflow,
  renderAll,
};

// ---- persistence wrappers -------------------------------------------------
// These wrap the raw api calls: they persist the current arrays and surface a
// status flash. They are passed into components via `ctx`.

export async function saveTasks() {
  try {
    const res = await apiSaveTasks(state.tasks);
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

// Persist the current workflow array (whole-array replace) and sync the in-
// memory copy with whatever the server returns (it echoes the saved array).
export async function saveWorkflow() {
  try {
    const res = await apiSaveWorkflow(getWorkflow());
    if (!res.ok) throw new Error('workflow save failed');
    const saved = await res.json();
    if (Array.isArray(saved)) setWorkflow(saved);
    flashStatus('saved');
  } catch (e) {
    flashStatus('save failed');
  }
}

// ---- bootstrap ------------------------------------------------------------

export async function initApp() {
  try {
    const [tasks, library, wf] = await Promise.all([
      getTasks(),
      getLibrary(),
      apiGetWorkflow()
    ]);
    state.tasks = Array.isArray(tasks) ? tasks : [];
    state.library = Array.isArray(library) ? library : [];
    setWorkflow(Array.isArray(wf) ? wf : []);
  } catch (e) {
    showToast('failed to load data');
    state.tasks = [];
    state.library = [];
    setWorkflow([]);
  }
  renderAll();
}

export function renderAll() {
  renderDashboard(state, ctx);
  renderBoard(state, ctx);
  renderLibrary(state, ctx);
  renderWorkflow(state, ctx);
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

// ---- boot -----------------------------------------------------------------

function boot() {
  wireTabs();
  wireFilters();
  initApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
