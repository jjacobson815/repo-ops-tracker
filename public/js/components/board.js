// board.js — kanban board view + task modal (Phase C2)
// Migrated from the single-file index.html renderBoard / drag-drop / task modal.
// Imports only from ./modal.js; receives ctx (no circular import with app.js).

import { askConfirm, showToast, flashStatus } from './modal.js';

function getEl(id){ return document.getElementById(id); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function nowIso(){ return new Date().toISOString(); }
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

let dragTaskId = null;
let ctxRef = null;        // captured from renderBoard so static listeners can reach ctx
let staticWired = false;  // wire the static (non-rendered) buttons exactly once

function wireStatic(){
  const newTaskBtn = getEl('newTaskBtn');
  if(newTaskBtn) newTaskBtn.addEventListener('click', ()=> openTaskModal(null, 'backlog', ctxRef));

  // agent select toggles the custom-agent field
  const agentSel = getEl('f-agent');
  if(agentSel) agentSel.addEventListener('change', ()=>{
    const wrap = getEl('f-agent-custom-wrap');
    if(wrap) wrap.style.display = agentSel.value === 'Other' ? 'block' : 'none';
  });

  const saveBtn = getEl('taskSaveBtn');
  if(saveBtn) saveBtn.addEventListener('click', ()=> saveTaskFromModal(ctxRef));
  const cancelBtn = getEl('taskCancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=> closeTaskModal(ctxRef));
  const delBtn = getEl('taskDeleteBtn');
  if(delBtn) delBtn.addEventListener('click', ()=> deleteCurrentTask(ctxRef));
}

export function renderBoard(state, ctx){
  ctxRef = ctx;
  if(!staticWired){ wireStatic(); staticWired = true; }

  const boardEl = getEl('boardEl');
  if(!boardEl) return;
  const q = (getEl('boardSearch')?.value || '').toLowerCase();
  // Workflow states are the single source of truth now. Normalize them to the
  // { id, label, accent } shape the board rendering already expects.
  const COLUMNS = ctx.getWorkflow().map(s => ({ id: s.id, label: s.name, accent: s.color }));

  boardEl.innerHTML = COLUMNS.map(col=>{
    let colTasks = state.tasks.filter(t=>t.column===col.id);
    if(q){
      colTasks = colTasks.filter(t =>
        (t.title||'').toLowerCase().includes(q) ||
        (t.repoName||'').toLowerCase().includes(q) ||
        (t.tags||[]).join(' ').toLowerCase().includes(q)
      );
    }
    const cardsHtml = colTasks.length ? colTasks.map(t=>{
      const agentLabel = t.agent === 'Other' && t.agentCustom ? t.agentCustom : t.agent;
      const tagsHtml = (t.tags||[]).map(tag=>`<span class="chip">${escapeHtml(tag)}</span>`).join('');
      return `
      <div class="card" draggable="true" data-id="${t.id}">
        <div class="title">${escapeHtml(t.title)}</div>
        ${t.repoName ? `<div class="repo">${escapeHtml(t.repoName)}</div>` : ''}
        <div class="chips">
          ${agentLabel ? `<span class="chip agent">${escapeHtml(agentLabel)}</span>` : ''}
          ${tagsHtml}
        </div>
      </div>`;
    }).join('') : `<div class="empty-col">no cards</div>`;

    return `
    <div class="column">
      <div class="column-head" style="--accent:${col.accent}">
        <span class="prompt">${col.label}</span>
        <span class="count">${colTasks.length}</span>
      </div>
      <button class="btn column-add" data-col="${col.id}">+ add</button>
      <div class="column-body" data-col="${col.id}">
        ${cardsHtml}
      </div>
    </div>`;
  }).join('');

  // attach listeners (innerHTML was replaced, so re-bind every render)
  boardEl.querySelectorAll('.card').forEach(card=>{
    card.addEventListener('click', ()=> openTaskModal(card.dataset.id, null, ctx));
    card.addEventListener('dragstart', (e)=>{
      dragTaskId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });
    card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
  });

  boardEl.querySelectorAll('.column-add').forEach(btn=>{
    btn.addEventListener('click', ()=> openTaskModal(null, btn.dataset.col, ctx));
  });

  boardEl.querySelectorAll('.column-body').forEach(body=>{
    body.addEventListener('dragover', (e)=>{ e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', ()=> body.classList.remove('drag-over'));
    body.addEventListener('drop', (e)=>{
      e.preventDefault();
      body.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain') || dragTaskId;
      const colId = body.dataset.col;
      const task = state.tasks.find(t=>t.id===id);
      if(task && task.column !== colId){
        task.column = colId;
        task.updatedAt = nowIso();
        ctx.saveTasks();
        ctx.renderAll();
      }
      dragTaskId = null;
    });
  });
}

export function openTaskModal(id, defaultColumn, ctx){
  const state = ctx.state;
  state.currentTaskId = id;
  const colSelect = getEl('f-column');
  if(colSelect) colSelect.innerHTML = ctx.getWorkflow().map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  const customWrap = getEl('f-agent-custom-wrap');
  if(customWrap) customWrap.style.display = 'none';

  if(id){
    const t = state.tasks.find(x=>x.id===id);
    if(!t) return;
    getEl('taskModalTitle').textContent = 'edit task';
    getEl('f-title').value = t.title || '';
    getEl('f-repo').value = t.repoName || '';
    getEl('f-url').value = t.repoUrl || '';
    getEl('f-agent').value = t.agent || 'Claude';
    getEl('f-agent-custom').value = t.agentCustom || '';
    if(t.agent === 'Other' && customWrap) customWrap.style.display = 'block';
    if(colSelect) colSelect.value = t.column;
    getEl('f-tags').value = (t.tags||[]).join(', ');
    getEl('f-notes').value = t.notes || '';
    const delBtn = getEl('taskDeleteBtn');
    if(delBtn) delBtn.style.display = 'inline-block';
  } else {
    getEl('taskModalTitle').textContent = 'new task';
    getEl('f-title').value = '';
    getEl('f-repo').value = '';
    getEl('f-url').value = '';
    getEl('f-agent').value = 'Claude';
    getEl('f-agent-custom').value = '';
    if(colSelect) colSelect.value = defaultColumn || 'backlog';
    getEl('f-tags').value = '';
    getEl('f-notes').value = '';
    const delBtn = getEl('taskDeleteBtn');
    if(delBtn) delBtn.style.display = 'none';
  }
  const ov = getEl('taskModalOverlay');
  if(ov) ov.classList.add('show');
  getEl('f-title')?.focus();
}

export function closeTaskModal(ctx){
  const ov = getEl('taskModalOverlay');
  if(ov) ov.classList.remove('show');
  if(ctx && ctx.state) ctx.state.currentTaskId = null;
}

export function saveTaskFromModal(ctx){
  const state = ctx.state;
  const title = getEl('f-title').value.trim();
  if(!title){ showToast('title required'); return; }
  const tags = getEl('f-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const payload = {
    title,
    repoName: getEl('f-repo').value.trim(),
    repoUrl: getEl('f-url').value.trim(),
    agent: getEl('f-agent').value,
    agentCustom: getEl('f-agent-custom').value.trim(),
    column: getEl('f-column').value,
    tags,
    notes: getEl('f-notes').value,
    updatedAt: nowIso()
  };
  if(state.currentTaskId){
    const t = state.tasks.find(x=>x.id===state.currentTaskId);
    if(t) Object.assign(t, payload);
  } else {
    payload.id = uid();
    payload.createdAt = nowIso();
    state.tasks.push(payload);
  }
  ctx.saveTasks(state.tasks);
  ctx.renderAll();
  closeTaskModal(ctx);
}

export function deleteCurrentTask(ctx){
  const state = ctx.state;
  if(!state.currentTaskId) return;
  const t = state.tasks.find(x=>x.id===state.currentTaskId);
  askConfirm(`Delete "${t ? t.title : 'this task'}"? This can't be undone.`, ()=>{
    state.tasks = state.tasks.filter(x=>x.id!==state.currentTaskId);
    ctx.saveTasks();
    ctx.renderAll();
    closeTaskModal(ctx);
  });
}
