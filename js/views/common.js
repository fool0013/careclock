// bits of markup several screens share

import { t, tn, fmtTime, fmtClock } from '../i18n.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { store } from '../store.js';
import { session } from '../ui.js';
import { daysLeft } from '../schedule.js';

export { FORMS } from '../sanitize.js';

// in simple mode, editing is locked behind the caregiver pin
export const canEdit = () => !store.get().settings.simple || session.unlocked;

export const amountText = (m) => tn(`form.${m.form || 'tablet'}`, Number(m.amount) || 1);

export const firstName = () => (store.get().profile.name || '').trim().split(/\s+/)[0];

export function scheduleText(m) {
  if (m.asNeeded) return t('sched.asNeeded');
  const times = (m.times || []).map(fmtTime).join(', ');
  const days = m.days?.length && m.days.length < 7 ? m.days.map((d) => t(`day.${d}`)).join(', ') : t('sched.everyDay');
  return `${times} · ${days}`;
}

export function foodChip(m) {
  if (m.withFood === 'with') return `<span class="chip">${icon('food')} ${t('food.with')}</span>`;
  if (m.withFood === 'empty') return `<span class="chip">${icon('food')} ${t('food.empty')}</span>`;
  return '';
}

const ST_ICON = { taken: 'check', skipped: 'skip', due: 'bell', late: 'alert', missed: 'x', upcoming: 'clock' };

// status always = icon + word, never color alone
export function statusChip(st, entry) {
  const label = st === 'taken' && entry ? t('st.takenAt', { time: fmtClock(new Date(entry.at)) }) : t(`st.${st}`);
  return `<span class="status s-${st}">${icon(ST_ICON[st])}<span>${esc(label)}</span></span>`;
}

export function supplyText(m) {
  if (m.quantity == null || m.quantity === '') return '';
  const d = daysLeft(m);
  const left = t('supply.left', { n: Number(m.quantity) });
  return d == null ? left : `${left} · ${t('supply.days', { n: d })}`;
}

export const emptyState = (iconName, title, body, btns = '') =>
  `<div class="empty">${icon(iconName, 'big')}<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="row gap center wrap">${btns}</div></div>`;

export const pageHead = (title, extra = '') => `<div class="page-head"><h1>${esc(title)}</h1>${extra}</div>`;
