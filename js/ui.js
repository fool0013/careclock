// shared ui plumbing: event delegation, dialogs, toasts, downloads.
// views put data-act="name" on buttons and register handlers with on('name', fn).

import { t } from './i18n.js';
import { icon } from './icons.js';
import { esc } from './util.js';

export const actions = {};
export const on = (name, fn) => (actions[name] = fn);

// per-tab ui memory that shouldn't be saved (which tab is open, caregiver unlocked, ...)
export const session = { unlocked: false, histDay: null, healthTab: 'vitals', vitalType: 'bp', checking: false };

export const go = (hash) => {
  if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};

let toastTimer;
export function toast(msg, undo) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button class="btn ghost sm" type="button">${icon('undo')} ${t('btn.undo')}</button>` : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 7000 : 3500);
}

// native <dialog>: focus trap, Esc to close and screen reader support for free
export function openDialog(html, { onMount, cls = '', onClose } = {}) {
  const d = document.getElementById('dialog');
  d.className = cls;
  d.innerHTML = `<button class="dialog-x" type="button" data-close aria-label="${esc(t('btn.close'))}">${icon('x')}</button>${html}`;
  d.onclick = (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  };
  d.onclose = () => onClose?.();
  if (!d.open) d.showModal();
  onMount?.(d);
  return d;
}

export const closeDialog = () => {
  const d = document.getElementById('dialog');
  if (d.open) d.close();
};

export function confirmBox(msg, okLabel = t('btn.ok'), danger = false) {
  return new Promise((res) => {
    let ok = false;
    openDialog(
      `<h2>${esc(msg)}</h2><div class="row gap end wrap"><button class="btn" type="button" data-close autofocus>${t('btn.cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" id="cb-ok">${esc(okLabel)}</button></div>`,
      { cls: 'small', onMount: (d) => (d.querySelector('#cb-ok').onclick = () => { ok = true; d.close(); }), onClose: () => res(ok) },
    );
  });
}

export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// share sheet on phones, clipboard elsewhere
export async function shareText(title, text) {
  try {
    if (navigator.share) return await navigator.share({ title, text });
    await navigator.clipboard.writeText(text);
    toast(t('toast.copied'));
  } catch { /* user closed the share sheet */ }
}

// read a form into a plain object (checkbox -> bool)
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  }
  return o;
}

export const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;
