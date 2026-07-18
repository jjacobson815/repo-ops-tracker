'use strict';

const path = require('path');
const express = require('express');
const db = require('./lib/db');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Resolve data directory (absolute). Defaults to ./data relative to cwd.
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const PORT = process.env.PORT || 8787;

// ---------- helpers ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function nowIso() {
  return new Date().toISOString();
}

function defaultWorkflow() {
  return [
    { id: 'backlog', label: 'backlog', accent: '#8891A5', isComplete: false, boardId: 'default', sortOrder: 0 },
    { id: 'cloning', label: 'cloning', accent: '#4FD1C5', isComplete: false, boardId: 'default', sortOrder: 1 },
    { id: 'agent-docs', label: 'agent-docs', accent: '#F5A623', isComplete: false, boardId: 'default', sortOrder: 2 },
    { id: 'build-touch', label: 'build-touch', accent: '#9B8FE0', isComplete: false, boardId: 'default', sortOrder: 3 },
    { id: 'done', label: 'done', accent: '#4ADE80', isComplete: true, boardId: 'default', sortOrder: 4 }
  ];
}

function validWorkflow(workflow) {
  if (!Array.isArray(workflow) || workflow.length === 0) return false;
  const ids = new Set();
  return workflow.every(state => {
    if (!state || typeof state !== 'object') return false;
    if (typeof state.id !== 'string' || !/^[a-z0-9-]+$/.test(state.id) || ids.has(state.id)) return false;
    ids.add(state.id);
    return typeof state.label === 'string' && state.label.trim().length > 0 && state.label.trim().length <= 40
      && typeof state.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(state.accent)
      && typeof state.isComplete === 'boolean'
      && typeof state.boardId === 'string' && /^[a-z0-9-]+$/.test(state.boardId)
      && typeof state.sortOrder === 'number';
  });
}

function defaultBoards() {
  return [{
    id: 'default',
    title: 'Default board',
    description: 'The default board',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    isDefault: true
  }];
}

function validBoard(board) {
  return board && typeof board === 'object'
    && typeof board.id === 'string' && /^[a-z0-9-]+$/.test(board.id)
    && typeof board.title === 'string' && board.title.trim().length > 0
    && typeof board.description === 'string'
    && typeof board.createdAt === 'string'
    && typeof board.updatedAt === 'string'
    && typeof board.isDefault === 'boolean';
}

function validBoards(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ids = new Set();
  return arr.every(board => {
    if (!validBoard(board) || ids.has(board.id)) return false;
    ids.add(board.id);
    return true;
  });
}

function defaultLanes() {
  return [
    { id: 'general', boardId: 'default', label: 'general', accent: '#4FD1C5', sortOrder: 0 }
  ];
}

function validLane(lane) {
  if (!lane || typeof lane !== 'object') return false;
  if (typeof lane.id !== 'string' || !/^[a-z0-9-]+$/.test(lane.id)) return false;
  if (typeof lane.label !== 'string' || lane.label.trim().length === 0 || lane.label.trim().length > 40) return false;
  if (typeof lane.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(lane.accent)) return false;
  if (typeof lane.boardId !== 'string' || !/^[a-z0-9-]+$/.test(lane.boardId)) return false;
  if (typeof lane.sortOrder !== 'number') return false;
  return true;
}

function validLanes(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ids = new Set();
  return arr.every(lane => {
    if (!validLane(lane)) return false;
    if (ids.has(lane.id)) return false;
    ids.add(lane.id);
    return true;
  });
}

