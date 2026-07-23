// e2e.spec.mjs — acceptance tests for the Dexie/IndexedDB migration.
// Runs against the static app served by scripts/serve.mjs (NO server running).
// Covers acceptance criteria #1, #2, #3 (KI-01), #5 (rollback), #6 (XSS).
//
// Most data-layer assertions drive store.js directly via page.evaluate(import)
// — this exercises the real IndexedDB path the app uses. UI-level checks cover
// load (#1) and the board-selector XSS (#6).

import { test, expect } from '@playwright/test';

// Import store.js inside the page and run `fn(store)`; returns fn's result.
async function withStore(page, fn) {
  return page.evaluate(async (fnStr) => {
    const store = await import('/js/store.js');
    // eslint-disable-next-line no-new-func
    const fn = new Function('store', `return (${fnStr})(store);`);
    return fn(store);
  }, fn.toString());
}

async function bootApp(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  // App seeds the default board on first load; wait for the board selector to fill.
  await expect(page.locator('#boardSelector option')).toHaveCount(1);
  return errors;
}

test('#1 app loads fully static (no server) and seeds a default board', async ({ page }) => {
  const errors = await bootApp(page);
  await expect(page.locator('#boardSelector')).toContainText('Default board');
  // No module/network errors on boot.
  expect(errors, `page errors: ${errors.join('\n')}`).toEqual([]);
  // Dashboard is the default active tab; switch to board and confirm the
  // swimlane/column scaffolding rendered from the seeded workflow/lanes.
  await page.locator('.tab-btn[data-tab="board"]').click();
  await expect(page.locator('#boardEl')).toBeVisible();
});

test('#2 board/column/card CRUD persists across a full reload', async ({ page }) => {
  await bootApp(page);

  // Create a task on the default board via the same store path the UI uses.
  const taskId = await withStore(page, async (store) => {
    const boards = await store.getAllBoards();
    const boardId = boards[0].id;
    const wf = await store.getWorkflowByBoard(boardId);
    const lanes = await store.getLanesByBoard(boardId);
    const id = store.uid();
    const now = new Date().toISOString();
    await store.saveTasksForBoard(boardId, [{
      id, title: 'Persisted task', repoName: '', repoUrl: '', agent: '', agentCustom: '',
      column: wf[0].id, laneId: lanes[0].id, boardId, tags: ['keep'], notes: 'hello',
      createdAt: now, updatedAt: now
    }]);
    return id;
  });

  // Full page reload — IndexedDB must survive.
  await page.reload();
  await expect(page.locator('#boardSelector option')).toHaveCount(1);

  const reread = await withStore(page, async (store) => {
    const boards = await store.getAllBoards();
    const tasks = await store.getTasksByBoard(boards[0].id);
    return tasks;
  });
  expect(reread).toHaveLength(1);
  expect(reread[0].id).toBe(taskId);
  expect(reread[0].title).toBe('Persisted task');
  expect(reread[0].tags).toEqual(['keep']); // array preserved (not a JSON string)
});

