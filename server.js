'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Resolve data directory (absolute). Defaults to ./data relative to cwd.
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const WORKFLOW_FILE = path.join(DATA_DIR, 'workflow.json');
const LANES_FILE = path.join(DATA_DIR, 'lanes.json');

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
    { id: 'backlog', label: 'backlog', accent: '#8891A5', isComplete: false },
    { id: 'cloning', label: 'cloning', accent: '#4FD1C5', isComplete: false },
    { id: 'agent-docs', label: 'agent-docs', accent: '#F5A623', isComplete: false },
    { id: 'build-touch', label: 'build-touch', accent: '#9B8FE0', isComplete: false },
    { id: 'done', label: 'done', accent: '#4ADE80', isComplete: true }
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
      && typeof state.isComplete === 'boolean';
  });
}

function defaultLanes() {
  return [
    { id: 'general', label: 'general', accent: '#4FD1C5' }
  ];
}

function validLane(lane) {
  if (!lane || typeof lane !== 'object') return false;
  if (typeof lane.id !== 'string' || !/^[a-z0-9-]+$/.test(lane.id)) return false;
  if (typeof lane.label !== 'string' || lane.label.trim().length === 0 || lane.label.trim().length > 40) return false;
  if (typeof lane.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(lane.accent)) return false;
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

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

// Read a JSON collection. Returns [] on missing/empty/invalid file.
async function readCollection(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    if (!raw || !raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error(`Failed to read ${file}:`, err.message);
    return [];
  }
}

// Write a JSON collection (whole-array replace).
async function writeCollection(file, arr) {
  const data = JSON.stringify(arr, null, 2);
  await fsp.writeFile(file, data, 'utf8');
}

// Seed library.json if missing or empty.
async function ensureSeeded() {
  const existing = await readCollection(LIBRARY_FILE);
  if (existing.length === 0) {
    const seeded = seedLibrary();
    await writeCollection(LIBRARY_FILE, seeded);
    console.log(`Seeded ${LIBRARY_FILE} with ${seeded.length} default prompts.`);
  }
}

async function ensureWorkflow() {
  const existing = await readCollection(WORKFLOW_FILE);
  if (!validWorkflow(existing)) {
    await writeCollection(WORKFLOW_FILE, defaultWorkflow());
    console.log(`Seeded ${WORKFLOW_FILE} with default workflow states.`);
  }
}

async function ensureLanes() {
  const existing = await readCollection(LANES_FILE);
  if (!validLanes(existing)) {
    await writeCollection(LANES_FILE, defaultLanes());
    console.log(`Seeded ${LANES_FILE} with default lane.`);
  }
}

// ---------- routes ----------
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await readCollection(TASKS_FILE);
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
    await writeCollection(TASKS_FILE, tasks);
    res.status(200).json({ ok: true, count: tasks.length });
  } catch (err) {
    console.error('POST /api/tasks failed:', err.message);
    res.status(500).json({ error: 'Failed to write tasks' });
  }
});

app.get('/api/library', async (req, res) => {
  try {
    const library = await readCollection(LIBRARY_FILE);
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
    await writeCollection(LIBRARY_FILE, library);
    res.status(200).json({ ok: true, count: library.length });
  } catch (err) {
    console.error('POST /api/library failed:', err.message);
    res.status(500).json({ error: 'Failed to write library' });
  }
});

app.get('/api/workflow', async (req, res) => {
  try {
    res.json(await readCollection(WORKFLOW_FILE));
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
    await writeCollection(WORKFLOW_FILE, req.body);
    res.status(200).json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('POST /api/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to write workflow' });
  }
});

app.post('/api/workflow/delete', async (req, res) => {
  try {
    const { stateId, replacementStateId } = req.body || {};
    const workflow = await readCollection(WORKFLOW_FILE);
    const stateExists = workflow.some(state => state.id === stateId);
    const nextWorkflow = workflow.filter(state => state.id !== stateId);
    if (!stateExists || nextWorkflow.length === 0) {
      return res.status(400).json({ error: 'Cannot delete this workflow state' });
    }

    const tasks = await readCollection(TASKS_FILE);
    const affectedTasks = tasks.filter(task => task.column === stateId);
    if (affectedTasks.length > 0 && !nextWorkflow.some(state => state.id === replacementStateId)) {
      return res.status(400).json({ error: 'A valid replacement state is required' });
    }

    const updatedTasks = affectedTasks.length
      ? tasks.map(task => task.column === stateId ? { ...task, column: replacementStateId, updatedAt: nowIso() } : task)
      : tasks;
    if (affectedTasks.length > 0) await writeCollection(TASKS_FILE, updatedTasks);
    await writeCollection(WORKFLOW_FILE, nextWorkflow);
    res.status(200).json({ ok: true, reassigned: affectedTasks.length, workflow: nextWorkflow });
  } catch (err) {
    console.error('POST /api/workflow/delete failed:', err.message);
    res.status(500).json({ error: 'Failed to delete workflow state' });
  }
});

// ---------- lanes routes ----------

app.get('/api/lanes', async (req, res) => {
  try {
    res.json(await readCollection(LANES_FILE));
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
    await writeCollection(LANES_FILE, req.body);
    res.status(200).json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('POST /api/lanes failed:', err.message);
    res.status(500).json({ error: 'Failed to write lanes' });
  }
});

app.post('/api/lanes/delete', async (req, res) => {
  try {
    const { laneId, replacementLaneId } = req.body || {};

    const lanes = await readCollection(LANES_FILE);
    const laneExists = lanes.some(l => l.id === laneId);
    const nextLanes = lanes.filter(l => l.id !== laneId);

    // Refuse to delete the last remaining lane
    if (!laneExists || nextLanes.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last remaining lane' });
    }

    const tasks = await readCollection(TASKS_FILE);
    const affectedTasks = tasks.filter(t => t.laneId === laneId);

    // If lane has cards a valid replacement is required
    if (affectedTasks.length > 0 && !nextLanes.some(l => l.id === replacementLaneId)) {
      return res.status(400).json({ error: 'A valid replacement lane is required when the lane contains cards' });
    }

    // Reassign tasks and persist both files
    const updatedTasks = affectedTasks.length
      ? tasks.map(t => t.laneId === laneId ? { ...t, laneId: replacementLaneId, updatedAt: nowIso() } : t)
      : tasks;

    if (affectedTasks.length > 0) await writeCollection(TASKS_FILE, updatedTasks);
    await writeCollection(LANES_FILE, nextLanes);

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
  await ensureDataDir();
  await ensureSeeded();
  await ensureWorkflow();
  await ensureLanes();
  app.listen(PORT, () => {
    console.log(`repo-ops-tracker server listening on http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
