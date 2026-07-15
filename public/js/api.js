// api.js — REST client for the repo-ops-tracker backend (Phase C1)
// Native ES module. No build step, no npm deps in the browser.
// Wraps fetch() calls to the Express server's JSON endpoints.
//
// Contract (from agent_build_instructions.md):
//   GET  /api/tasks    -> JSON array of tasks
//   POST /api/tasks    -> body is the ENTIRE tasks array; 200 OK on write
//   GET  /api/library  -> JSON array of library entries
//   POST /api/library  -> body is the ENTIRE library array; 200 OK on write

export async function getTasks() {
  const res = await fetch('/api/tasks');
  return res.json();
}

export async function saveTasks(tasks) {
  return fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks)
  });
}

export async function getLibrary() {
  const res = await fetch('/api/library');
  return res.json();
}

export async function saveLibrary(library) {
  return fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(library)
  });
}

// ---------- workflow routes ----------
export async function getWorkflow() {
  const res = await fetch('/api/workflow');
  return res.json();
}

// Whole-array replace. Send the full workflow array; persists and returns the
// saved array.
export async function saveWorkflow(workflow) {
  return fetch('/api/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
}

// Delete a single state. If the state still has cards, the backend requires a
// `destination` state id (sent as the request body) to reassign them to.
export async function deleteWorkflowState(id, destination) {
  const opts = {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  };
  if (destination) opts.body = JSON.stringify({ destination });
  return fetch(`/api/workflow/${encodeURIComponent(id)}`, opts);
}
