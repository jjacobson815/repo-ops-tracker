// parse-plan.mjs — reads the PathOfBuilding Qt-port plan (port-plan/STATUS.md +
// port-plan/phases/PHASE-*.md) and turns it into row objects ready to hand to
// store.js (saveAllBoards/saveWorkflowForBoard/saveLanesForBoard/saveTasksForBoard).
//
// All ids are DETERMINISTIC (derived from phase number / item position), never
// random — that's what lets sync.mjs upsert in place every run instead of
// piling up duplicate boards. See scripts/pob-plan/README.md.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const BOARD_ID = 'pob-qt-port-plan';

const WORKFLOW = [
  { id: 'backlog', label: 'backlog', accent: '#8891A5', isComplete: false },
  { id: 'active', label: 'active phase', accent: '#4FD1C5', isComplete: false },
  { id: 'blocked', label: 'open decision', accent: '#F5A623', isComplete: false },
  { id: 'done', label: 'done', accent: '#4ADE80', isComplete: true }
];

const LANE_ACCENTS = [
  '#4FD1C5', '#F5A623', '#9B8FE0', '#4ADE80', '#F87171', '#60A5FA',
  '#FBBF24', '#34D399', '#A78BFA', '#FB923C', '#38BDF8', '#F472B6',
  '#A3E635', '#2DD4BF', '#C084FC', '#FCD34D'
];

