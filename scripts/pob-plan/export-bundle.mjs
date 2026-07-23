#!/usr/bin/env node
// export-bundle.mjs — writes the PoB plan as schemaVersion:2 import bundles
// (the exact format board.js's "export board" produces and "import board"
// consumes — see toPortableBundle() in public/js/components/boards.js), ONE
// FILE PER PHASE. Import each one separately through the app's own UI: open
// the app → "manage boards" → Import → pick a file. Repeat per file — there's
// no bulk-import in the UI.
//
//   node scripts/pob-plan/export-bundle.mjs [output-dir]
//
// Unlike sync.mjs (which upserts a single mirrored board in place via
// store.js in a dedicated Playwright profile), importing these through the
// UI always creates NEW boards with fresh ids — re-importing after a plan
// update creates duplicates rather than updating the originals. Delete the
// old "PoB Qt Port — Phase N: ..." boards first if you want to replace them.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPobPlanBoardsPerPhase } from './parse-plan.mjs';

const DEFAULT_PLAN_DIR = 'C:/Users/User/source/repos/pob_workspace/PathOfBuilding/port-plan';
const PLAN_DIR = process.env.POB_PORT_PLAN_DIR || DEFAULT_PLAN_DIR;
const OUT_DIR = resolve(process.argv[2] || 'pob-qt-port-plan-by-phase');

function toImportBundle({ board, workflow, lanes, tasks }) {
  const workflowIndex = new Map(workflow.map((w, i) => [w.id, i]));
  const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));
  return {
    schemaVersion: 2,
    board: { title: board.title, description: board.description },
    workflow: workflow.map((w) => ({ label: w.label, accent: w.accent, isComplete: w.isComplete })),
    lanes: lanes.map((l) => ({ label: l.label, accent: l.accent })),
    library: [],
    tasks: tasks.map((t) => ({
      title: t.title,
      repoName: t.repoName,
      repoUrl: t.repoUrl,
      agent: t.agent,
      agentCustom: t.agentCustom,
      notes: t.notes,
      tags: t.tags,
      columnIndex: workflowIndex.get(t.column),
      laneIndex: laneIndex.get(t.laneId)
    }))
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const phaseBoards = buildPobPlanBoardsPerPhase(PLAN_DIR);
const written = [];
for (const pb of phaseBoards) {
  const bundle = toImportBundle(pb);
  const filename = `phase-${String(pb.phaseNum).padStart(2, '0')}${pb.isActivePhase ? '-ACTIVE' : ''}.import.json`;
  const outPath = resolve(OUT_DIR, filename);
  writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  written.push({ file: filename, lanes: bundle.lanes.length, tasks: bundle.tasks.length });
}

console.log(`wrote ${written.length} files to ${OUT_DIR}`);
written.forEach((w) => console.log(`  ${w.file} — ${w.lanes} lanes, ${w.tasks} cards`));
console.log('Import each one: open the app → "manage boards" → Import → pick a file (repeat per file).');
