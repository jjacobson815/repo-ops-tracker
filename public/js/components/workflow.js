// workflow.js — workflow state management view (Phase C3)
// Manages the kanban workflow states: add / rename / recolor / toggle complete /
// reorder / delete. Reads the workflow via ctx.getWorkflow()/setWorkflow() and
// persists via ctx.saveWorkflow(). Every destructive action goes through
// askConfirm in modal.js (per AGENTS.md — never wire delete straight to a
// mutation). Imports only from ./modal.js and ../api.js; receives `ctx` (no
// circular import with app.js).

import { askConfirm, showToast, flashStatus } from './modal.js';
import { getTasks, deleteWorkflowState } from '../api.js';

function getEl(id){ return document.getElementById(id); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
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

let ctxRef = null;
let staticWired = false;

function wireStatic(){
  const addBtn = getEl('wfAddBtn');
  if(addBtn) addBtn.addEventListener('click', ()=> onAdd(ctxRef));
}

export function renderWorkflow(state, ctx){
  ctxRef = ctx;
  if(!staticWired){ wireStatic(); staticWired = true; }

  const list = getEl('workflowList');
  if(!list) return;
  const wf = ctx.getWorkflow();
  if(!wf.length){
    list.innerHTML = `<div class="empty-col">no workflow states — add one above.</div>`;
    return;
  }
  list.innerHTML = wf.map((s, idx)=>`
    <div class="wf-row" data-id="${escapeHtml(s.id)}">
      <span class="wf-swatch" style="background:${escapeHtml(s.color)}"></span>
      <input type="color" class="wf-color" value="${escapeHtml(s.color)}" data-id="${escapeHtml(s.id)}" title="state color">
      <input type="text" class="wf-name" value="${escapeHtml(s.name)}" data-id="${escapeHtml(s.id)}" placeholder="state name">
      <label class="wf-complete" title="mark as a completed / terminal state">
        <input type="checkbox" data-complete="${escapeHtml(s.id)}" ${s.isComplete ? 'checked' : ''}> complete
      </label>
      <div class="wf-move">
        <button class="wf-btn" data-up="${escapeHtml(s.id)}" ${idx===0?'disabled':''} title="move up">&#9650;</button>
        <button class="wf-btn" data-down="${escapeHtml(s.id)}" ${idx===wf.length-1?'disabled':''} title="move down">&#9660;</button>
      </div>
      <button class="btn danger wf-del" data-del="${escapeHtml(s.id)}" title="delete state">delete</button>
    </div>`).join('');

  // color: live-update the swatch on input (no re-render, keeps the picker open);
  // persist + re-render on change (picker closed).
  list.querySelectorAll('input.wf-color').forEach(inp=>{
    inp.addEventListener('input', ()=>{
      const row = inp.closest('.wf-row');
      const swatch = row && row.querySelector('.wf-swatch');
      if(swatch) swatch.style.background = inp.value;
    });
    inp.addEventListener('change', ()=> onFieldChange(inp.dataset.id, 'color', inp.value));
  });

  // name: persist on change (blur / enter) so we don't re-render mid-typing.
  list.querySelectorAll('input.wf-name').forEach(inp=>{
    inp.addEventListener('change', ()=> onFieldChange(inp.dataset.id, 'name', inp.value.trim()));
  });

  // complete toggle
  list.querySelectorAll('input[data-complete]').forEach(inp=>{
    inp.addEventListener('change', ()=> onFieldChange(inp.dataset.complete, 'isComplete', inp.checked));
  });

  // reorder
  list.querySelectorAll('button[data-up]').forEach(btn=>{
    btn.addEventListener('click', ()=> onMove(btn.dataset.up, 'up'));
  });
  list.querySelectorAll('button[data-down]').forEach(btn=>{
    btn.addEventListener('click', ()=> onMove(btn.dataset.down, 'down'));
  });

  // delete (goes through askConfirm)
  list.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=> onDelete(btn.dataset.del));
  });
}

function onAdd(ctx){
  const nameEl = getEl('wfName');
  const colorEl = getEl('wfColor');
  const name = (nameEl && nameEl.value || '').trim();
  if(!name){ showToast('name required'); return; }
  const color = (colorEl && colorEl.value) || '#4FD1C5';
  ctx.getWorkflow().push({ id: uid(), name, color, isComplete: false });
  if(nameEl) nameEl.value = '';
  ctx.saveWorkflow();
  ctx.renderAll();
}

function onFieldChange(id, field, value){
  const s = ctxRef.getWorkflow().find(x=>x.id===id);
  if(!s) return;
  s[field] = value;
  ctxRef.saveWorkflow();
  ctxRef.renderAll();
}

function onMove(id, dir){
  const wf = ctxRef.getWorkflow();
  const idx = wf.findIndex(s=>s.id===id);
  if(idx === -1) return;
  const swap = dir === 'up' ? idx - 1 : idx + 1;
  if(swap < 0 || swap >= wf.length) return;
  const tmp = wf[idx]; wf[idx] = wf[swap]; wf[swap] = tmp;
  ctxRef.saveWorkflow();
  ctxRef.renderAll();
}

function onDelete(id){
  const wf = ctxRef.getWorkflow();
  const s = wf.find(x=>x.id===id);
  if(!s) return;
  const cardCount = ctxRef.state.tasks.filter(t=>t.column===id).length;
  if(cardCount === 0){
    askConfirm(`Delete state "${s.name}"? This can't be undone.`, ()=> doDelete(id, null));
  } else {
    const others = wf.filter(x=>x.id!==id);
    askConfirm(
      `Delete state "${s.name}"? ${cardCount} card(s) reference it and will be reassigned to the chosen state.`,
      (dest)=> doDelete(id, dest),
      { destinationOptions: others }
    );
  }
}

async function doDelete(id, destination){
  try {
    const res = await deleteWorkflowState(id, destination || undefined);
    if(!res.ok){ showToast('delete failed'); return; }
    const data = await res.json();
    ctxRef.setWorkflow(data.workflow);
    // The server reassigns affected tasks to `destination`; refresh the
    // in-memory tasks so the board/dashboard reflect the reassignment.
    if(destination){
      const tasks = await getTasks();
      if(Array.isArray(tasks)) ctxRef.state.tasks = tasks;
    }
    ctxRef.renderAll();
    showToast('state deleted');
  } catch(e){
    showToast('delete failed');
  }
}
