// dashboard.js — dashboard view (Phase C2)
// Migrated from the single-file index.html renderDashboard().
// Reads state.tasks only; no mutation. Imports nothing from app.js (no cycle).

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

export function renderDashboard(state, ctx){
  const tasks = state.tasks || [];
  const COLUMNS = ctx.COLUMNS;
  const completeStateIds = new Set(COLUMNS.filter(column => column.isComplete).map(column => column.id));
  const total = tasks.length;
  const active = tasks.filter(t=>!completeStateIds.has(t.column)).length;
  const doneCount = tasks.filter(t=>completeStateIds.has(t.column)).length;
  const unassigned = tasks.filter(t=>!COLUMNS.some(column=>column.id===t.column)).length;

  const statGrid = getEl('statGrid');
  if(statGrid) statGrid.innerHTML = `
    <div class="stat-card"><div class="num" style="color:var(--teal)">${total}</div><div class="label">total repos tracked</div></div>
    <div class="stat-card"><div class="num">${active}</div><div class="label">active</div></div>
    <div class="stat-card"><div class="num" style="color:var(--green)">${doneCount}</div><div class="label">complete</div></div>
    <div class="stat-card"><div class="num" style="color:var(--violet, #9B8FE0)">${COLUMNS.length}</div><div class="label">workflow states</div></div>
    <div class="stat-card"><div class="num" style="color:var(--amber)">${unassigned}</div><div class="label">unassigned</div></div>
  `;

  const stageBars = getEl('stageBars');
  if(stageBars){
    const maxStage = Math.max(1, ...COLUMNS.map(c=>tasks.filter(t=>t.column===c.id).length));
    stageBars.innerHTML = COLUMNS.map(c=>{
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
  if(recentEl) recentEl.innerHTML = recent.length ? recent.map(t=>`
    <div class="activity-item">
      <span class="t">${escapeHtml(t.title)}</span>
      <span class="meta">${t.column} · ${relTime(t.updatedAt)}</span>
    </div>`).join('') : `<div class="empty-col">nothing tracked yet — add a task on the board</div>`;
}