function validHexColor(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function validImportWorkflow(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((s) =>
    s && typeof s === 'object'
    && typeof s.label === 'string' && s.label.trim().length > 0 && s.label.trim().length <= 40
    && validHexColor(s.accent)
    && typeof s.isComplete === 'boolean'
  );
}

function validImportLanes(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((l) =>
    l && typeof l === 'object'
    && typeof l.label === 'string' && l.label.trim().length > 0 && l.label.trim().length <= 40
    && validHexColor(l.accent)
  );
}

function validImportTasks(arr, workflowLen, lanesLen) {
  return Array.isArray(arr) && arr.every((t) =>
    t && typeof t === 'object'
    && typeof t.title === 'string' && t.title.trim().length > 0
    && Number.isInteger(t.columnIndex) && t.columnIndex >= 0 && t.columnIndex < workflowLen
    && Number.isInteger(t.laneIndex) && t.laneIndex >= 0 && t.laneIndex < lanesLen
    && (t.tags === undefined || (Array.isArray(t.tags) && t.tags.every((x) => typeof x === 'string')))
  );
}

function validBoards(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const ids = new Set();
  return arr.every(board => {
    if (!validBoard(board) || ids.has(board.id)) return false;
    ids.add(board.id);
    return true;
  });
}

// Mirror the seedLibrary() logic from the original index.html.
function seedLibrary() {
  return [
    {
      id: uid(), category: 'Docs Generation', title: 'New Repo — Dev Docs Bootstrap',
      body: 'You just cloned this repo fresh. Before touching any code:\n1. Map the directory structure and identify the entry point(s).\n2. Identify the package manager, build tool, and test runner in use.\n3. List install/build/test/run commands verbatim as found in config files.\n4. Summarize the architecture in plain terms (layers, major modules, data flow).\n5. Flag anything unusual: custom build steps, monorepo quirks, required env vars.\nOutput as a single ARCHITECTURE.md with those sections.',
      createdAt: nowIso(), updatedAt: nowIso()
    },
    {
      id: uid(), category: 'Orientation', title: 'Codebase Orientation — Quick Feel',
      body: 'Give me a fast orientation pass on this codebase:\n- What does this project do, in 2-3 sentences?\n- What are the 5 most important files/modules and why?\n- How is state/data managed?\n- What would a new contributor need to know before their first PR?\nKeep it skimmable, no fluff.',
      createdAt: nowIso(), updatedAt: nowIso()
    },
    {
      id: uid(), category: 'Build / Test', title: 'Pre-Build Sanity Check',
      body: 'Before making any changes, verify the project actually builds and tests pass on a clean checkout:\n1. Run the install step and report any failures verbatim.\n2. Run the build step and report status.\n3. Run the test suite and report pass/fail counts.\n4. If anything fails, do not attempt fixes yet — just report the exact error output.',
      createdAt: nowIso(), updatedAt: nowIso()
    }
  ];
}

async function ensureSeeded() {
  const existingBoards = await db.getAllBoards();
  if (existingBoards.length > 0) return;

  const boards = defaultBoards();
  const workflows = defaultWorkflow();
  const lanes = defaultLanes();
  const library = seedLibrary();

  await db.saveAllBoards(boards);
  await db.saveAllWorkflows(workflows);
  await db.saveAllLanes(lanes);
  await db.saveAllLibraryEntries(library);

  console.log(`Seeded SQLite database with default board, workflow, lanes, and prompts.`);
}

// ---------- routes ----------
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await db.getAllTasks();
    res.json(tasks);
  } catch (err) {
    console.error('GET /api/tasks failed:', err.message);
    res.status(500).json({ error: 'Failed to read tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const incoming = req.body;
    const tasks = Array.isArray(incoming) ? incoming : [];
    await db.saveAllTasks(tasks);
    res.status(200).json({ ok: true, count: tasks.length });
  } catch (err) {
    console.error('POST /api/tasks failed:', err.message);
    res.status(500).json({ error: 'Failed to write tasks' });
  }
});

app.get('/api/library', async (req, res) => {
  try {
    const library = await db.getAllLibraryEntries();
    res.json(library);
  } catch (err) {
    console.error('GET /api/library failed:', err.message);
    res.status(500).json({ error: 'Failed to read library' });
  }
});

app.post('/api/library', async (req, res) => {
  try {
    const incoming = req.body;
    const library = Array.isArray(incoming) ? incoming : [];
    await db.saveAllLibraryEntries(library);
    res.status(200).json({ ok: true, count: library.length });
  } catch (err) {
    console.error('POST /api/library failed:', err.message);
    res.status(500).json({ error: 'Failed to write library' });
  }
});

app.get('/api/tasks/:taskId/library', async (req, res) => {
  try {
    const entries = await db.getLibraryEntriesForTask(req.params.taskId);
    res.json(entries);
  } catch (err) {
    console.error('GET /api/tasks/:taskId/library failed:', err.message);
    res.status(500).json({ error: 'Failed to read task library links' });
  }
});

app.get('/api/workflow', async (req, res) => {
  try {
    res.json(await db.getAllWorkflows());
  } catch (err) {
    console.error('GET /api/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to read workflow' });
  }
});

app.post('/api/workflow', async (req, res) => {
  try {
    if (!validWorkflow(req.body)) {
      return res.status(400).json({ error: 'Workflow must contain one or more valid, uniquely identified states' });
    }
    await db.saveAllWorkflows(req.body);
    res.status(200).json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('POST /api/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to write workflow' });
  }
});

