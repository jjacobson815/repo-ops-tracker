// api.js — REST client for the repo-ops-tracker backend (Phase C1)
// Native ES module. No build step, no npm deps in the browser.
// Wraps fetch() calls to the Express server's JSON endpoints.
//
// Contract (from agent_build_instructions.md):
//   GET  /api/tasks    -> JSON array of tasks
//   POST /api/tasks    -> body is the ENTIRE tasks array; 200 OK on write
//   GET  /api/library  -> JSON array of library entries
//   POST /api/library  -> body is the ENTIRE library array; 200 OK on write
//   GET  /api/workflow -> JSON array of workflow states
//   POST /api/workflow -> body is the ENTIRE workflow array; 200 OK on write
//   GET  /api/lanes    -> JSON array of lanes
//   POST /api/lanes    -> body is the ENTIRE lanes array; 200 OK on write
//   POST /api/lanes/delete -> { laneId, replacementLaneId } -> safe delete

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

export async function getLibraryForTask(taskId) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/library`);
  return res.json();
}

export async function getWorkflow(boardId) {
  const res = await fetch(`/api/boards/${boardId}/workflow`);
  return res.json();
}

export async function saveWorkflow(boardId, workflow) {
  return fetch(`/api/boards/${boardId}/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
}

export async function deleteWorkflowState(boardId, stateId, replacementStateId) {
  return fetch(`/api/boards/${boardId}/workflow/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stateId, replacementStateId })
  });
}

export async function getBoards() {
  const res = await fetch('/api/boards');
  return res.json();
}

export async function getBoard(boardId) {
  const res = await fetch(`/api/boards/${boardId}`);
  return res.json();
}

export async function saveBoards(boards) {
  return fetch('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(boards)
  });
}

export async function updateBoard(boardId, board) {
  return fetch(`/api/boards/${boardId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(board)
  });
}

export async function deleteBoard(boardId) {
  return fetch(`/api/boards/${boardId}`, {
    method: 'DELETE'
  });
}

export async function getBoardTasks(boardId) {
  const res = await fetch(`/api/boards/${boardId}/tasks`);
  return res.json();
}

export async function saveBoardTasks(boardId, tasks) {
  return fetch(`/api/boards/${boardId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks)
  });
}

export async function getBoardLanes(boardId) {
  const res = await fetch(`/api/boards/${boardId}/lanes`);
  return res.json();
}

export async function saveBoardLanes(boardId, lanes) {
  return fetch(`/api/boards/${boardId}/lanes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lanes)
  });
}

export async function deleteBoardLane(boardId, laneId, replacementLaneId) {
  return fetch(`/api/boards/${boardId}/lanes/${laneId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replacementLaneId })
  });
}

export async function getBoardWorkflow(boardId) {
  const res = await fetch(`/api/boards/${boardId}/workflow`);
  return res.json();
}

export async function saveBoardWorkflow(boardId, workflow) {
  return fetch(`/api/boards/${boardId}/workflow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workflow)
  });
}

export async function deleteBoardWorkflowState(boardId, stateId, replacementStateId) {
  return fetch(`/api/boards/${boardId}/workflow/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stateId, replacementStateId })
  });
}

export async function getLanes() {
  const res = await fetch('/api/lanes');
  return res.json();
}

export async function saveLanes(lanes) {
  return fetch('/api/lanes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lanes)
  });
}

export async function deleteLane(laneId, replacementLaneId) {
  return fetch('/api/lanes/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ laneId, replacementLaneId })
  });
}
