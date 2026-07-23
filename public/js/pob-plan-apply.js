// pob-plan-apply.js — applies ONE PoB-plan board bundle (board/workflow/lanes/
// tasks row objects with deterministic sub-ids, produced by
// scripts/pob-plan/parse-plan.mjs) into this browser's IndexedDB, via
// store.js's existing upsert+delete-diff functions (same discipline the app
// itself uses — see KI-01 notes in store.js).
//
// Shared by two callers so they can never drift apart:
//   - scripts/pob-plan/sync-to-browser.mjs (Playwright-driven, dedicated profile)
//   - pob-plan-watch.js (this app, your actual browser tab)
//
// Board matching is by id FIRST, then by title. The title fallback matters
// the first time this runs against a browser where you already hand-imported
// one of these boards via the old schemaVersion:2 JSON export (which mints a
// random id) — it adopts that board (reusing its id) instead of creating a
// duplicate. From that point on the adopted board is a live mirror: manual
// edits made on it will be overwritten by the next sync, same as the
// Playwright-profile boards always were.

import * as store from './store.js';

export async function applyPobPlanBoard({ board, workflow, lanes, tasks }) {
  const now = new Date().toISOString();

  const existingBoards = await store.getAllBoards();
  const existing = existingBoards.find((b) => b.id === board.id)
    || existingBoards.find((b) => b.title === board.title);
  const boardId = existing ? existing.id : board.id;

  const boardRow = {
    id: boardId,
    title: board.title,
    description: board.description,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    isDefault: existing ? existing.isDefault : false
  };
  const nextBoards = existing
    ? existingBoards.map((b) => (b.id === boardId ? boardRow : b))
    : [...existingBoards, boardRow];
  await store.saveAllBoards(nextBoards);

  const workflowRows = workflow.map((w) => ({ ...w, boardId }));
  const laneRows = lanes.map((l) => ({ ...l, boardId }));
  await store.saveWorkflowForBoard(boardId, workflowRows);
  await store.saveLanesForBoard(boardId, laneRows);

  const existingTasks = await store.getTasksByBoard(boardId);
  const existingById = new Map(existingTasks.map((t) => [t.id, t]));
  const taskRows = tasks.map((t) => {
    const prior = existingById.get(t.id);
    return { ...t, boardId, createdAt: prior ? prior.createdAt : now, updatedAt: now };
  });
  await store.saveTasksForBoard(boardId, taskRows);

  // Reporting only — column ids are phase-prefixed (e.g. 'p0-done'), not the
  // literal string 'done', so completeness has to be looked up via each
  // workflow row's isComplete flag.
  const completeColumnIds = new Set(workflowRows.filter((w) => w.isComplete).map((w) => w.id));
  return {
    boardId,
    boardCreated: !existing,
    boardAdopted: !!existing && existing.id !== board.id,
    workflowCount: workflowRows.length,
    laneCount: laneRows.length,
    taskCount: taskRows.length,
    doneCount: taskRows.filter((t) => completeColumnIds.has(t.column)).length
  };
}
