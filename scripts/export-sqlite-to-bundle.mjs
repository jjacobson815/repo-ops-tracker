// export-sqlite-to-bundle.mjs — one-shot dev migration helper.
//
// Reads the legacy SQLite database (data/dev.db) via the already-generated
// Prisma client and emits ONE portable import bundle per board, in the exact
// `schemaVersion: 2` format produced by public/js/components/boards.js
// (toPortableBundle). Import each emitted file through the new app's
// manage-boards "import" button (or store.importBoard) to migrate data into
// IndexedDB. No bespoke migration path — it reuses the standard bundle format.
//
//   node scripts/export-sqlite-to-bundle.mjs
//   DATA_DIR=/app/data node scripts/export-sqlite-to-bundle.mjs
//
// Requires the legacy dev deps (@prisma/client + a generated client). If the
// client isn't generated, run first:
//   npx prisma generate --schema legacy-server/prisma/schema.prisma
//
// Output: data/migration-bundles/<board-slug>.json  (+ an index.json listing).

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const DATA_DIR = resolve(process.env.DATA_DIR || './data');
const DB_PATH = join(DATA_DIR, 'dev.db');
const OUT_DIR = join(DATA_DIR, 'migration-bundles');

const prisma = new PrismaClient({
  datasources: { db: { url: `file:${DB_PATH.replace(/\\/g, '/')}` } }
});

function slugify(title) {
  return (title || 'board').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'board';
}

// Mirror of boards.js:toPortableBundle, adapted for Prisma rows (tags is a JSON
// string in SQLite; library entries carry their linked taskIds).
function toPortableBundle({ board, workflow, lanes, tasks, library }) {
  const sortedWorkflow = [...workflow].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedLanes = [...lanes].sort((a, b) => a.sortOrder - b.sortOrder);
  const workflowIndex = new Map(sortedWorkflow.map((w, i) => [w.id, i]));
  const laneIndex = new Map(sortedLanes.map((l, i) => [l.id, i]));

  const usedEntryIds = [];
  const seen = new Set();
  tasks.forEach((t) => {
    (library || []).forEach((entry) => {
      if ((entry.taskIds || []).includes(t.id) && !seen.has(entry.id)) {
        seen.add(entry.id);
        usedEntryIds.push(entry.id);
      }
    });
  });
  const libraryIndexByEntryId = new Map(usedEntryIds.map((id, i) => [id, i]));
  const entryById = new Map((library || []).map((e) => [e.id, e]));

  return {
    schemaVersion: 2,
    board: { title: board?.title || 'Untitled board', description: board?.description || '' },
    workflow: sortedWorkflow.map((w) => ({ label: w.label, accent: w.accent, isComplete: !!w.isComplete })),
    lanes: sortedLanes.map((l) => ({ label: l.label, accent: l.accent })),
    library: usedEntryIds.map((id) => {
      const e = entryById.get(id);
      return { title: e.title, category: e.category, body: e.body, type: e.type || 'instruction', lang: e.lang || null };
    }),
    tasks: tasks
      .filter((t) => workflowIndex.has(t.column) && laneIndex.has(t.laneId))
      .map((t) => {
        const linkedEntries = (library || []).filter((entry) => (entry.taskIds || []).includes(t.id));
        return {
          title: t.title, repoName: t.repoName || '', repoUrl: t.repoUrl || '',
          agent: t.agent || '', agentCustom: t.agentCustom || '', notes: t.notes || '',
          tags: parseTags(t.tags),
          columnIndex: workflowIndex.get(t.column), laneIndex: laneIndex.get(t.laneId),
          libraryIndexes: linkedEntries.map((entry) => libraryIndexByEntryId.get(entry.id)),
          linkedInstructions: linkedEntries.map((entry) => ({
            title: entry.title, category: entry.category, body: entry.body,
            type: entry.type || 'instruction', lang: entry.lang || null
          })),
          createdAt: t.createdAt, updatedAt: t.updatedAt
        };
      })
  };
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  try { const p = JSON.parse(tags || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const boards = await prisma.board.findMany();
  if (!boards.length) {
    console.log('No boards found in', DB_PATH, '— nothing to export.');
    return;
  }

  // Library is global; load once with links.
  const libraryRaw = await prisma.libraryEntry.findMany({ include: { taskLinks: true } });
  const library = libraryRaw.map(({ taskLinks, ...rest }) => ({ ...rest, taskIds: taskLinks.map((l) => l.taskId) }));

  const index = [];
  for (const board of boards) {
    const [workflow, lanes, tasks] = await Promise.all([
      prisma.workflowState.findMany({ where: { boardId: board.id } }),
      prisma.lane.findMany({ where: { boardId: board.id } }),
      prisma.task.findMany({ where: { boardId: board.id } })
    ]);
    const bundle = toPortableBundle({ board, workflow, lanes, tasks, library });
    const filename = `${slugify(board.title)}.json`;
    await writeFile(join(OUT_DIR, filename), JSON.stringify(bundle, null, 2), 'utf8');
    index.push({ board: board.title, file: filename, tasks: bundle.tasks.length, isDefault: !!board.isDefault });
    console.log(`  wrote ${filename}  (${bundle.tasks.length} tasks, ${bundle.library.length} instructions)`);
  }

  await writeFile(join(OUT_DIR, 'index.json'), JSON.stringify({ generatedFrom: DB_PATH, bundles: index }, null, 2), 'utf8');
  console.log(`\nExported ${boards.length} board bundle(s) to ${OUT_DIR}`);
  console.log('Import each file via the app\'s manage-boards "import" button.');
}

main()
  .catch((err) => { console.error('Export failed:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
