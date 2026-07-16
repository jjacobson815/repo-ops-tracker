'use strict';

const path = require('path');
const fsp = require('fs/promises');
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prismaCliPath = require.resolve('prisma/build/index.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const DB_PATH = path.join(DATA_DIR, 'dev.db');
// Use an absolute `file:` URL (forward slashes) so Prisma resolves the SQLite
// path against the actual DATA_DIR rather than the schema directory (prisma/).
// A relative `file:./...` URL is resolved by Prisma relative to the schema
// file's directory, which places the DB in the wrong location when DATA_DIR is
// a relative/non-default path (e.g. the temp dir used by the test harness).
// The `file:<abs-path>` form (no `//`) is accepted by Prisma on both Windows
// and Linux (Docker), unlike `file:///` which the schema engine rejects.
const DB_URL = process.env.DATABASE_URL || `file:${DB_PATH.replace(/\\/g, '/')}`;
process.env.DATABASE_URL = DB_URL;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DB_URL
    }
  }
});

let dbInitialized = false;

function mapDbTask(task) {
  if (!task) return null;
  return {
    ...task,
    tags: JSON.parse(task.tags || '[]')
  };
}

async function ensureDbDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function ensureDbInitialized() {
  if (dbInitialized) return;
  await ensureDbDir();

  const prismaSchemaPath = path.join(PROJECT_ROOT, 'prisma', 'schema.prisma');

  execFileSync(process.execPath, [prismaCliPath, 'migrate', 'deploy', '--schema', prismaSchemaPath], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe'
  });

  await prisma.$connect();
  dbInitialized = true;
}

async function withDbDir(fn) {
  await ensureDbInitialized();
  return fn();
}

