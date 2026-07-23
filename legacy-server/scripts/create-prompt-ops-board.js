'use strict';

// Creates / regenerates the prompt-engineering-ops boards from workflow.md.
//
// workflow.md describes FIVE separate Kanban boards (one per former "swimlane").
// In this app a Board owns BOTH its swimlanes (Lane) and its columns
// (WorkflowState), and the board view is a single grid of lanes x columns
// (see public/js/components/board.js). So each "Board" in workflow.md becomes
// its own Board row with only its own columns + tasks, plus one default
// "general" lane (the app requires >=1 lane to render).
//
// Structure per board:
//   - WorkflowState  <-> column          (workflow.md "Column")
//   - Task           <-> task state      (workflow.md "Task State")
//   - LibraryEntry   <-> shell snippet   (type='snippet', linked to a task)
//
// Usage: node scripts/create-prompt-ops-board.js
//
// Idempotent & safe to re-run after editing workflow.md:
//   - The superseded single "prompt-ops" board is removed (cascade).
//   - Each board row is upserted; its columns / lanes / tasks are replaced via
//     the scoped delete-diff helpers in lib/db.js (other boards untouched).
//   - Library snippets are merged: previous prompt-ops snippets (id prefix
//     "po-snip-") are removed and the new set added, preserving all other
//     library entries.

const db = require('../lib/db');

