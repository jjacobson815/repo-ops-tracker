import { askConfirm, showToast, openModal, closeModal } from './modal.js';

function getEl(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

let ctxRef = null;
let pendingDeleteId = null;
let staticWired = false;

function makeId(label, workflow) {
  const base = label.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'state';
  let id = base;
  let suffix = 2;
  while (workflow.some(state => state.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function hideDeletePanel() {
  pendingDeleteId = null;
  const panel = getEl('workflowDeletePanel');
  if (panel) panel.hidden = true;
}

function renderStateList() {
  const list = getEl('workflowStateList');
  if (!list || !ctxRef) return;
  const { workflow, tasks } = ctxRef.state;
  list.innerHTML = workflow.map((state, index) => {
    const count = tasks.filter(task => task.column === state.id).length;
    return `<div class="workflow-state">
      <span class="workflow-state-swatch" style="background:${state.accent}"></span>
      <input class="workflow-state-input" data-workflow-label="${state.id}" value="${escapeHtml(state.label)}" maxlength="40" aria-label="State name">
      <input class="workflow-state-color" type="color" data-workflow-color="${state.id}" value="${state.accent}" aria-label="State color">
      <span class="workflow-state-meta">${count} card${count === 1 ? '' : 's'}${state.isComplete ? ' · complete' : ''}</span>
      <label class="workflow-complete"><input type="checkbox" data-workflow-complete="${state.id}"${state.isComplete ? ' checked' : ''}> complete</label>
      <button class="btn ghost" data-move-workflow-state="${state.id}" data-direction="up"${index === 0 ? ' disabled' : ''}>up</button>
      <button class="btn ghost" data-move-workflow-state="${state.id}" data-direction="down"${index === workflow.length - 1 ? ' disabled' : ''}>down</button>
      <button class="btn ghost" data-save-workflow-state="${state.id}">save</button>
      <button class="btn danger" data-delete-workflow-state="${state.id}">delete</button>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-delete-workflow-state]').forEach(button => {
    button.addEventListener('click', () => beginDelete(button.dataset.deleteWorkflowState));
  });
  list.querySelectorAll('[data-save-workflow-state]').forEach(button => {
    button.addEventListener('click', () => saveState(button.dataset.saveWorkflowState));
  });
  list.querySelectorAll('[data-move-workflow-state]').forEach(button => {
    button.addEventListener('click', () => moveState(button.dataset.moveWorkflowState, button.dataset.direction));
  });
}

async function persistWorkflow(nextWorkflow, message) {
  const result = await ctxRef.saveWorkflow(nextWorkflow);
  if (!result.ok) {
    showToast(result.error || 'could not save workflow');
    return false;
  }
  ctxRef.state.workflow.splice(0, ctxRef.state.workflow.length, ...nextWorkflow);
  renderStateList();
  ctxRef.renderAll();
  showToast(message);
  return true;
}

async function saveState(stateId) {
  const label = getEl('workflowStateList')?.querySelector(`[data-workflow-label="${stateId}"]`)?.value.trim();
  const accent = getEl('workflowStateList')?.querySelector(`[data-workflow-color="${stateId}"]`)?.value;
  const isComplete = getEl('workflowStateList')?.querySelector(`[data-workflow-complete="${stateId}"]`)?.checked;
  if (!label) {
    showToast('state name required');
    return;
  }
  const nextWorkflow = ctxRef.state.workflow.map(state => state.id === stateId
    ? { ...state, label, accent, isComplete }
    : state);
  await persistWorkflow(nextWorkflow, 'workflow state saved');
}

async function moveState(stateId, direction) {
  const workflow = ctxRef.state.workflow;
  const index = workflow.findIndex(state => state.id === stateId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= workflow.length) return;
  const nextWorkflow = [...workflow];
  [nextWorkflow[index], nextWorkflow[targetIndex]] = [nextWorkflow[targetIndex], nextWorkflow[index]];
  await persistWorkflow(nextWorkflow, 'workflow reordered');
}

function beginDelete(stateId) {
  const { workflow, tasks } = ctxRef.state;
  const state = workflow.find(item => item.id === stateId);
  const alternatives = workflow.filter(item => item.id !== stateId);
  if (!state || alternatives.length === 0) {
    showToast('keep at least one workflow state');
    return;
  }

  pendingDeleteId = stateId;
  const count = tasks.filter(task => task.column === stateId).length;
  const message = getEl('workflowDeleteMessage');
  const select = getEl('workflowReplacementSelect');
  const wrap = getEl('workflowReplacementWrap');
  if (message) message.textContent = count
    ? `Move ${count} card${count === 1 ? '' : 's'} before deleting “${state.label}”.`
    : `Delete the empty “${state.label}” state?`;
  if (select) select.innerHTML = alternatives.map(item => `<option value="${item.id}">${escapeHtml(item.label)}</option>`).join('');
  if (wrap) wrap.hidden = count === 0;
  const panel = getEl('workflowDeletePanel');
  if (panel) panel.hidden = false;
}

async function confirmDelete() {
  if (!pendingDeleteId || !ctxRef) return;
  const state = ctxRef.state.workflow.find(item => item.id === pendingDeleteId);
  const count = ctxRef.state.tasks.filter(task => task.column === pendingDeleteId).length;
  const replacementStateId = getEl('workflowReplacementSelect')?.value;
  if (count && !replacementStateId) {
    showToast('choose a state for the cards');
    return;
  }
  askConfirm(`Delete “${state?.label || 'this'}”${count ? ` and move ${count} card${count === 1 ? '' : 's'}` : ''}?`, async () => {
    const result = await ctxRef.deleteWorkflowState(pendingDeleteId, replacementStateId);
    if (!result.ok) {
      showToast(result.error || 'could not delete state');
      return;
    }
    ctxRef.state.workflow.splice(0, ctxRef.state.workflow.length, ...result.workflow);
    if (count) {
      ctxRef.state.tasks.forEach(task => {
        if (task.column === pendingDeleteId) task.column = replacementStateId;
      });
    }
    hideDeletePanel();
    renderStateList();
    ctxRef.renderAll();
    showToast('workflow state deleted');
  });
}

async function addState() {
  const name = getEl('workflowStateName')?.value.trim();
  const accent = getEl('workflowStateColor')?.value || '#4FD1C5';
  if (!name) {
    showToast('state name required');
    return;
  }
  const workflow = ctxRef.state.workflow;
  const nextWorkflow = [...workflow, { id: makeId(name, workflow), label: name, accent, isComplete: false }];
  const saved = await persistWorkflow(nextWorkflow, 'workflow state added');
  if (!saved) return;
  getEl('workflowStateName').value = '';
}

function wireStatic() {
  getEl('manageWorkflowBtn')?.addEventListener('click', () => openWorkflowModal(ctxRef));
  getEl('workflowCloseBtn')?.addEventListener('click', closeWorkflowModal);
  getEl('addWorkflowStateBtn')?.addEventListener('click', addState);
  getEl('cancelDeleteWorkflowStateBtn')?.addEventListener('click', hideDeletePanel);
  getEl('confirmDeleteWorkflowStateBtn')?.addEventListener('click', confirmDelete);
}

export function initWorkflow(ctx) {
  ctxRef = ctx;
  if (!staticWired) {
    wireStatic();
    staticWired = true;
  }
}

export function openWorkflowModal(ctx) {
  ctxRef = ctx;
  hideDeletePanel();
  renderStateList();
  openModal('workflowModalOverlay');
}

export function closeWorkflowModal() {
  hideDeletePanel();
  closeModal('workflowModalOverlay');
}
