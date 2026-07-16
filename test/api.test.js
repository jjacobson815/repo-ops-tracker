'use strict';

/**
 * Self-contained API smoke test for repo-ops-tracker.
 *
 * Spawns `node server.js` as a child process on a test port with a temporary
 * DATA_DIR, exercises the REST API, asserts responses + on-disk persistence,
 * then kills the server and removes the temp dir. Uses only Node built-ins.
 *
 * Exit code 0 = all assertions passed, non-zero = at least one failed.
 */

const { spawn } = require('child_process');
const fsp = require('fs/promises');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_PORT = process.env.TEST_PORT || '8799';
const TEST_DATA_DIR = path.join(PROJECT_ROOT, '.test-data');
const BASE_URL = `http://localhost:${TEST_PORT}`;

// ---- tiny test harness ----
let passed = 0;
let failed = 0;

function record(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function getJson(pathname) {
  const res = await fetch(BASE_URL + pathname);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function postJson(pathname, payload) {
  const res = await fetch(BASE_URL + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE_URL + '/api/tasks');
      if (res.ok) return true;
    } catch (_) {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

// Kill the child and wait for it to fully exit before resolving. Waiting for
// the 'exit' event avoids a libuv "UV_HANDLE_CLOSING" assertion crash that can
// occur on Windows when process.exit() is called while the child handle is
// still being torn down.
function killChild(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
    // Safety: if the exit event never fires, don't hang forever.
    setTimeout(resolve, 3000);
  });
}

async function main() {
  // Prepare temp data dir (clean slate).
  await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await fsp.mkdir(TEST_DATA_DIR, { recursive: true });

  const child = spawn('node', ['server.js'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: TEST_PORT,
      DATA_DIR: TEST_DATA_DIR
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  child.stdout.on('data', (d) => (serverOutput += d.toString()));
  child.stderr.on('data', (d) => (serverOutput += d.toString()));

  const cleanup = async () => {
    await killChild(child);
    await fsp.rm(TEST_DATA_DIR, { recursive: true, force: true });
  };

  try {
    const ready = await waitForServer(15000);
    if (!ready) {
      record('server startup', false, 'server did not become ready within timeout');
      console.error('--- server output ---\n' + serverOutput);
      await cleanup();
      process.exitCode = 1;
      return;
    }
    record('server startup', true, `listening on ${BASE_URL}`);

    // a. GET /api/tasks -> 200, array, initially []
    {
      const { status, body } = await getJson('/api/tasks');
      const ok = status === 200 && Array.isArray(body) && body.length === 0;
      record('GET /api/tasks returns empty array', ok, `status=${status}, isArray=${Array.isArray(body)}, len=${Array.isArray(body) ? body.length : 'n/a'}`);
    }

    // b. GET /api/library -> 200, array length 3 (seeded)
    {
      const { status, body } = await getJson('/api/library');
      const ok = status === 200 && Array.isArray(body) && body.length === 3;
      record('GET /api/library returns 3 seeded prompts', ok, `status=${status}, len=${Array.isArray(body) ? body.length : 'n/a'}`);
    }

    // c. POST /api/tasks with full sample, then GET returns it
    const sampleTasks = [
      {
        id: 't1',
        title: 'Sample task',
        repoName: 'repo-ops-tracker',
        repoUrl: 'https://github.com/example/repo-ops-tracker',
        agent: 'claude',
        agentCustom: '',
        column: 'backlog',
        tags: ['test', 'smoke'],
        notes: 'created by api.test.js',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    {
      const post = await postJson('/api/tasks', sampleTasks);
      const get = await getJson('/api/tasks');
      const ok =
        post.status === 200 &&
        get.status === 200 &&
        Array.isArray(get.body) &&
        get.body.length === 1 &&
        get.body[0].id === 't1' &&
        get.body[0].title === 'Sample task';
      record('POST /api/tasks persists to memory', ok, `postStatus=${post.status}, getLen=${Array.isArray(get.body) ? get.body.length : 'n/a'}`);
    }

    // d. POST /api/library with sample, then GET returns it
    const sampleLibrary = [
      {
        id: 'l1',
        title: 'Custom prompt',
        category: 'Testing',
        body: 'This is a test prompt body.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    {
      const post = await postJson('/api/library', sampleLibrary);
      const get = await getJson('/api/library');
      const ok =
        post.status === 200 &&
        get.status === 200 &&
        Array.isArray(get.body) &&
        get.body.length === 1 &&
        get.body[0].id === 'l1' &&
        get.body[0].title === 'Custom prompt';
      record('POST /api/library persists to memory', ok, `postStatus=${post.status}, getLen=${Array.isArray(get.body) ? get.body.length : 'n/a'}`);
    }

    // e. Confirm files written to disk (non-empty / parseable) and SQLite DB created
    {
      const tasksPath = path.join(TEST_DATA_DIR, 'tasks.json');
      const libraryPath = path.join(TEST_DATA_DIR, 'library.json');
      const dbPath = path.join(TEST_DATA_DIR, 'dev.db');
      let ok = true;
      let detail = '';
      try {
        const tasksRaw = await fsp.readFile(tasksPath, 'utf8');
        const libraryRaw = await fsp.readFile(libraryPath, 'utf8');
        const tasksParsed = JSON.parse(tasksRaw);
        const libraryParsed = JSON.parse(libraryRaw);
        const tasksOk = tasksRaw.trim().length > 0 && Array.isArray(tasksParsed) && tasksParsed.length === 1;
        const libraryOk = libraryRaw.trim().length > 0 && Array.isArray(libraryParsed) && libraryParsed.length === 1;
        const dbStats = await fsp.stat(dbPath);
        ok = tasksOk && libraryOk && dbStats.isFile();
        detail = `tasks.json len=${tasksParsed.length}, library.json len=${libraryParsed.length}, db=${dbStats.size} bytes`;
      } catch (err) {
        ok = false;
        detail = 'read/parse error: ' + err.message;
      }
      record('SQLite database and data files written to disk', ok, detail);
    }

    // f. KI-01 regression: creating a 2nd board via POST /api/boards (bulk
    //    replace) must NOT wipe the default board's lanes / workflow states /
    //    tasks. Previously saveAllBoards did deleteMany()+createMany(), and the
    //    onDelete: Cascade relations wiped every board's children.
    {
      const beforeLanes = await getJson('/api/boards/default/lanes');
      const beforeWf = await getJson('/api/boards/default/workflow');
      const beforeTasks = await getJson('/api/boards/default/tasks');
      const laneCountBefore = Array.isArray(beforeLanes.body) ? beforeLanes.body.length : 0;
      const wfCountBefore = Array.isArray(beforeWf.body) ? beforeWf.body.length : 0;
      const taskCountBefore = Array.isArray(beforeTasks.body) ? beforeTasks.body.length : 0;

      const boardsRes = await getJson('/api/boards');
      const boards = Array.isArray(boardsRes.body) ? boardsRes.body : [];
      const newBoard = {
        id: 'ki01-b2',
        title: 'KI-01 board 2',
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDefault: false
      };
      const post = await postJson('/api/boards', [...boards, newBoard]);
      const afterBoards = await getJson('/api/boards');
      const afterLanes = await getJson('/api/boards/default/lanes');
      const afterWf = await getJson('/api/boards/default/workflow');
      const afterTasks = await getJson('/api/boards/default/tasks');

      const b2Present = Array.isArray(afterBoards.body) && afterBoards.body.some((b) => b.id === 'ki01-b2');
      const laneCountAfter = Array.isArray(afterLanes.body) ? afterLanes.body.length : 0;
      const wfCountAfter = Array.isArray(afterWf.body) ? afterWf.body.length : 0;
      const taskCountAfter = Array.isArray(afterTasks.body) ? afterTasks.body.length : 0;

      const ok =
        post.status === 200 &&
        b2Present &&
        laneCountAfter === laneCountBefore &&
        wfCountAfter === wfCountBefore &&
        taskCountAfter === taskCountBefore &&
        laneCountAfter > 0 &&
        wfCountAfter > 0;
      record('KI-01: creating 2nd board preserves default board lanes/workflow/tasks', ok,
        `postStatus=${post.status}, b2Present=${b2Present}, lanes=${laneCountBefore}->${laneCountAfter}, wf=${wfCountBefore}->${wfCountAfter}, tasks=${taskCountBefore}->${taskCountAfter}`);
    }

    // g. entry-task link regression: an unrelated library save must not drop
    //    existing entryId<->taskId links.
    {
      const entriesRes = await getJson('/api/library');
      const entries = Array.isArray(entriesRes.body) ? entriesRes.body : [];
      const tasksRes = await getJson('/api/boards/default/tasks');
      const tasks = Array.isArray(tasksRes.body) ? tasksRes.body : [];
      const target = entries[0];
      const taskId = tasks[0] && tasks[0].id;
      if (target && taskId) {
        target.taskIds = [taskId];
        await postJson('/api/library', entries);
        // unrelated save: bump an unrelated entry's title, re-POST full array
        const rereadRes = await getJson('/api/library');
        const reread = Array.isArray(rereadRes.body) ? rereadRes.body : [];
        if (reread[1]) reread[1].title = reread[1].title + ' (touched)';
        await postJson('/api/library', reread);
        const finalRes = await getJson('/api/library');
        const final = Array.isArray(finalRes.body) ? finalRes.body : [];
        const finalTarget = final.find(e => e.id === target.id);
        const ok = finalTarget && Array.isArray(finalTarget.taskIds) && finalTarget.taskIds.includes(taskId);
        record('entry-task link survives unrelated library save', ok,
          `linkPresent=${ok}, taskIds=${JSON.stringify(finalTarget ? finalTarget.taskIds : null)}`);
      } else {
        record('entry-task link survives unrelated library save', false, 'no target entry or task available to link');
      }
    }
  } catch (err) {
    record('test execution', false, err.message);
    console.error(err);
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('Unhandled error in test:', err);
  process.exitCode = 1;
});