// The five boards, derived from workflow.md. Each "Board N" becomes one board.
const BOARDS = [
  {
    id: 'po-tech-foundation',
    title: 'Technical Foundation (Pre-Flight)',
    description: 'Pre-flight: toolchain, persisted config, proxy vars, trace infrastructure.',
    columns: [
      { id: 'col-env-tools',    label: 'Environment & Tools',   accent: '#8891A5', isComplete: false },
      { id: 'col-trace-infra',  label: 'Trace Infrastructure',  accent: '#4FD1C5', isComplete: false }
    ],
    tasks: [
      { id: 'tf-toolchain',        title: 'Toolchain Sync (Required)',          column: 'col-env-tools',   tags: ['toolchain'],  notes: 'Verify Claude Code v2.1.176+ and Trace Extractor v1.18.0 or v1.19.0.' },
      { id: 'tf-persisted-config', title: 'Persisted Config (Completed Once)',  column: 'col-env-tools',   tags: ['tmux'],      notes: 'Write the tmux conf (100k scrollback + mouse) so it persists across sessions.' },
      { id: 'tf-proxy-export',     title: 'Proxy Variable Export (Active)',     column: 'col-env-tools',   tags: ['proxy'],     notes: 'Set ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL in your terminal BEFORE launching tmux (sessions only inherit env vars set before creation).' },
      { id: 'tf-cert-gen',         title: 'Certificate Generation (Ready)',     column: 'col-trace-infra', tags: ['mitmproxy'], notes: 'Run uv run mitmproxy; wait for the UI to load, then press q to generate ~/.mitmproxy/mitmproxy-ca-cert.pem.' },
      { id: 'tf-system-trust',     title: 'System Trust (Verified)',            column: 'col-trace-infra', tags: ['cert'],      notes: 'Trust the mitmproxy CA cert at the system level (macOS security add-trusted-cert or Linux ca-certificates).' }
    ],
    snippets: [
      { id: 'po-snip-toolchain',        title: 'Verify toolchain versions',        category: 'Technical Foundation', body: 'claude --version\nuv run python main.py --version', taskIds: ['tf-toolchain'] },
      { id: 'po-snip-persisted-config', title: 'Persist tmux config',              category: 'Technical Foundation', body: 'echo -e "set-option -g history-limit 100000\\nset -g mouse on" > ~/.tmux.conf', taskIds: ['tf-persisted-config'] },
      { id: 'po-snip-cert-gen',         title: 'Generate mitmproxy cert',          category: 'Technical Foundation', body: '# Wait for the UI to load, then press q\nuv run mitmproxy', taskIds: ['tf-cert-gen'] },
      { id: 'po-snip-system-trust',     title: 'Trust mitmproxy CA cert',          category: 'Technical Foundation', body: '# macOS\nsudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem\n# Linux\nsudo cp ~/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/mitmproxy.crt && sudo update-ca-certificates', taskIds: ['tf-system-trust'] }
    ]
  },
  {
    id: 'po-strategic-selection',
    title: 'Strategic Selection (Choosing the "Winner")',
    description: 'Choosing the "winner": repo sourcing, exclusions, license, priority mapping.',
    columns: [
      { id: 'col-repo-sourcing',  label: 'Repository Sourcing',      accent: '#F5A623', isComplete: false },
      { id: 'col-domain-align',   label: 'Domain & Task Alignment',  accent: '#9B8FE0', isComplete: false }
    ],
    tasks: [
      { id: 'ss-quality-audit',     title: 'Quality Signal Audit (Pending)',      column: 'col-repo-sourcing', tags: ['repo-sourcing'], notes: 'Must be enterprise-grade: 200+ source files, CI/CD, active maintenance, real users.' },
      { id: 'ss-exclusion-filter',  title: 'Exclusion Filter (Checked)',          column: 'col-repo-sourcing', tags: ['exclusions'],    notes: 'Avoid SWE-Bench repos (Django, Flask, etc.) and over-covered repos (Baserow, Ghost, Superset, etc.).' },
      { id: 'ss-license-verify',    title: 'License Verification (Required)',     column: 'col-repo-sourcing', tags: ['license'],      notes: 'Permissive only: MIT, Apache, or BSD.' },
      { id: 'ss-priority-mapping',  title: 'Priority Mapping (Active)',           column: 'col-domain-align',  tags: ['domain-align'], notes: 'Target High-Need types: Product Interaction, Test, Requirements, Code Review. Deprioritize Feature Development.' }
    ],
    snippets: [] // no shell commands in this board
  },
  {
    id: 'po-prompt-engineering',
    title: 'Prompt Engineering (The "Senior SWE" Request)',
    description: 'The "Senior SWE" request: content design, sanitization & capture.',
    columns: [
      { id: 'col-content-design',  label: 'Content Design',         accent: '#60A5FA', isComplete: false },
      { id: 'col-sanitization',    label: 'Sanitization & Capture', accent: '#F472B6', isComplete: false }
    ],
    tasks: [
      { id: 'pe-persona',        title: 'Senior Persona Drafting (In Progress)', column: 'col-content-design', tags: ['content-design'], notes: 'Conversational "Slack-style" ask. Define the what, not the how. Avoid "Step 1, 2, 3".' },
      { id: 'pe-goal-scoping',   title: 'Goal & Outcome Scoping (Drafted)',      column: 'col-content-design', tags: ['content-design'], notes: 'Document the "Overall Goal." Specify which files should change and where the model is likely to fail.' },
      { id: 'pe-env-cleaning',   title: 'Environment Cleaning (Ready)',          column: 'col-sanitization',   tags: ['sanitization'],   notes: 'Remove .git, CLAUDE.md/AGENTS.md, and any enterprise (ee/) folders before capture.' },
      { id: 'pe-init-capture',   title: 'Initial State Capture (Pending)',       column: 'col-sanitization',   tags: ['capture'],        notes: 'Package the sanitized initial repo state as <project>-start.tar (use lowercase/hyphen names).' }
    ],
    snippets: [
      { id: 'po-snip-env-cleaning',  title: 'Clean repo environment',           category: 'Prompt Engineering', body: 'rm -rf .git\nrm CLAUDE.md AGENTS.md\n# remove any enterprise (ee/) folders\nrm -rf ee', taskIds: ['pe-env-cleaning'] },
      { id: 'po-snip-init-capture',  title: 'Capture initial state (start.tar)', category: 'Prompt Engineering', body: '# Use lowercase/hyphen project names\ntar -cf <project>-start.tar ./<project>', taskIds: ['pe-init-capture'] }
    ]
  },
  {
    id: 'po-live-validation',
    title: 'Live Validation (Interactive/Autonomous)',
    description: 'Interactive/Autonomous execution and difficulty threshold.',
    columns: [
      { id: 'col-execution',   label: 'Execution',            accent: '#4ADE80', isComplete: false },
      { id: 'col-difficulty',  label: 'Difficulty Threshold', accent: '#FB7185', isComplete: false }
    ],
    tasks: [
      { id: 'lv-session-init',     title: 'Session Initialization (Active)',   column: 'col-execution',   tags: ['execution'],  notes: 'tmux kill-server for a fresh start (proxy vars), then launch Trace Extractor first, then Claude Code in tmux.' },
      { id: 'lv-validation-run',   title: 'Validation Run (In Progress)',      column: 'col-execution',   tags: ['validation'], notes: 'Interactive: 5+ meaningful turns and 1.5+ hrs. Autonomous: 45min–1.5hr+ of model generation without follow-ups.' },
      { id: 'lv-success-check',    title: 'Success Check (Critical Path)',     column: 'col-difficulty',  tags: ['difficulty'], notes: 'Valid if Task Success ≤ 2 OR Instruction Following ≤ 2. If both > 2, the prompt is too easy.' },
      { id: 'lv-failure-protocol', title: 'Failure Protocol (If Applicable)',  column: 'col-difficulty',  tags: ['difficulty'], notes: 'If too easy, redesign the opening prompt and restart with a fresh project state. If best efforts fail, submit honestly and take a mandatory 24-hour break.' }
    ],
    snippets: [
      { id: 'po-snip-session-init', title: 'Kill tmux server (fresh proxy start)', category: 'Live Validation', body: 'tmux kill-server', taskIds: ['lv-session-init'] }
    ]
  },
  {
    id: 'po-artifact-submission',
    title: 'Artifact Submission',
    description: 'Final archiving and submission rationale.',
    columns: [
      { id: 'col-final-archiving',        label: 'Final Archiving',        accent: '#FBBF24', isComplete: false },
      { id: 'col-submission-rationale',   label: 'Submission Rationale',   accent: '#34D399', isComplete: true }
    ],
    tasks: [
      { id: 'as-sequential-shutdown', title: 'Sequential Shutdown (Ready)',        column: 'col-final-archiving',      tags: ['final-archiving'], notes: '/exit in Claude Code, then Ctrl+C in the Trace Extractor window.' },
      { id: 'as-final-capture',       title: 'Final State Capture (Pending)',      column: 'col-final-archiving',      tags: ['capture'],         notes: 'Package the final repo state as <project>-end-claude.tar (exclude node_modules / .venv).' },
      { id: 'as-evidence-rating',     title: 'Evidence-Based Rating (Final)',      column: 'col-submission-rationale', tags: ['rating'],          notes: 'Provide 3–5+ sentences per rating; reference specific turns and behaviors where the model struggled or failed.' },
      { id: 'as-form-completion',     title: 'Form Completion (Done)',             column: 'col-submission-rationale', tags: [],                  notes: 'Provide URL, SHA hash, trace.json, transcript.txt, start.tar, and end.tar.' }
    ],
    snippets: [
      { id: 'po-snip-sequential-shutdown', title: 'Sequential shutdown',          category: 'Artifact Submission', body: '# In Claude Code:\n/exit\n# In the Trace Extractor window:\nCtrl+C', taskIds: ['as-sequential-shutdown'] },
      { id: 'po-snip-final-capture',      title: 'Capture final state (end.tar)', category: 'Artifact Submission', body: '# Exclude node_modules / .venv\ntar -cf <project>-end-claude.tar ./<project>', taskIds: ['as-final-capture'] }
    ]
  }
];

