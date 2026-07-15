// dashboard.js — dashboard view (Phase C2)
// Migrated from the single-file index.html renderDashboard().
// Reads state.tasks only; no mutation. Imports nothing from app.js (no cycle).
// Receives `ctx` (built in app.js) for the single source of truth COLUMNS.

function getEl(id){ return document.getElementById(id); }

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => {
    switch(c){
      case '&':  return '&' + 'amp;';
      case '<':  return '&' + 'lt;';
      case '>':  return '&' + 'gt;';
      case '"':  return '&' + 'quot;';
      case "'":  return '&' + '#39;';
    }
    return c;
  });
}

function relTime(iso){
  const diff = (Date.now() - new Date(iso).getTime())/1000;
  if(diff < 60) return 'just now';
  if(diff < 3600) return Math.floor(diff/60)+'m ago';
  if(diff < 86400) return Math.floor(diff/3600)+'h ago';
  return Math.floor(diff/86400)+'d ago';
}

// Kanban stages come from ctx.COLUMNS (the single source of truth in app.js),
// threaded in via the `ctx` argument — no local copy, no circular import.

export function renderDashboard(state, ctx){
  const tasks = state.tasks || [];
  // Normalize workflow states to the { id, label, accent, isComplete } shape.
  const wf = ctx.getWorkflow().map(s => ({ id: s.id, label: s.name, accent: s.color, isComplete: s.isComplete }));
  const completeIds = new Set(wf.filter(s=>s.isComplete).map(s=>s.id));
  const total = tasks.length;
  // Active = tasks in a non-complete state; complete = tasks in a complete state.
  const active = tasks.filter(t=>!completeIds.has(t.column)).length;
  const agentState = wf.find(s=>s.id==='agent-docs');
  const buildState = wf.find(s=>s.id==='build-touch');
  const inAgent = agentState ? tasks.filter(t=>t.column===agentState.id).length : 0;
  const inBuild = buildState ? tasks.filter(t=>t.column===buildState.id).length : 0;
  const doneCount = tasks.filter(t=>completeIds.has(t.column)).length;

  const statGrid = getEl('statGrid');
  if(statGrid) statGrid.innerHTML = `
    <div class="stat-card"><div class="num" style="color:var(--teal)">${total}</div><div class="label">total repos tracked</div></div>
    <div class="stat-card"><div class="num">${active}</div><div class="label">active (not complete)</div></div>
    <div class="stat-card"><div class="num" style="color:var(--amber)">${inAgent}</div><div class="label">agent generating docs</div></div>
    <div class="stat-card"><div class="num" style="color:var(--violet, #9B8FE0)">${inBuild}</div><div class="label">in build / code-touch</div></div>
    <div class="stat-card"><div class="num" style="color:var(--green)">${doneCount}</div><div class="label">complete</div></div>
  `;

  const stageBars = getEl('stageBars');
  if(stageBars){
    const maxStage = Math.max(1, ...wf.map(c=>tasks.filter(t=>t.column===c.id).length));
    stageBars.innerHTML = wf.map(c=>{
      const count = tasks.filter(t=>t.column===c.id).length;
      return `<div class="bar-row">
        <div class="bar-label">${c.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count/maxStage)*100}%;background:${c.accent}"></div></div>
        <div class="bar-count">${count}</div>
      </div>`;
    }).join('');
  }

  const agentBars = getEl('agentBars');
  if(agentBars){
    const agentCounts = {};
    tasks.forEach(t=>{
      const a = t.agent === 'Other' && t.agentCustom ? t.agentCustom : t.agent;
      if(!a) return;
      agentCounts[a] = (agentCounts[a]||0)+1;
    });
    const agentEntries = Object.entries(agentCounts).sort((a,b)=>b[1]-a[1]);
    const maxAgent = Math.max(1, ...agentEntries.map(e=>e[1]));
    agentBars.innerHTML = agentEntries.length ? agentEntries.map(([name,count])=>`
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count/maxAgent)*100}%;background:var(--teal)"></div></div>
        <div class="bar-count">${count}</div>
      </div>`).join('') : `<div class="empty-col">no tasks with an agent assigned yet</div>`;
  }

  const recent = [...tasks].sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0,6);
  const recentEl = getEl('recentActivity');
  if(recentEl) recentEl.innerHTML = recent.length ? recent.map(t=>{
    const colName = wf.find(s=>s.id===t.column)?.label || t.column;
    return `
    <div class="activity-item">
      <span class="t">${escapeHtml(t.title)}</span>
      <span class="meta">${escapeHtml(colName)} · ${relTime(t.updatedAt)}</span>
    </div>`;
  }).join('') : `<div class="empty-col">nothing tracked yet — add a task on the board</div>`;
}