app.get('/api/boards', async (req, res) => {
  try {
    res.json(await db.getAllBoards());
  } catch (err) {
    console.error('GET /api/boards failed:', err.message);
    res.status(500).json({ error: 'Failed to read boards' });
  }
});

app.get('/api/boards/:boardId', async (req, res) => {
  try {
    const board = await db.getBoardById(req.params.boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    console.error('GET /api/boards/:boardId failed:', err.message);
    res.status(500).json({ error: 'Failed to read board' });
  }
});

app.post('/api/boards', async (req, res) => {
  try {
    if (!validBoards(req.body)) {
      return res.status(400).json({ error: 'Boards must contain one or more valid, uniquely identified entries' });
    }
    await db.saveAllBoards(req.body);
    res.status(200).json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('POST /api/boards failed:', err.message);
    res.status(500).json({ error: 'Failed to write boards' });
  }
});

app.post('/api/boards/import', async (req, res) => {
  try {
    const body = req.body || {};
    const boardIn = body.board;
    const workflowIn = body.workflow;
    const lanesIn = body.lanes;
    const tasksIn = Array.isArray(body.tasks) ? body.tasks : [];

    if (!boardIn || typeof boardIn.title !== 'string'
        || boardIn.title.trim().length === 0 || boardIn.title.trim().length > 200) {
      return res.status(400).json({ error: 'board.title is required (1-200 chars)' });
    }
    if (!validImportWorkflow(workflowIn)) {
      return res.status(400).json({ error: 'workflow must be a non-empty array of {label, accent, isComplete}' });
    }
    if (!validImportLanes(lanesIn)) {
      return res.status(400).json({ error: 'lanes must be a non-empty array of {label, accent}' });
    }
    if (!validImportTasks(tasksIn, workflowIn.length, lanesIn.length)) {
      return res.status(400).json({ error: 'a task is invalid or has an out-of-range columnIndex/laneIndex' });
    }

    const boardId = uid();
    const timestamp = nowIso();

    const board = {
      id: boardId,
      title: boardIn.title.trim(),
      description: typeof boardIn.description === 'string' ? boardIn.description : '',
      createdAt: timestamp,
      updatedAt: timestamp,
      isDefault: false
    };

    const workflow = workflowIn.map((s, i) => ({
      id: uid(), label: s.label.trim(), accent: s.accent, isComplete: s.isComplete,
      boardId, sortOrder: i
    }));

    const lanes = lanesIn.map((l, i) => ({
      id: uid(), boardId, label: l.label.trim(), accent: l.accent, sortOrder: i
    }));

    const tasks = tasksIn.map((t) => ({
      id: uid(),
      title: t.title.trim(),
      repoName: typeof t.repoName === 'string' ? t.repoName : '',
      repoUrl: typeof t.repoUrl === 'string' ? t.repoUrl : '',
      agent: typeof t.agent === 'string' ? t.agent : '',
      agentCustom: typeof t.agentCustom === 'string' ? t.agentCustom : '',
      column: workflow[t.columnIndex].id,
      laneId: lanes[t.laneIndex].id,
      boardId,
      tags: Array.isArray(t.tags) ? t.tags : [],
      notes: typeof t.notes === 'string' ? t.notes : '',
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : timestamp,
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : timestamp
    }));

    if (!validBoard(board) || !validWorkflow(workflow) || !validLanes(lanes)) {
      return res.status(500).json({ error: 'internal board construction error' });
    }

    await db.createBoardBundle({ board, workflow, lanes, tasks });
    res.status(201).json({ ok: true, boardId });
  } catch (err) {
    console.error('POST /api/boards/import failed:', err.message);
    res.status(500).json({ error: 'Failed to import board' });
  }
});

app.put('/api/boards/:boardId', async (req, res) => {
  try {
    const existing = await db.getBoardById(req.params.boardId);
    if (!existing) {
      return res.status(404).json({ error: 'Board not found' });
    }
    const updated = { ...existing, ...req.body, id: req.params.boardId, updatedAt: nowIso() };
    if (!validBoard(updated)) {
      return res.status(400).json({ error: 'Invalid board update' });
    }
    const board = await db.updateBoard(req.params.boardId, updated);
    res.status(200).json({ ok: true, board });
  } catch (err) {
    console.error('PUT /api/boards/:boardId failed:', err.message);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

app.delete('/api/boards/:boardId', async (req, res) => {
  try {
    const existing = await db.getBoardById(req.params.boardId);
    if (!existing) {
      return res.status(404).json({ error: 'Board not found' });
    }
    const boards = await db.getAllBoards();
    const remaining = boards.filter(b => b.id !== req.params.boardId);
    if (remaining.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last remaining board' });
    }
    await db.deleteBoardCascade(req.params.boardId);
    res.status(200).json({ ok: true, boards: remaining });
  } catch (err) {
    console.error('DELETE /api/boards/:boardId failed:', err.message);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

app.get('/api/boards/:boardId/tasks', async (req, res) => {
  try {
    const tasks = await db.getTasksByBoard(req.params.boardId);
    res.json(tasks);
  } catch (err) {
    console.error('GET /api/boards/:boardId/tasks failed:', err.message);
    res.status(500).json({ error: 'Failed to read tasks' });
  }
});

app.post('/api/boards/:boardId/tasks', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : [];
    await db.saveTasksForBoard(req.params.boardId, incoming);
    res.status(200).json({ ok: true, count: incoming.length });
  } catch (err) {
    console.error('POST /api/boards/:boardId/tasks failed:', err.message);
    res.status(500).json({ error: 'Failed to write tasks' });
  }
});

app.get('/api/boards/:boardId/lanes', async (req, res) => {
  try {
    const lanes = await db.getLanesByBoard(req.params.boardId);
    res.json(lanes);
  } catch (err) {
    console.error('GET /api/boards/:boardId/lanes failed:', err.message);
    res.status(500).json({ error: 'Failed to read lanes' });
  }
});

app.post('/api/boards/:boardId/lanes', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : [];
    await db.saveLanesForBoard(req.params.boardId, incoming);
    res.status(200).json({ ok: true, count: incoming.length });
  } catch (err) {
    console.error('POST /api/boards/:boardId/lanes failed:', err.message);
    res.status(500).json({ error: 'Failed to write lanes' });
  }
});

app.delete('/api/boards/:boardId/lanes/:laneId', async (req, res) => {
  try {
    const boardLanes = await db.getLanesByBoard(req.params.boardId);
    const remaining = boardLanes.filter(l => l.id !== req.params.laneId);
    if (remaining.length === boardLanes.length) {
      return res.status(404).json({ error: 'Lane not found' });
    }
    if (remaining.length === 0) {
      return res.status(400).json({ error: 'Cannot delete last lane' });
    }
    const tasks = await db.getTasksByBoard(req.params.boardId);
    const affected = tasks.filter(t => t.laneId === req.params.laneId);
    const replacementLaneId = req.body?.replacementLaneId;
    if (affected.length > 0 && !remaining.some(l => l.id === replacementLaneId)) {
      return res.status(400).json({ error: 'A valid replacement lane is required' });
    }
    const updatedTasks = affected.length > 0
      ? tasks.map(t => t.laneId === req.params.laneId
          ? { ...t, laneId: replacementLaneId, updatedAt: nowIso() }
          : t)
      : tasks;
    await Promise.all([
      db.saveTasksForBoard(req.params.boardId, updatedTasks),
      db.saveLanesForBoard(req.params.boardId, remaining)
    ]);
    res.status(200).json({ ok: true, lanes: remaining });
  } catch (err) {
    console.error('DELETE /api/boards/:boardId/lanes/:laneId failed:', err.message);
    res.status(500).json({ error: 'Failed to delete lane' });
  }
});

app.get('/api/boards/:boardId/workflow', async (req, res) => {
  try {
    const workflow = await db.getWorkflowByBoard(req.params.boardId);
    res.json(workflow);
  } catch (err) {
    console.error('GET /api/boards/:boardId/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to read workflow' });
  }
});

app.post('/api/boards/:boardId/workflow', async (req, res) => {
  try {
    const incoming = Array.isArray(req.body) ? req.body : [];
    await db.saveWorkflowForBoard(req.params.boardId, incoming);
    res.status(200).json({ ok: true, count: incoming.length });
  } catch (err) {
    console.error('POST /api/boards/:boardId/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to write workflow' });
  }
});

app.post('/api/boards/:boardId/workflow/delete', async (req, res) => {
  try {
    const { stateId, replacementStateId } = req.body || {};
    const workflow = await db.getWorkflowByBoard(req.params.boardId);
    const stateExists = workflow.some(state => state.id === stateId);
    const nextWorkflow = workflow.filter(state => state.id !== stateId);
    if (!stateExists || nextWorkflow.length === 0) {
      return res.status(400).json({ error: 'Cannot delete this workflow state' });
    }

    const tasks = await db.getTasksByBoard(req.params.boardId);
    const affectedTasks = tasks.filter(task => task.column === stateId);
    if (affectedTasks.length > 0 && !nextWorkflow.some(state => state.id === replacementStateId)) {
      return res.status(400).json({ error: 'A valid replacement state is required' });
    }

    const updatedTasks = affectedTasks.length
      ? tasks.map(task => task.column === stateId
          ? { ...task, column: replacementStateId, updatedAt: nowIso() }
          : task)
      : tasks;
    if (affectedTasks.length > 0) {
      await db.saveTasksForBoard(req.params.boardId, updatedTasks);
    }

    await db.saveWorkflowForBoard(req.params.boardId, nextWorkflow);
    res.status(200).json({ ok: true, reassigned: affectedTasks.length, workflow: nextWorkflow });
  } catch (err) {
    console.error('POST /api/boards/:boardId/workflow/delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete workflow state' });
  }
});

