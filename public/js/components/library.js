// library.js — instructions library view + lib modal (Phase C2)
// Migrated from the single-file index.html renderLibrary / library modal.
// Imports only from ./modal.js; receives ctx (no circular import with app.js).

import { askConfirm, showToast } from './modal.js';

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

let ctxRef = null;
let staticWired = false;

function wireStatic(){
  const newLibBtn = getEl('newLibBtn');
  if(newLibBtn) newLibBtn.addEventListener('click', ()=> openLibModal(null, ctxRef));
  const saveBtn = getEl('libSaveBtn');
  if(saveBtn) saveBtn.addEventListener('click', ()=> saveLibFromModal(ctxRef));
  const cancelBtn = getEl('libCancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', ()=> closeLibModal(ctxRef));
  const delBtn = getEl('libDeleteBtn');
  if(delBtn) delBtn.addEventListener('click', ()=> deleteCurrentLib(ctxRef));
}

export function renderLibrary(state, ctx){
  ctxRef = ctx;
  if(!staticWired){ wireStatic(); staticWired = true; }

  const grid = getEl('libGrid');
  if(!grid) return;
  const q = (getEl('libSearch')?.value || '').toLowerCase();
  let items = [...state.library].sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt));
  if(q){
    items = items.filter(i =>
      (i.title||'').toLowerCase().includes(q) ||
      (i.category||'').toLowerCase().includes(q) ||
      (i.body||'').toLowerCase().includes(q)
    );
  }
  if(!items.length){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="big">no instructions saved yet</div>
      <div class="small">save the prompts you actually paste into agents so you stop retyping them.</div>
    </div>`;
    return;
  }
  grid.innerHTML = items.map(i=>`
    <div class="lib-card">
      <div class="cat">${escapeHtml(i.category)}</div>
      <div class="title">${escapeHtml(i.title)}</div>
      <div class="body-preview">${escapeHtml(i.body)}</div>
      <div class="lib-actions">
        <button class="btn" data-copy="${i.id}">copy</button>
        <button class="btn ghost" data-edit="${i.id}">edit</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=> copyLibBody(btn.dataset.copy, ctx));
  });
  grid.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=> openLibModal(btn.dataset.edit, ctx));
  });
}

export function openLibModal(id, ctx){
  const state = ctx.state;
  state.currentLibId = id;
  if(id){
    const i = state.library.find(x=>x.id===id);
    if(!i) return;
    getEl('libModalTitle').textContent = 'edit instruction';
    getEl('l-title').value = i.title || '';
    getEl('l-cat').value = i.category || 'Other';
    getEl('l-body').value = i.body || '';
    const delBtn = getEl('libDeleteBtn');
    if(delBtn) delBtn.style.display = 'inline-block';
  } else {
    getEl('libModalTitle').textContent = 'new instruction';
    getEl('l-title').value = '';
    getEl('l-cat').value = 'Orientation';
    getEl('l-body').value = '';
    const delBtn = getEl('libDeleteBtn');
    if(delBtn) delBtn.style.display = 'none';
  }
  const ov = getEl('libModalOverlay');
  if(ov) ov.classList.add('show');
  getEl('l-title')?.focus();
}

export function closeLibModal(ctx){
  const ov = getEl('libModalOverlay');
  if(ov) ov.classList.remove('show');
  if(ctx && ctx.state) ctx.state.currentLibId = null;
}

export function saveLibFromModal(ctx){
  const state = ctx.state;
  const title = getEl('l-title').value.trim();
  if(!title){ showToast('title required'); return; }
  const payload = {
    title,
    category: getEl('l-cat').value,
    body: getEl('l-body').value,
    updatedAt: nowIso()
  };
  if(state.currentLibId){
    const i = state.library.find(x=>x.id===state.currentLibId);
    if(i) Object.assign(i, payload);
  } else {
    payload.id = uid();
    payload.createdAt = nowIso();
    state.library.push(payload);
  }
  ctx.saveLibrary(state.library);
  ctx.renderAll();
  closeLibModal(ctx);
}

export function deleteCurrentLib(ctx){
  const state = ctx.state;
  if(!state.currentLibId) return;
  const i = state.library.find(x=>x.id===state.currentLibId);
  askConfirm(`Delete "${i ? i.title : 'this instruction'}"? This can't be undone.`, ()=>{
    state.library = state.library.filter(x=>x.id!==state.currentLibId);
    ctx.saveLibrary();
    ctx.renderAll();
    closeLibModal(ctx);
  });
}

export function copyLibBody(id, ctx){
  const i = ctx.state.library.find(x=>x.id===id);
  if(!i) return;
  navigator.clipboard.writeText(i.body)
    .then(()=> showToast('copied to clipboard'))
    .catch(()=> showToast('copy failed'));
}
