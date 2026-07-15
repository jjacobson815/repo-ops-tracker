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

const PORT = process.env.PORT || 8787;

// ---------- helpers ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function nowIso() {
  return new Date().toISOString();
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

// Default workflow states mirror the kanban COLUMNS defined in public/js/app.js
// (ids MUST match the `column` values used by existing tasks so they keep
// working). The final "done" column is flagged isComplete: true.
function seedWorkflow() {
  return [
    { id: 'backlog',     name: 'backlog',     color: '#8891A5', isComplete: false },
    { id: 'cloning',     name: 'cloning',     color: '#4FD1C5', isComplete: false },
    { id: 'agent-docs',  name: 'agent-docs',  color: '#F5A623', isComplete: false },
    { id: 'build-touch', name: 'build-touch', color: '#9B8FE0', isComplete: false },
    { id: 'done',        name: 'done',        color: '#4ADE80', isComplete: true }
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

// Seed library.json and workflow.json if missing or empty.
async function ensureSeeded() {
  const existingLib = await readCollection(LIBRARY_FILE);
  if (existingLib.length === 0) {
    const seeded = seedLibrary();
    await writeCollection(LIBRARY_FILE, seeded);
    console.log(`Seeded ${LIBRARY_FILE} with ${seeded.length} default prompts.`);
  }
  const existingWf = await readCollection(WORKFLOW_FILE);
  if (existingWf.length === 0) {
    const seeded = seedWorkflow();
    await writeCollection(WORKFLOW_FILE, seeded);
    console.log(`Seeded ${WORKFLOW_FILE} with ${seeded.length} default workflow states.`);
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

// ---------- workflow routes ----------
app.get('/api/workflow', async (req, res) => {
  try {
    const workflow = await readCollection(WORKFLOW_FILE);
    res.json(workflow);
  } catch (err) {
    console.error('GET /api/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to read workflow' });
  }
});

app.post('/api/workflow', async (req, res) => {
  try {
    const incoming = req.body;
    const workflow = Array.isArray(incoming) ? incoming : [];
    // Validate each entry has the required fields (id, name, color, isComplete).
    const valid = workflow.every(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.color === 'string' &&
        typeof s.isComplete === 'boolean'
    );
    if (!valid) {
      return res.status(400).json({
        error:
          'Each workflow state must have id (string), name (string), color (string), and isComplete (boolean)'
      });
    }
    await writeCollection(WORKFLOW_FILE, workflow);
    res.status(200).json(workflow);
  } catch (err) {
    console.error('POST /api/workflow failed:', err.message);
    res.status(500).json({ error: 'Failed to write workflow' });
  }
});

app.delete('/api/workflow/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const workflow = await readCollection(WORKFLOW_FILE);
    const stateIndex = workflow.findIndex((s) => s.id === id);
    if (stateIndex === -1) {
      return res.status(404).json({ error: `Workflow state '${id}' not found` });
    }

    // Find tasks referencing this state.
    const tasks = await readCollection(TASKS_FILE);
    const affected = tasks.filter((t) => t && t.column === id);

    if (affected.length > 0) {
      // Require a destination state to reassign affected tasks to.
      const destination = req.body && req.body.destination;
      if (!destination || typeof destination !== 'string') {
        return res.status(400).json({
          error: `Cannot delete workflow state '${id}': ${affected.length} task(s) reference it. Provide a 'destination' state id in the request body.`
        });
      }
      const destExists = workflow.some((s) => s.id === destination);
      if (!destExists) {
        return res.status(400).json({
          error: `Destination workflow state '${destination}' does not exist`
        });
      }
      // Reassign affected tasks to the destination state and persist.
      const reassigned = tasks.map((t) =>
        t && t.column === id ? { ...t, column: destination, updatedAt: nowIso() } : t
      );
      await writeCollection(TASKS_FILE, reassigned);
    }

    // Delete the state and persist the workflow.
    workflow.splice(stateIndex, 1);
    await writeCollection(WORKFLOW_FILE, workflow);
    res.status(200).json({ ok: true, workflow });
  } catch (err) {
    console.error('DELETE /api/workflow/:id failed:', err.message);
    res.status(500).json({ error: 'Failed to delete workflow state' });
  }
});

// Serve static frontend (public/) — created in a later phase.
app.use(express.static(path.join(__dirname, 'public')));

// ---------- boot ----------
async function start() {
  await ensureDataDir();
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