app.post('/api/workflow/delete', async (req, res) => {
  try {
    const { stateId, replacementStateId } = req.body || {};
    const workflow = await db.getAllWorkflows();
    const stateExists = workflow.some(state => state.id === stateId);
    const nextWorkflow = workflow.filter(state => state.id !== stateId);
    if (!stateExists || nextWorkflow.length === 0) {
      return res.status(400).json({ error: 'Cannot delete this workflow state' });
    }

    const tasks = await db.getAllTasks();
    const affectedTasks = tasks.filter(task => task.column === stateId);
    if (affectedTasks.length > 0 && !nextWorkflow.some(state => state.id === replacementStateId)) {
      return res.status(400).json({ error: 'A valid replacement state is required' });
    }

    const updatedTasks = affectedTasks.length
      ? tasks.map(task => task.column === stateId ? { ...task, column: replacementStateId, updatedAt: nowIso() } : task)
      : tasks;
    if (affectedTasks.length > 0) await db.saveAllTasks(updatedTasks);
    await db.saveAllWorkflows(nextWorkflow);
    res.status(200).json({ ok: true, reassigned: affectedTasks.length, workflow: nextWorkflow });
  } catch (err) {
    console.error('POST /api/workflow/delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete workflow state' });
  }
});

// ---------- lanes routes ----------

