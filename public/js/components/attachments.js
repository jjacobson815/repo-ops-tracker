// attachments.js — shared file-attachment widget for task/instruction modals.
// Deliberately the one component that reaches persistence directly (see app.js's
// contract comment) — fully self-contained, needs no ctx. Post-migration it
// talks to store.js (Dexie) instead of the deleted api.js fetch layer; still
// self-contained, still not routed through ctx.
//
// Note: the former api.attachmentDownloadUrl(id) was a SYNCHRONOUS URL builder
// (a server route). Binaries now live in IndexedDB, so the download href is a
// blob object URL resolved ASYNChronously before render (Rule 1 signature
// deviation, logged in MIGRATION-NOTES). Object URLs are revoked on re-mount.

import { showToast } from './modal.js';
import { getAttachments, uploadAttachment, deleteAttachment, attachmentObjectUrl } from '../store.js';

function escapeHtml(s) {
  return String(s || '').replace(/[&<"'>]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Track object URLs created for the current mount so they can be revoked when
// the widget re-renders or the modal is torn down (avoids leaking blob URLs).
let liveObjectUrls = [];
function revokeLiveUrls() {
  liveObjectUrls.forEach((url) => { try { URL.revokeObjectURL(url); } catch (_) { /* noop */ } });
  liveObjectUrls = [];
}

/**
 * @param {HTMLElement} container
 * @param {'task'|'library'} ownerType
 * @param {string|null} ownerId - null for an unsaved new task/entry.
 * @param {{ readOnly?: boolean }} [opts]
 */
export async function mountAttachments(container, ownerType, ownerId, opts = {}) {
  if (!container) return;
  const readOnly = !!opts.readOnly;

  revokeLiveUrls();

  if (!ownerId) {
    container.innerHTML = `<div class="attachments-empty">save first to attach files</div>`;
    return;
  }

  container.innerHTML = `<div class="attachments-list">loading…</div>`;
  let items = [];
  try {
    items = await getAttachments(ownerType, ownerId);
  } catch (e) {
    container.innerHTML = `<div class="attachments-empty">could not load attachments</div>`;
    return;
  }

  // Resolve a blob object URL per attachment before rendering (async).
  const withUrls = await Promise.all(items.map(async (a) => {
    const url = await attachmentObjectUrl(a.id);
    if (url) liveObjectUrls.push(url);
    return { ...a, url };
  }));

  const listHtml = withUrls.length
    ? withUrls.map(a => `
      <div class="attachment-chip">
        <a href="${a.url || '#'}" download="${escapeHtml(a.filename)}" target="_blank" rel="noopener">${escapeHtml(a.filename)}</a>
        <span class="attachment-size">${formatSize(a.size)}</span>
        ${readOnly ? '' : `<button class="attachment-remove" data-remove="${a.id}" aria-label="remove ${escapeHtml(a.filename)}">×</button>`}
      </div>`).join('')
    : `<div class="attachments-empty">no files attached</div>`;

  container.innerHTML = `
    <div class="attachments-list">${listHtml}</div>
    ${readOnly ? '' : `<input type="file" class="attachments-input" multiple hidden>
      <button class="btn ghost attachments-add">+ attach file</button>`}`;

  if (readOnly) return;

  const fileInput = container.querySelector('.attachments-input');
  container.querySelector('.attachments-add')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    for (const file of files) {
      try {
        await uploadAttachment(ownerType, ownerId, file);
      } catch (err) {
        showToast(err?.message || `upload failed: ${file.name}`);
      }
    }
    showToast('files attached');
    mountAttachments(container, ownerType, ownerId, opts);
  });
  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const removed = await deleteAttachment(btn.dataset.remove);
        if (!removed) { showToast('remove failed'); return; }
      } catch (_) {
        showToast('remove failed');
        return;
      }
      mountAttachments(container, ownerType, ownerId, opts);
    });
  });
}