function truncate(str, max) {
  const s = (str || '').trim();
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function readPhaseFile(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const h1 = lines.find((l) => /^#\s+Phase\s+\d+/.test(l)) || '';
  const h1Match = h1.match(/^#\s+Phase\s+(\d+)\s*—\s*(.*)$/);
  const phaseNum = h1Match ? Number(h1Match[1]) : null;
  const phaseTitle = h1Match ? h1Match[2].trim() : '(untitled)';

  const items = [];
  let currentPart = 'general';
  let itemIndex = 0;
  // { checked, mainParts: [wrapped sentence lines], arrowParts: [→ follow-up note lines], mode }
  let current = null;

  const flush = () => {
    if (!current) return;
    const mainText = current.mainParts.join(' ').replace(/\s+/g, ' ').trim();
    const arrowText = current.arrowParts.join(' ').replace(/\s+/g, ' ').trim();
    const sizeMatch = mainText.match(/\(([SML])\)|\(([SML])[\s—-]/);
    const size = sizeMatch ? (sizeMatch[1] || sizeMatch[2]) : null;
    const titleClean = mainText.replace(/\s*\([SML](\s*[—-][^)]*)?\)\.?\s*$/, '').trim() || mainText;
    items.push({
      checked: current.checked,
      part: currentPart,
      title: truncate(titleClean, 180),
      notes: arrowText ? `${mainText}\n\n${arrowText}` : mainText,
      size,
      index: itemIndex++
    });
    current = null;
  };

  for (const raw of lines) {
    const partMatch = raw.match(/^##\s+Part\s+([\d.]+)\s*—\s*(.*)$/);
    if (partMatch) {
      flush();
      currentPart = `${partMatch[1]} — ${partMatch[2].trim()}`;
      continue;
    }
    if (/^##\s+/.test(raw)) { flush(); continue; } // any other heading ends the current item/part context
    const itemMatch = raw.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (itemMatch) {
      flush();
      current = { checked: itemMatch[1].toLowerCase() === 'x', mainParts: [itemMatch[2].trim()], arrowParts: [], mode: 'main' };
      continue;
    }
    if (current && /^\s+\S/.test(raw) && !/^\s*-\s/.test(raw)) {
      const trimmed = raw.trim();
      if (current.mode === 'arrow' || /^→/.test(trimmed)) {
        current.mode = 'arrow';
        current.arrowParts.push(trimmed);
      } else {
        current.mainParts.push(trimmed);
      }
      continue;
    }
    if (current && raw.trim() === '') { flush(); continue; }
  }
  flush();

  return { phaseNum, phaseTitle, items };
}

function readOpenDecisions(statusPath) {
  const text = readFileSync(statusPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^##\s+.*Open decisions/.test(l));
  if (startIdx === -1) return [];
  const decisions = [];
  let current = null;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (/^##\s+/.test(raw)) break; // next section
    const bulletMatch = raw.match(/^-\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (bulletMatch) {
      if (current) decisions.push(current);
      current = { title: bulletMatch[1].trim(), text: bulletMatch[2].trim() ? [bulletMatch[2].trim()] : [] };
      continue;
    }
    if (current && /^\s+\S/.test(raw)) { current.text.push(raw.trim()); continue; }
  }
  if (current) decisions.push(current);
  return decisions.map((d, i) => {
    const fullText = d.text.join(' ').replace(/\s+/g, ' ').trim();
    const phaseMatch = fullText.match(/\(Phase\s+(\d+)\)/) || d.title.match(/\(Phase\s+(\d+)\)/);
    return {
      index: i,
      title: d.title,
      notes: `${d.title} — ${fullText}`.trim(),
      phaseNum: phaseMatch ? Number(phaseMatch[1]) : null
    };
  });
}

function readActivePhase(statusPath) {
  const text = readFileSync(statusPath, 'utf8');
  const m = text.match(/ACTIVE PHASE[\s\S]*?\*\*Phase\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

function partLabel(part) {
  return part === 'general' ? 'General' : part.replace(' — ', ' · ');
}

// Shared by both board builders below.
function readPlanData(portPlanDir) {
  const statusPath = join(portPlanDir, 'STATUS.md');
  const phasesDir = join(portPlanDir, 'phases');
  const activePhase = readActivePhase(statusPath);
  const decisions = readOpenDecisions(statusPath);

  const phaseFiles = readdirSync(phasesDir)
    .filter((f) => /^PHASE-\d+-.*\.md$/.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/^PHASE-(\d+)-/)[1]);
      const nb = Number(b.match(/^PHASE-(\d+)-/)[1]);
      return na - nb;
    });

  const phases = phaseFiles.map((f) => readPhaseFile(join(phasesDir, f)));
  return { activePhase, decisions, phases };
}

export function buildPobPlanBoard(portPlanDir) {
  const { activePhase, decisions, phases } = readPlanData(portPlanDir);

  const lanes = phases.map((p, i) => ({
    id: `phase-${p.phaseNum}`,
    boardId: BOARD_ID,
    label: truncate(`Ph${p.phaseNum} · ${p.phaseTitle}`, 40),
    accent: LANE_ACCENTS[i % LANE_ACCENTS.length],
    sortOrder: i
  }));

  const workflow = WORKFLOW.map((w, i) => ({ ...w, boardId: BOARD_ID, sortOrder: i }));

  const tasks = [];
  for (const p of phases) {
    for (const item of p.items) {
      const column = item.checked ? 'done' : (p.phaseNum === activePhase ? 'active' : 'backlog');
      tasks.push({
        id: `p${p.phaseNum}-i${item.index}`,
        title: item.title,
        repoName: 'PathOfBuilding (Qt port)',
        repoUrl: '',
        agent: '',
        agentCustom: '',
        column,
        laneId: `phase-${p.phaseNum}`,
        boardId: BOARD_ID,
        tags: [`phase-${p.phaseNum}`, `part-${item.part.split(' —')[0]}`, item.size ? `size-${item.size.toLowerCase()}` : null].filter(Boolean),
        notes: item.notes,
        createdAt: undefined, // filled by sync.mjs only for genuinely new tasks
        updatedAt: undefined
      });
    }
  }
  for (const d of decisions) {
    if (d.phaseNum === null) continue; // every decision in STATUS.md currently names a phase; skip defensively if not
    tasks.push({
      id: `decision-${d.index}`,
      title: truncate(d.title, 180),
      repoName: 'PathOfBuilding (Qt port)',
      repoUrl: '',
      agent: '',
      agentCustom: '',
      column: 'blocked',
      laneId: `phase-${d.phaseNum}`,
      boardId: BOARD_ID,
      tags: [`phase-${d.phaseNum}`, 'decision'],
      notes: d.notes,
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  const board = {
    id: BOARD_ID,
    title: 'PoB → Qt Port Plan',
    description: `Auto-mirrored from PathOfBuilding/port-plan (active phase: ${activePhase}). ` +
      'This board is regenerated from the plan docs every sync — edits made directly on it will be overwritten.',
    isDefault: false
  };

  return { board, workflow, lanes, tasks, activePhase, decisionCount: decisions.length };
}

// One board PER PHASE, for export-bundle.mjs's --split output AND (via
// sync.mjs) the live multi-board mirror. Lanes become each phase's
// "## Part X.Y" sections (finer-grained than useful across a single combined
// board, but exactly right once each board is scoped to one phase) plus an
// "Open decisions" lane when that phase has any.
//
// workflows/lanes/tasks are separate Dexie tables keyed by `id` ALONE (not
// [boardId,id]) — see db.js — so every id below is prefixed with the phase
// number to stay globally unique across all 16 boards, not just unique
// within one board.
export function buildPobPlanBoardsPerPhase(portPlanDir) {
  const { activePhase, decisions, phases } = readPlanData(portPlanDir);

  return phases.map((p) => {
    const boardId = `pob-phase-${p.phaseNum}`;
    const idp = (suffix) => `p${p.phaseNum}-${suffix}`;

    const partKeys = [];
    const seenParts = new Set();
    p.items.forEach((item) => {
      if (!seenParts.has(item.part)) { seenParts.add(item.part); partKeys.push(item.part); }
    });
    const phaseDecisions = decisions.filter((d) => d.phaseNum === p.phaseNum);
    if (phaseDecisions.length) partKeys.push('__decisions');

    const lanes = partKeys.map((key, i) => ({
      id: idp(`lane-${i}`),
      boardId,
      label: truncate(key === '__decisions' ? 'Open decisions' : partLabel(key), 40),
      accent: LANE_ACCENTS[i % LANE_ACCENTS.length],
      sortOrder: i
    }));
    const laneIdByKey = new Map(partKeys.map((key, i) => [key, idp(`lane-${i}`)]));

    const workflow = WORKFLOW.map((w, i) => ({ ...w, id: idp(w.id), boardId, sortOrder: i }));
    const columnId = (key) => idp(WORKFLOW.find((w) => w.id === key).id);

    const tasks = p.items.map((item) => ({
      id: idp(`i${item.index}`),
      title: item.title,
      repoName: 'PathOfBuilding (Qt port)',
      repoUrl: '',
      agent: '',
      agentCustom: '',
      column: columnId(item.checked ? 'done' : (p.phaseNum === activePhase ? 'active' : 'backlog')),
      laneId: laneIdByKey.get(item.part),
      boardId,
      tags: [`phase-${p.phaseNum}`, `part-${item.part.split(' —')[0]}`, item.size ? `size-${item.size.toLowerCase()}` : null].filter(Boolean),
      notes: item.notes
    }));
    phaseDecisions.forEach((d) => {
      tasks.push({
        id: idp(`decision-${d.index}`),
        title: truncate(d.title, 180),
        repoName: 'PathOfBuilding (Qt port)',
        repoUrl: '',
        agent: '',
        agentCustom: '',
        column: columnId('blocked'),
        laneId: laneIdByKey.get('__decisions'),
        boardId,
        tags: [`phase-${p.phaseNum}`, 'decision'],
        notes: d.notes
      });
    });

    const board = {
      id: boardId,
      title: truncate(`PoB Qt Port — Phase ${p.phaseNum}: ${p.phaseTitle}`, 200),
      description: `Auto-generated from PathOfBuilding/port-plan phases/PHASE-${p.phaseNum}-*.md.` +
        (p.phaseNum === activePhase ? ' This is the ACTIVE phase.' : ''),
      isDefault: false
    };

    return { board, workflow, lanes, tasks, phaseNum: p.phaseNum, isActivePhase: p.phaseNum === activePhase };
  });
}
