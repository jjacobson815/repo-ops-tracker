'use strict';

// seed-board-data.js
// JSON-side helper. Does NOT write to SQLite.
//
// Backfills the default workflow states and a `general` lane into the legacy
// JSON mirror files (data/workflow.json and data/lanes.json) for any board in
// data/boards.json that lacks them. This keeps the legacy JSON mirrors in sync
// with what server.js seeds into SQLite on first boot (see defaultWorkflow()
// and defaultLanes() in server.js).
//
// Run with: node scripts/seed-board-data.js

const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');
const WORKFLOW_FILE = path.join(DATA_DIR, 'workflow.json');
const LANES_FILE = path.join(DATA_DIR, 'lanes.json');

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

async function writeJson(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

// Default workflow states, mirroring server.js defaultWorkflow() but scoped to
// the given boardId.
function defaultWorkflowForBoard(boardId) {
  return [
    { id: 'backlog', label: 'backlog', accent: '#8891A5', isComplete: false, boardId, sortOrder: 0 },
    { id: 'cloning', label: 'cloning', accent: '#4FD1C5', isComplete: false, boardId, sortOrder: 1 },
    { id: 'agent-docs', label: 'agent-docs', accent: '#F5A623', isComplete: false, boardId, sortOrder: 2 },
    { id: 'build-touch', label: 'build-touch', accent: '#9B8FE0', isComplete: false, boardId, sortOrder: 3 },
    { id: 'done', label: 'done', accent: '#4ADE80', isComplete: true, boardId, sortOrder: 4 }
  ];
}

// Default `general` lane for a board, mirroring server.js defaultLanes().
function defaultGeneralLane(boardId) {
  return { id: 'general', boardId, label: 'general', accent: '#4FD1C5', sortOrder: 0 };
}

async function run() {
  const boards = await readJson(BOARDS_FILE);
  if (boards.length === 0) {
    console.log('No boards found in boards.json; nothing to seed.');
    return;
  }

  const workflows = await readJson(WORKFLOW_FILE);
  const lanes = await readJson(LANES_FILE);

  let workflowChanged = false;
  let lanesChanged = false;

  for (const board of boards) {
    const boardId = board && board.id;
    if (!boardId) continue;

    // Backfill default workflow states if this board has none.
    const hasWorkflow = workflows.some(w => w && w.boardId === boardId);
    if (!hasWorkflow) {
      workflows.push(...defaultWorkflowForBoard(boardId));
      workflowChanged = true;
      console.log(`Backfilled default workflow states for board "${boardId}".`);
    }

    // Backfill a `general` lane if this board lacks one.
    const hasGeneralLane = lanes.some(l => l && l.boardId === boardId && l.id === 'general');
    if (!hasGeneralLane) {
      lanes.push(defaultGeneralLane(boardId));
      lanesChanged = true;
      console.log(`Backfilled "general" lane for board "${boardId}".`);
    }
  }

  if (workflowChanged) {
    await writeJson(WORKFLOW_FILE, workflows);
    console.log(`Wrote ${workflows.length} workflow states to ${path.relative(process.cwd(), WORKFLOW_FILE)}.`);
  }
  if (lanesChanged) {
    await writeJson(LANES_FILE, lanes);
    console.log(`Wrote ${lanes.length} lanes to ${path.relative(process.cwd(), LANES_FILE)}.`);
  }

  if (!workflowChanged && !lanesChanged) {
    console.log('All boards already have workflow states and a general lane. Nothing to do.');
  }
}

run().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
