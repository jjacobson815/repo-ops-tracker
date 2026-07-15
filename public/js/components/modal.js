// modal.js — shared confirm dialog, toast, status pill (Phase C2)
// Imports nothing from app.js or the other components (no circular deps).
// Also owns the click-outside-to-close behavior for all three overlays and
// wires the confirm dialog buttons, replacing the old inline onclick handlers.

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

let _confirmCallback = null;
let _confirmOpts = {};

// askConfirm(message, onConfirm, opts?)
//   opts.destinationOptions: optional array of { id, name } — when provided, a
//   destination <select> is shown in the confirm dialog and the chosen value is
//   passed to onConfirm(dest) so the caller can reassign referenced items.
export function askConfirm(message, onConfirm, opts = {}){
  const msgEl = getEl('confirmMessage');
  if(msgEl) msgEl.textContent = message;
  _confirmCallback = onConfirm;
  _confirmOpts = opts || {};
  const destWrap = getEl('confirmDestWrap');
  const destSel = getEl('confirmDest');
  if(destWrap && destSel){
    if(_confirmOpts.destinationOptions && _confirmOpts.destinationOptions.length){
      destSel.innerHTML = _confirmOpts.destinationOptions
        .map(o=>`<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
      destWrap.style.display = 'block';
    } else {
      destWrap.style.display = 'none';
    }
  }
  const ov = getEl('confirmOverlay');
  if(ov) ov.classList.add('show');
}

export function closeConfirm(){
  const ov = getEl('confirmOverlay');
  if(ov) ov.classList.remove('show');
  _confirmCallback = null;
  _confirmOpts = {};
  const destWrap = getEl('confirmDestWrap');
  if(destWrap) destWrap.style.display = 'none';
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
['taskModalOverlay', 'libModalOverlay', 'confirmOverlay'].forEach(id=>{
  const ov = getEl(id);
  if(ov) ov.addEventListener('click', (e)=>{ if(e.target === ov) ov.classList.remove('show'); });
});

// confirm dialog buttons
const confirmBtn = getEl('confirmDeleteBtn');
if(confirmBtn) confirmBtn.addEventListener('click', ()=>{
  if(_confirmCallback){
    let dest = null;
    const destSel = getEl('confirmDest');
    if(destSel && _confirmOpts.destinationOptions && _confirmOpts.destinationOptions.length){
      dest = destSel.value;
    }
    _confirmCallback(dest);
  }
  closeConfirm();
});
const confirmCancel = getEl('confirmCancelBtn');
if(confirmCancel) confirmCancel.addEventListener('click', ()=> closeConfirm());