async function writeLegacyJsonFile(fileName, data) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, fileName);
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  prisma,
  DATA_DIR,
  DB_PATH,
  async getAllTasks() {
    return withDbDir(async () => {
      const tasks = await prisma.task.findMany();
      return tasks.map(mapDbTask);
    });
  },
  async getTasksByBoard(boardId) {
    return withDbDir(async () => {
      const tasks = await prisma.task.findMany({ where: { boardId } });
      return tasks.map(mapDbTask);
    });
  },
  async saveTasksForBoard(boardId, tasks) {
    return withDbDir(async () => {
      const rows = (tasks || []).map((t) => ({
        id: t.id,
        title: t.title || '',
        repoName: t.repoName || '',
        repoUrl: t.repoUrl || '',
        agent: t.agent || '',
        agentCustom: t.agentCustom || '',
        column: t.column || '',
        laneId: t.laneId || 'general',
        boardId: t.boardId || boardId || 'default',
        tags: JSON.stringify(t.tags || []),
        notes: t.notes || '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }));
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set(rows.map((r) => r.id));
        const existing = await tx.task.findMany({ where: { boardId } });
        const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.task.deleteMany({ where: { id: { in: toDelete } } });
        for (const r of rows) {
          await tx.task.upsert({ where: { id: r.id }, create: r, update: r });
        }
      });
      await writeLegacyJsonFile('tasks.json', (tasks || []).map((t) => ({ ...t, boardId: t.boardId || boardId || 'default' })));
    });
  },
  async saveAllTasks(tasks) {
    return withDbDir(async () => {
      const rows = (tasks || []).map((t) => ({
        id: t.id,
        title: t.title || '',
        repoName: t.repoName || '',
        repoUrl: t.repoUrl || '',
        agent: t.agent || '',
        agentCustom: t.agentCustom || '',
        column: t.column || '',
        laneId: t.laneId || 'general',
        boardId: t.boardId || 'default',
        tags: JSON.stringify(t.tags || []),
        notes: t.notes || '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }));
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set(rows.map((r) => r.id));
        const existing = await tx.task.findMany();
        const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.task.deleteMany({ where: { id: { in: toDelete } } });
        for (const r of rows) {
          await tx.task.upsert({ where: { id: r.id }, create: r, update: r });
        }
      });
      await writeLegacyJsonFile('tasks.json', (tasks || []).map((t) => ({ ...t, boardId: t.boardId || 'default' })));
    });
  },
  async getAllBoards() {
    return withDbDir(async () => prisma.board.findMany());
  },
  async getBoardById(id) {
    return withDbDir(async () => prisma.board.findUnique({ where: { id } }));
  },
  async saveAllBoards(boards) {
    return withDbDir(async () => {
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set((boards || []).map((b) => b.id));
        const existing = await tx.board.findMany();
        const toDelete = existing.map((b) => b.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.board.deleteMany({ where: { id: { in: toDelete } } });
        for (const b of (boards || [])) {
          await tx.board.upsert({ where: { id: b.id }, create: b, update: b });
        }
      });
      await writeLegacyJsonFile('boards.json', boards);
    });
  },
  async updateBoard(boardId, data) {
    return withDbDir(async () => prisma.board.update({ where: { id: boardId }, data }));
  },
  async deleteBoardCascade(boardId) {
    return withDbDir(async () => prisma.board.delete({ where: { id: boardId } }));
  },
  async getAllWorkflows() {
    return withDbDir(async () => prisma.workflowState.findMany());
  },
  async getWorkflowByBoard(boardId) {
    return withDbDir(async () => prisma.workflowState.findMany({ where: { boardId }, orderBy: { sortOrder: 'asc' } }));
  },
  async saveWorkflowForBoard(boardId, states) {
    return withDbDir(async () => {
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set((states || []).map((s) => s.id));
        const existing = await tx.workflowState.findMany({ where: { boardId } });
        const toDelete = existing.map((s) => s.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.workflowState.deleteMany({ where: { id: { in: toDelete } } });
        for (const s of (states || [])) {
          await tx.workflowState.upsert({ where: { id: s.id }, create: s, update: s });
        }
      });
    });
  },
  async saveAllWorkflows(states) {
    return withDbDir(async () => {
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set((states || []).map((s) => s.id));
        const existing = await tx.workflowState.findMany();
        const toDelete = existing.map((s) => s.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.workflowState.deleteMany({ where: { id: { in: toDelete } } });
        for (const s of (states || [])) {
          await tx.workflowState.upsert({ where: { id: s.id }, create: s, update: s });
        }
      });
      await writeLegacyJsonFile('workflow.json', states);
    });
  },
  async getAllLanes() {
    return withDbDir(async () => prisma.lane.findMany());
  },
  async getLanesByBoard(boardId) {
    return withDbDir(async () => prisma.lane.findMany({ where: { boardId }, orderBy: { sortOrder: 'asc' } }));
  },
  async saveLanesForBoard(boardId, lanes) {
    return withDbDir(async () => {
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set((lanes || []).map((l) => l.id));
        const existing = await tx.lane.findMany({ where: { boardId } });
        const toDelete = existing.map((l) => l.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.lane.deleteMany({ where: { id: { in: toDelete } } });
        for (const l of (lanes || [])) {
          await tx.lane.upsert({ where: { id: l.id }, create: l, update: l });
        }
      });
    });
  },
  async saveAllLanes(lanes) {
    return withDbDir(async () => {
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set((lanes || []).map((l) => l.id));
        const existing = await tx.lane.findMany();
        const toDelete = existing.map((l) => l.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.lane.deleteMany({ where: { id: { in: toDelete } } });
        for (const l of (lanes || [])) {
          await tx.lane.upsert({ where: { id: l.id }, create: l, update: l });
        }
      });
      await writeLegacyJsonFile('lanes.json', lanes);
    });
  },
  async getAllLibraryEntries() {
    return withDbDir(async () => {
      const entries = await prisma.libraryEntry.findMany({ include: { taskLinks: true } });
      return entries.map(({ taskLinks, ...rest }) => ({
        ...rest,
        taskIds: taskLinks.map((l) => l.taskId)
      }));
    });
  },
  async getLibraryEntriesForTask(taskId) {
    return withDbDir(async () => {
      const entries = await prisma.libraryEntry.findMany({
        where: { taskLinks: { some: { taskId } } },
        include: { taskLinks: true }
      });
      return entries.map(({ taskLinks, ...rest }) => ({
        ...rest,
        taskIds: taskLinks.map((l) => l.taskId)
      }));
    });
  },
  async saveAllLibraryEntries(entries) {
    return withDbDir(async () => {
      const rows = (entries || []).map((e) => ({
        id: e.id,
        type: e.type || 'instruction',
        lang: e.lang || null,
        title: e.title || '',
        category: e.category || '',
        body: e.body || '',
        createdAt: e.createdAt,
        updatedAt: e.updatedAt
      }));
      await prisma.$transaction(async (tx) => {
        const incomingIds = new Set(rows.map((r) => r.id));
        const existing = await tx.libraryEntry.findMany();
        const toDelete = existing.map((e) => e.id).filter((id) => !incomingIds.has(id));
        if (toDelete.length) await tx.libraryEntry.deleteMany({ where: { id: { in: toDelete } } });
        for (const r of rows) {
          await tx.libraryEntry.upsert({ where: { id: r.id }, create: r, update: r });
        }
        // Sync entry-task links per entry (upsert + delete-diff, mirrors the
        // KI-01 fix pattern — do not deleteMany+createMany the whole table).
        for (const e of (entries || [])) {
          const wantTaskIds = Array.isArray(e.taskIds) ? e.taskIds : [];
          const existingLinks = await tx.libraryEntryTask.findMany({ where: { entryId: e.id } });
          const existingTaskIds = new Set(existingLinks.map((l) => l.taskId));
          const wantSet = new Set(wantTaskIds);
          const toRemove = existingLinks.filter((l) => !wantSet.has(l.taskId));
          if (toRemove.length) {
            await tx.libraryEntryTask.deleteMany({
              where: { entryId: e.id, taskId: { in: toRemove.map((l) => l.taskId) } }
            });
          }
          for (const taskId of wantTaskIds) {
            if (!existingTaskIds.has(taskId)) {
              await tx.libraryEntryTask.create({ data: { entryId: e.id, taskId } });
            }
          }
        }
      });
      await writeLegacyJsonFile('library.json', entries);
    });
  }
};
