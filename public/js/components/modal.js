// modal.js — shared confirm dialog, toast, status pill (Phase C2)
// Imports nothing from app.js or the other components (no circular deps).
// Also owns the click-outside-to-close behavior for all overlays and
// wires the confirm dialog buttons, replacing the old inline onclick handlers.

function getEl(id){ return document.getElementById(id); }

const MODAL_ANIMATION_MS = 150; // keep in sync with the animation durations in components.css §4
const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function openModal(overlayId) {
  const ov = getEl(overlayId);
  if (!ov) return;
  ov.classList.remove('closing');
  ov.classList.add('show');
}

export function closeModal(overlayId) {
  const ov = getEl(overlayId);
  if (!ov || !ov.classList.contains('show')) return;
  if (prefersReducedMotion()) {
    ov.classList.remove('show', 'closing');
    return;
  }
  ov.classList.add('closing');
  window.setTimeout(() => ov.classList.remove('show', 'closing'), MODAL_ANIMATION_MS);
}

let _confirmCallback = null;

export function askConfirm(message, onConfirm){
  const msgEl = getEl('confirmMessage');
  if(msgEl) msgEl.textContent = message;
  _confirmCallback = onConfirm;
  openModal('confirmOverlay');
}

export function closeConfirm(){
  closeModal('confirmOverlay');
  _confirmCallback = null;
}

export function showToast(msg){
  const t = getEl('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 1800);
}

export function flashStatus(msg){
  const p = getEl('statusPill');
  if(!p) return;
  p.textContent = msg;
  p.classList.add('show');
  clearTimeout(p._timer);
  p._timer = setTimeout(()=> p.classList.remove('show'), 1400);
}

// ---- wiring (module is deferred, so the DOM is already parsed) ----

// click-outside-to-close for all overlays
['taskModalOverlay', 'libModalOverlay', 'workflowModalOverlay', 'lanesModalOverlay',
 'libViewModalOverlay', 'confirmOverlay'].forEach(id => {
  const ov = getEl(id);
  if (ov) ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(id); });
});

// confirm dialog buttons
const confirmBtn = getEl('confirmDeleteBtn');
if(confirmBtn) confirmBtn.addEventListener('click', ()=>{
  if(_confirmCallback) _confirmCallback();
  closeConfirm();
});
const confirmCancel = getEl('confirmCancelBtn');
if(confirmCancel) confirmCancel.addEventListener('click', ()=> closeConfirm());
