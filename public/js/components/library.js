// library.js — instructions library view + lib modal (Phase C2)
// Migrated from the single-file index.html renderLibrary / library modal.
// Imports only from ./modal.js; receives ctx (no circular import with app.js).

import { askConfirm, showToast, openModal, closeModal } from './modal.js';
import { mountAttachments } from './attachments.js';

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
  const typeSel = getEl('l-type');
  if(typeSel) typeSel.addEventListener('change', ()=>{
    const langField = getEl('l-lang-field');
    if(langField) langField.style.display = typeSel.value === 'snippet' ? 'block' : 'none';
  });
  // Part B: library view modal (read-only markdown popover) static handlers
  getEl('libViewCloseBtn')?.addEventListener('click', closeLibViewModal);
  getEl('libViewCopyBtn')?.addEventListener('click', () => {
    const id = ctxRef?.state?.currentLibViewId;
    if (id) copyLibBody(id, ctxRef);
  });
  getEl('libViewEditBtn')?.addEventListener('click', () => {
    const id = ctxRef?.state?.currentLibViewId;
    closeLibViewModal();
    if (id) openLibModal(id, ctxRef);
  });
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
  grid.innerHTML = items.map(i=>{
    const taskChips = (i.taskIds||[]).map(tid=>{
      const t = (ctx.state.tasks||[]).find(x=>x.id===tid);
      return t ? `<span class="lib-task-chip" data-task="${t.id}">${escapeHtml(t.title)}</span>` : '';
    }).join('');
    return `
    <div class="lib-card" data-id="${i.id}">
      <div class="cat">${escapeHtml(i.category)}${i.type==='snippet' ? ` · ${escapeHtml(i.lang||'snippet')}` : ''}</div>
      <div class="title">${escapeHtml(i.title)}</div>
      <div class="body-preview">${escapeHtml(i.body)}</div>
      ${taskChips ? `<div class="lib-task-chips">${taskChips}</div>` : ''}
      <div class="lib-actions">
        <button class="btn" data-copy="${i.id}">copy</button>
        <button class="btn ghost" data-edit="${i.id}">edit</button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=> copyLibBody(btn.dataset.copy, ctx));
  });
  grid.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=> openLibModal(btn.dataset.edit, ctx));
  });
  grid.querySelectorAll('[data-task]').forEach(chip=>{
    chip.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      if(ctx.goToTask) ctx.goToTask(chip.dataset.task);
    });
  });
  grid.querySelectorAll('.lib-card').forEach(cardEl => {
    cardEl.addEventListener('click', (ev) => {
      if (ev.target.closest('.lib-actions, .lib-task-chips')) return;
      openLibViewModal(cardEl.dataset.id, ctx);
    });
  });
}

// ---- Part B: read-only markdown popover ----

function renderMarkdown(body) {
  const raw = window.marked ? window.marked.parse(body || '') : escapeHtml(body || '');
  return window.DOMPurify ? window.DOMPurify.sanitize(raw) : escapeHtml(body || '');
}

export function openLibViewModal(id, ctx) {
  const i = ctx.state.library.find(x => x.id === id);
  if (!i) return;
  ctx.state.currentLibViewId = id;
  getEl('libViewCat').textContent = `${i.category}${i.type === 'snippet' ? ' · ' + (i.lang || 'snippet') : ''}`;
  getEl('libViewTitle').textContent = i.title;
  getEl('libViewBody').innerHTML = renderMarkdown(i.body);
  mountAttachments(getEl('libViewAttachments'), 'library', id, { readOnly: true });
  getEl('libViewModalOverlay')?.classList.add('show');
}

export function closeLibViewModal() {
  getEl('libViewModalOverlay')?.classList.remove('show');
}

export function openLibModal(id, ctx){
  const state = ctx.state;
  state.currentLibId = id;

  const taskSel = getEl('l-tasks');
  if(taskSel){
    taskSel.innerHTML = (state.tasks||[]).map(t=>
      `<option value="${t.id}">${escapeHtml(t.title)}</option>`
    ).join('');
  }

  if(id){
    const i = state.library.find(x=>x.id===id);
    if(!i) return;
    getEl('libModalTitle').textContent = 'edit instruction';
    getEl('l-title').value = i.title || '';
    getEl('l-cat').value = i.category || 'Other';
    getEl('l-body').value = i.body || '';
    getEl('l-type').value = i.type || 'instruction';
    getEl('l-lang').value = i.lang || 'bash';
    const langField = getEl('l-lang-field');
    if(langField) langField.style.display = (i.type === 'snippet') ? 'block' : 'none';
    if(taskSel){
      const linked = new Set(i.taskIds || []);
      [...taskSel.options].forEach(o => { o.selected = linked.has(o.value); });
    }
    const delBtn = getEl('libDeleteBtn');
    if(delBtn) delBtn.style.display = 'inline-block';
  } else {
    getEl('libModalTitle').textContent = 'new instruction';
    getEl('l-title').value = '';
    getEl('l-cat').value = 'Orientation';
    getEl('l-body').value = '';
    getEl('l-type').value = 'instruction';
    const langField = getEl('l-lang-field');
    if(langField) langField.style.display = 'none';
    if(taskSel){ [...taskSel.options].forEach(o => { o.selected = false; }); }
    const delBtn = getEl('libDeleteBtn');
    if(delBtn) delBtn.style.display = 'none';
  }
  const attachmentsContainer = getEl('libAttachments');
  if (attachmentsContainer) mountAttachments(attachmentsContainer, 'library', id || null);
  openModal('libModalOverlay');
  getEl('l-title')?.focus();
}

export function closeLibModal(ctx){
  closeModal('libModalOverlay');
  if(ctx && ctx.state) ctx.state.currentLibId = null;
}

export function saveLibFromModal(ctx){
  const state = ctx.state;
  const title = getEl('l-title').value.trim();
  if(!title){ showToast('title required'); return; }
  const taskSel = getEl('l-tasks');
  const taskIds = taskSel ? [...taskSel.selectedOptions].map(o=>o.value) : [];
  const type = getEl('l-type')?.value || 'instruction';
  const payload = {
    title,
    category: getEl('l-cat').value,
    body: getEl('l-body').value,
    type,
    lang: type === 'snippet' ? (getEl('l-lang')?.value || 'bash') : null,
    taskIds,
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