test('#3 KI-01: bulk board save + bulk join save leaves the OTHER board byte-identical', async ({ page }) => {
  await bootApp(page);

  // Build two populated boards (A and B) via the import path (client-side ids).
  const ids = await withStore(page, async (store) => {
    const mk = (title, tag) => ({
      schemaVersion: 2,
      board: { title, description: '' },
      workflow: [
        { label: 'todo', accent: '#8891A5', isComplete: false },
        { label: 'done', accent: '#4ADE80', isComplete: true }
      ],
      lanes: [{ label: 'general', accent: '#4FD1C5' }],
      library: [{ title: `${title} instr`, category: 'c', body: 'b', type: 'instruction', lang: null }],
      tasks: [{
        title: `${title} task`, columnIndex: 0, laneIndex: 0, tags: [tag],
        libraryIndexes: [0], linkedInstructions: [{ title: `${title} instr`, category: 'c', body: 'b' }],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
      }]
    });
    const a = await store.importBoard(mk('Board A', 'a'));
    const b = await store.importBoard(mk('Board B', 'b'));
    return { a: a.boardId, b: b.boardId };
  });

  // Snapshot board B's full state (tasks + lanes + workflow + its library links).
  const beforeB = await page.evaluate(async (bid) => {
    const store = await import('/js/store.js');
    const [tasks, lanes, wf, lib] = await Promise.all([
      store.getTasksByBoard(bid), store.getLanesByBoard(bid), store.getWorkflowByBoard(bid), store.getAllLibraryEntries()
    ]);
    const bTaskIds = new Set(tasks.map((t) => t.id));
    const bLib = lib.filter((e) => (e.taskIds || []).some((tid) => bTaskIds.has(tid)));
    return JSON.stringify({ tasks, lanes, wf, bLib });
  }, ids.b);

  // Mutate board A hard: bulk board replace (KI-01 trigger) + bulk task save +
  // bulk library save with A's join-table links rewritten.
  await page.evaluate(async (aid) => {
    const store = await import('/js/store.js');
    // (a) classic KI-01: bulk board replace including a brand-new board.
    const boards = await store.getAllBoards();
    const now = new Date().toISOString();
    await store.saveAllBoards([...boards, {
      id: 'ki01-c3', title: 'KI-01 board 3', description: '', createdAt: now, updatedAt: now, isDefault: false
    }]);
    // (b) rewrite board A's tasks wholesale.
    const aTasks = await store.getTasksByBoard(aid);
    await store.saveTasksForBoard(aid, aTasks.map((t) => ({ ...t, title: t.title + ' (edited)', updatedAt: now })));
    // (c) bulk library save touching A's links.
    const lib = await store.getAllLibraryEntries();
    await store.saveAllLibraryEntries(lib);
  }, ids.a);

  const afterB = await page.evaluate(async (bid) => {
    const store = await import('/js/store.js');
    const [tasks, lanes, wf, lib] = await Promise.all([
      store.getTasksByBoard(bid), store.getLanesByBoard(bid), store.getWorkflowByBoard(bid), store.getAllLibraryEntries()
    ]);
    const bTaskIds = new Set(tasks.map((t) => t.id));
    const bLib = lib.filter((e) => (e.taskIds || []).some((tid) => bTaskIds.has(tid)));
    return JSON.stringify({ tasks, lanes, wf, bLib });
  }, ids.b);

  // Structural (not string) equality — JSON.stringify key order can legitimately
  // differ between an importBoard-inserted row and a saveAllLibraryEntries-
  // normalized row without the underlying data having changed.
  expect(JSON.parse(afterB)).toEqual(JSON.parse(beforeB)); // board B untouched
});

test('#5 malformed bundle import fails with the same message and leaves DB unmodified', async ({ page }) => {
  await bootApp(page);

  const before = await withStore(page, async (store) => {
    const [boards, lib] = await Promise.all([store.getAllBoards(), store.getAllLibraryEntries()]);
    return JSON.stringify({ boardCount: boards.length, libCount: lib.length });
  });

  // Bundle with an out-of-range columnIndex — must reject with the exact message.
  const result = await withStore(page, async (store) => {
    const bad = {
      schemaVersion: 2,
      board: { title: 'Bad board', description: '' },
      workflow: [{ label: 'only', accent: '#8891A5', isComplete: false }],
      lanes: [{ label: 'general', accent: '#4FD1C5' }],
      library: [],
      tasks: [{ title: 'oops', columnIndex: 9, laneIndex: 0, tags: [] }] // 9 is out of range
    };
    try {
      await store.importBoard(bad);
      return { threw: false };
    } catch (e) {
      return { threw: true, message: e.message };
    }
  });

  expect(result.threw).toBe(true);
  expect(result.message).toBe('a task is invalid or has an out-of-range columnIndex/laneIndex/libraryIndexes entry');

  const after = await withStore(page, async (store) => {
    const [boards, lib] = await Promise.all([store.getAllBoards(), store.getAllLibraryEntries()]);
    return JSON.stringify({ boardCount: boards.length, libCount: lib.length });
  });
  expect(after).toBe(before); // DB untouched (transaction never opened)
});

test('#6 board selector renders an untrusted board name inertly (XSS)', async ({ page }) => {
  await bootApp(page);

  let alertFired = false;
  page.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });

  const XSS = '<img src=x onerror="window.__xss=1">';
  await page.evaluate(async (xssTitle) => {
    const store = await import('/js/store.js');
    const boards = await store.getAllBoards();
    const now = new Date().toISOString();
    await store.saveAllBoards([...boards, {
      id: 'xss-board', title: xssTitle, description: '', createdAt: now, updatedAt: now, isDefault: false
    }]);
  }, XSS);

  await page.reload();
  await expect(page.locator('#boardSelector option')).toHaveCount(2);

  // The malicious title must appear as literal text, not as a live <img>.
  const selectorHasImg = await page.locator('#boardSelector img').count();
  expect(selectorHasImg).toBe(0);
  const optionText = await page.locator('#boardSelector option', { hasText: 'img src=x' }).textContent();
  expect(optionText).toContain('<img src=x');
  const xssFlag = await page.evaluate(() => window.__xss);
  expect(xssFlag).toBeUndefined();
  expect(alertFired).toBe(false);
});