app.get('/api/lanes', async (req, res) => {
  try {
    res.json(await db.getAllLanes());
  } catch (err) {
    console.error('GET /api/lanes failed:', err.message);
    res.status(500).json({ error: 'Failed to read lanes' });
  }
});

app.post('/api/lanes', async (req, res) => {
  try {
    if (!validLanes(req.body)) {
      return res.status(400).json({ error: 'Lanes must contain one or more valid, uniquely identified entries' });
    }
    await db.saveAllLanes(req.body);
    res.status(200).json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('POST /api/lanes failed:', err.message);
    res.status(500).json({ error: 'Failed to write lanes' });
  }
});

app.post('/api/lanes/delete', async (req, res) => {
  try {
    const { laneId, replacementLaneId } = req.body || {};

    const lanes = await db.getAllLanes();
    const laneExists = lanes.some(l => l.id === laneId);
    const nextLanes = lanes.filter(l => l.id !== laneId);

    if (!laneExists || nextLanes.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last remaining lane' });
    }

    const tasks = await db.getAllTasks();
    const affectedTasks = tasks.filter(t => t.laneId === laneId);

    if (affectedTasks.length > 0 && !nextLanes.some(l => l.id === replacementLaneId)) {
      return res.status(400).json({ error: 'A valid replacement lane is required when the lane contains cards' });
    }

    const updatedTasks = affectedTasks.length
      ? tasks.map(t => t.laneId === laneId ? { ...t, laneId: replacementLaneId, updatedAt: nowIso() } : t)
      : tasks;

    if (affectedTasks.length > 0) await db.saveAllTasks(updatedTasks);
    await db.saveAllLanes(nextLanes);

    res.status(200).json({ ok: true, reassigned: affectedTasks.length, lanes: nextLanes });
  } catch (err) {
    console.error('POST /api/lanes/delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete lane' });
  }
});

// Serve static frontend (public/) — created in a later phase.
app.use(express.static(path.join(__dirname, 'public')));

// ---------- boot ----------
async function start() {
  await ensureSeeded();
  app.listen(PORT, () => {
    console.log(`repo-ops-tracker server listening on http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