const SUPERSEDED_BOARD_ID = 'prompt-ops';

async function main() {
  const now = new Date().toISOString();

  // Remove the superseded single-board version (cascades its lanes/columns/
  // tasks and their snippet links).
  const allBoards = await db.getAllBoards();
  if (allBoards.some(b => b.id === SUPERSEDED_BOARD_ID)) {
    await db.deleteBoardCascade(SUPERSEDED_BOARD_ID);
    console.log(`Removed superseded single board "${SUPERSEDED_BOARD_ID}".`);
  }

  const allSnippets = [];

  for (const spec of BOARDS) {
    const boardId = spec.id;

    // Upsert the board row (does not touch other boards).
    await db.prisma.board.upsert({
      where: { id: boardId },
      create: { id: boardId, title: spec.title, description: spec.description, createdAt: now, updatedAt: now, isDefault: false },
      update: { title: spec.title, description: spec.description, updatedAt: now }
    });
    const existed = allBoards.some(b => b.id === boardId);
    console.log(`${existed ? 'Updated' : 'Created'} board "${boardId}".`);

    // Columns (workflow states) — replaced wholesale for this board.
    const workflow = spec.columns.map((c, i) => ({
      id: c.id,
      label: c.label,
      accent: c.accent,
      isComplete: !!c.isComplete,
      boardId,
      sortOrder: i
    }));
    await db.saveWorkflowForBoard(boardId, workflow);
    console.log(`  wrote ${workflow.length} column(s) for "${boardId}".`);

    // One default "general" lane per board. The lane id is board-scoped
    // (Lane.id is a global primary key) so it never collides with the default
    // board's "general" lane or with other prompt-ops boards.
    const laneId = `${boardId}-general`;
    const lanes = [{ id: laneId, boardId, label: 'general', accent: '#4FD1C5', sortOrder: 0 }];
    await db.saveLanesForBoard(boardId, lanes);

    // Tasks — replaced wholesale for this board.
    const taskRows = spec.tasks.map(t => ({
      id: t.id,
      title: t.title,
      column: t.column,
      laneId,
      boardId,
      repoName: '',
      repoUrl: '',
      agent: '',
      agentCustom: '',
      tags: t.tags || [],
      notes: t.notes || '',
      createdAt: now,
      updatedAt: now
    }));
    await db.saveTasksForBoard(boardId, taskRows);
    console.log(`  wrote ${taskRows.length} task(s) for "${boardId}".`);

    // Collect this board's snippets for the global library merge.
    for (const s of (spec.snippets || [])) {
      allSnippets.push({ ...s, type: 'snippet', lang: 'bash', createdAt: now, updatedAt: now });
    }
  }

  // Merge snippets into the library: drop previous prompt-ops snippets (id
  // prefix "po-snip-") and add the new set, preserving every other entry.
  const existingEntries = await db.getAllLibraryEntries();
  const kept = existingEntries.filter(e => !String(e.id).startsWith('po-snip-'));
  const merged = [...kept, ...allSnippets];
  const removed = existingEntries.length - kept.length;
  await db.saveAllLibraryEntries(merged);
  console.log(`Library: removed ${removed} old prompt-ops snippet(s), added ${allSnippets.length} new snippet(s), preserved ${kept.length} other entr(ies).`);

  console.log('Done.');
}

main().catch(err => {
  console.error('Failed to create boards:', err);
  process.exit(1);
});
