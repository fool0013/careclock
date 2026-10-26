// health log: blood pressure / sugar / weight, doctor appointments, questions to ask the doctor

import { t, fmtClock, fmtDate, fmtShort, fmtNum } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, uid, dateStr } from '../util.js';
import { store } from '../store.js';
import { lineChart } from '../charts.js';
import { buildICS, apptEvent } from '../ics.js';
import { on, session, toast, confirmBox, formData, download, telHref } from '../ui.js';
import { pageHead, canEdit } from './common.js';

// general reference ranges (AHA blood pressure categories, ADA glucose targets).
// always paired with "ask your doctor" because personal targets differ.
export function bpLevel(sys, dia) {
  if (sys >= 180 || dia >= 120) return 'crisis';
  if (sys >= 130 || dia >= 80) return 'high';
  if (sys < 90 || dia < 60) return 'low';
  if (sys >= 120) return 'elevated';
  return 'ok';
}
export function glucoseLevel(v) {
  if (v < 70) return 'low';
  if (v > 180) return 'high';
  return 'ok';
}
const LEVEL_STATUS = { ok: ['taken', 'check'], elevated: ['due', 'info'], high: ['due', 'alert'], low: ['due', 'alert'], crisis: ['late', 'alert'] };
const levelChip = (lv, key) => `<span class="status s-${LEVEL_STATUS[lv][0]}">${icon(LEVEL_STATUS[lv][1])}<span>${t(`${key}.${lv}`)}</span></span>`;

// weights are stored in the unit they were typed in; always show them in the current setting
const LB_PER_KG = 2.20462;
export const weightIn = (v, unit) => ((v.unit || 'lb') === unit ? v.value : unit === 'kg' ? v.value / LB_PER_KG : v.value * LB_PER_KG);
const wUnit = () => store.get().settings.weightUnit;
// value = what to plot / average (weight converted to the current unit)
export const readingValue = (v) => (v.type === 'weight' ? Math.round(weightIn(v, wUnit()) * 10) / 10 : v.value);
export const fmtReading = (v) => (v.type === 'bp' ? `${v.sys}/${v.dia}${v.pulse ? ` · ♥ ${v.pulse}` : ''}` : v.type === 'glucose' ? `${v.value} mg/dL` : `${fmtNum(readingValue(v), 1)} ${wUnit()}`);

function vitalsTab(s) {
  const type = session.vitalType;
  const list = s.vitals.filter((v) => v.type === type).sort((a, b) => a.at.localeCompare(b.at));
  const recent = list.slice(-30);
  const unit = s.settings.weightUnit;

  const inputs = {
    bp: `<div class="grid3"><div><label for="v-sys">${t('vit.sys')}</label><input id="v-sys" name="sys" type="number" inputmode="numeric" min="50" max="260" required></div>
      <div><label for="v-dia">${t('vit.dia')}</label><input id="v-dia" name="dia" type="number" inputmode="numeric" min="30" max="160" required></div>
      <div><label for="v-pulse">${t('vit.pulse')}</label><input id="v-pulse" name="pulse" type="number" inputmode="numeric" min="30" max="220"></div></div>`,
    glucose: `<label for="v-val">${t('vit.glucose')} (mg/dL)</label><input id="v-val" name="value" type="number" inputmode="numeric" min="20" max="600" required>`,
    weight: `<label for="v-val">${t('vit.weight')} (${unit})</label><input id="v-val" name="value" type="number" inputmode="decimal" step="0.1" min="40" max="700" required>`,
  }[type];

  let chart = '';
  if (recent.length) {
    const fmtX = (d) => fmtShort(d);
    if (type === 'bp') {
      const byT = Object.fromEntries(recent.map((v) => [+new Date(v.at), v]));
      chart = lineChart([
        { name: t('vit.sys'), cls: 's1', points: recent.map((v) => ({ t: new Date(v.at), y: v.sys })) },
        { name: t('vit.dia'), cls: 's2', points: recent.map((v) => ({ t: new Date(v.at), y: v.dia })) },
      ], { fmtX, tipFor: (d) => `${fmtShort(d)}: ${fmtReading(byT[+d])}` });
      chart += `<div class="legend"><span class="leg"><span class="key s1"></span>${t('vit.sys')}</span><span class="leg"><span class="key s2"></span>${t('vit.dia')}</span></div>`;
    } else {
      const byT = Object.fromEntries(recent.map((v) => [+new Date(v.at), v]));
      chart = lineChart([{ name: t(`vit.${type}`), cls: 's1', points: recent.map((v) => ({ t: new Date(v.at), y: readingValue(v) })) }], {
        fmtX, tipFor: (d) => `${fmtShort(d)}: ${fmtReading(byT[+d])}`, bands: type === 'glucose' ? [{ from: 70, to: 180 }] : [],
      });
      if (type === 'glucose') chart += `<div class="legend"><span class="leg"><span class="key band"></span>${t('vit.targetBand')}</span></div>`;
    }
  }

  const latest = list[list.length - 1];
  let flag = '';
  if (latest && type === 'bp') {
    const lv = bpLevel(latest.sys, latest.dia);
    flag = `<div class="latest">${t('vit.latest')}: <strong>${esc(fmtReading(latest))}</strong> ${levelChip(lv, 'bp')}</div>${lv === 'crisis' ? `<div class="banner bad">${icon('alert')} ${t('bp.crisisHelp')}</div>` : ''}`;
  } else if (latest && type === 'glucose') {
    const lv = glucoseLevel(latest.value);
    flag = `<div class="latest">${t('vit.latest')}: <strong>${esc(fmtReading(latest))}</strong> ${levelChip(lv, 'glu')}</div>`;
  } else if (latest) flag = `<div class="latest">${t('vit.latest')}: <strong>${esc(fmtReading(latest))}</strong></div>`;

  const rows = list.slice(-12).reverse().map((v) => {
    const d = new Date(v.at);
    const lv = v.type === 'bp' ? levelChip(bpLevel(v.sys, v.dia), 'bp') : v.type === 'glucose' ? levelChip(glucoseLevel(v.value), 'glu') : '';
    return `<tr><td>${esc(fmtShort(d))} ${esc(fmtClock(d))}</td><td class="num">${esc(fmtReading(v))}</td><td>${lv}</td>
      <td><button class="btn icon sm" type="button" data-act="delVital" data-id="${esc(v.id)}" aria-label="${esc(t('btn.delete'))}">${icon('trash')}</button></td></tr>`;
  }).join('');

  return `<div class="seg tabs" role="tablist">
      ${['bp', 'glucose', 'weight'].map((k) => `<button type="button" role="tab" aria-selected="${k === type}" data-act="vitalType" data-type="${k}">${t(`vit.${k}`)}</button>`).join('')}
    </div>
    <form class="card" id="vital-form"><h2>${t('vit.add')}</h2>${inputs}
      <button class="btn primary big" type="submit">${icon('plus')} ${t('btn.saveReading')}</button></form>
    ${list.length ? `<section class="card"><h2>${t(`vit.${type}`)}</h2>${flag}${chart}
      <table class="table stack-sm"><caption class="sr-only">${t(`vit.${type}`)}</caption><thead><tr><th>${t('vit.when')}</th><th>${t('vit.reading')}</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="disclaimer">${icon('info')} ${t('vit.disclaimer')}</p></section>` : `<p class="card muted">${t('vit.none')}</p>`}`;
}

function apptsTab(s) {
  const now = new Date();
  const sorted = s.appts.slice().sort((a, b) => a.at.localeCompare(b.at));
  const up = sorted.filter((a) => new Date(a.at) >= now);
  const past = sorted.filter((a) => new Date(a.at) < now).reverse().slice(0, 5);
  const card = (a) => {
    const d = new Date(a.at);
    return `<article class="card appt"><div class="appt-date"><span>${esc(fmtDate(d, { month: 'short' }))}</span><strong>${d.getDate()}</strong></div>
      <div class="grow"><h3>${esc(a.with)}</h3><p>${esc(fmtDate(d, { weekday: 'long' }))} · ${esc(fmtClock(d))}</p>${a.place ? `<p class="muted">${esc(a.place)}</p>` : ''}${a.notes ? `<p class="muted">${esc(a.notes)}</p>` : ''}
      <div class="row gap wrap">${a.phone ? `<a class="btn sm" href="${telHref(a.phone)}">${icon('phone')} ${t('btn.call')}</a>` : ''}
      <button class="btn sm" type="button" data-act="apptIcs" data-id="${esc(a.id)}">${icon('calendar')} ${t('btn.addCalendar')}</button>
      ${canEdit() ? `<button class="btn sm ghost" type="button" data-act="delAppt" data-id="${esc(a.id)}">${icon('trash')} ${t('btn.delete')}</button>` : ''}</div></div></article>`;
  };
  return `${up.length ? up.map(card).join('') : `<p class="card muted">${t('appt.none')}</p>`}
    <form class="card" id="appt-form"><h2>${t('appt.add')}</h2>
      <label for="a-with">${t('appt.with')} *</label><input id="a-with" name="with" required placeholder="${esc(t('appt.withPh'))}">
      <div class="grid2"><div><label for="a-date">${t('appt.date')} *</label><input id="a-date" name="date" type="date" required value="${dateStr()}"></div>
      <div><label for="a-time">${t('f.time')} *</label><input id="a-time" name="time" type="time" required value="10:00"></div></div>
      <label for="a-place">${t('appt.place')}</label><input id="a-place" name="place">
      <label for="a-phone">${t('appt.phone')}</label><input id="a-phone" name="phone" type="tel" inputmode="tel">
      <label for="a-notes">${t('f.notes')}</label><input id="a-notes" name="notes">
      <button class="btn primary big" type="submit">${icon('plus')} ${t('btn.save')}</button></form>
    ${past.length ? `<details class="card"><summary>${t('appt.past')}</summary>${past.map(card).join('')}</details>` : ''}`;
}

function questionsTab(s) {
  const items = s.questions.map((q) => `<li class="${q.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-q="${esc(q.id)}" ${q.done ? 'checked' : ''}><span>${esc(q.text)}</span></label>
    <button class="btn icon sm" type="button" data-act="delQ" data-id="${esc(q.id)}" aria-label="${esc(t('btn.delete'))}">${icon('trash')}</button></li>`).join('');
  return `<section class="card"><h2>${t('q.title')}</h2><p class="muted">${t('q.help')}</p>
    ${items ? `<ul class="qs">${items}</ul>` : ''}
    <form id="q-form" class="row gap"><label for="q-text" class="sr-only">${t('q.add')}</label><input id="q-text" name="text" class="grow" placeholder="${esc(t('q.ph'))}" required><button class="btn primary" type="submit">${icon('plus')} ${t('btn.add')}</button></form></section>`;
}

export function render() {
  const s = store.get();
  const tab = session.healthTab;
  const tabs = ['vitals', 'appts', 'questions'].map((k) => `<button type="button" role="tab" aria-selected="${k === tab}" data-act="healthTab" data-tab="${k}">${icon({ vitals: 'heart', appts: 'calendar', questions: 'question' }[k])} ${t(`health.${k}`)}</button>`).join('');
  return `${pageHead(t('health.title'))}<div class="seg tabs big-tabs" role="tablist">${tabs}</div>
    ${tab === 'vitals' ? vitalsTab(s) : tab === 'appts' ? apptsTab(s) : questionsTab(s)}`;
}

export function mount(root) {
  root.querySelector('#vital-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const type = session.vitalType;
    const v = { id: uid(), type, at: new Date().toISOString() };
    if (type === 'bp') Object.assign(v, { sys: +d.sys, dia: +d.dia, pulse: d.pulse ? +d.pulse : null });
    else Object.assign(v, { value: +d.value, unit: type === 'weight' ? store.get().settings.weightUnit : 'mg/dL' });
    if (!e.target.checkValidity() || (type === 'bp' && v.dia >= v.sys)) return toast(t('err.reading'));
    store.update((s) => s.vitals.push(v));
    toast(t('toast.saved'));
  });
  root.querySelector('#appt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!e.target.checkValidity()) return e.target.reportValidity();
    const d = formData(e.target);
    store.update((s) => s.appts.push({ id: uid(), at: `${d.date}T${d.time}`, with: d.with, place: d.place, phone: d.phone, notes: d.notes }));
    toast(t('toast.saved'));
  });
  root.querySelector('#q-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = e.target.elements.text.value.trim();
    if (text) store.update((s) => s.questions.push({ id: uid(), text, done: false }));
  });
  root.querySelectorAll('[data-q]').forEach((cb) => cb.addEventListener('change', () => store.update((s) => {
    const q = s.questions.find((x) => x.id === cb.dataset.q);
    if (q) q.done = cb.checked;
  })));
}

on('healthTab', (el) => { session.healthTab = el.dataset.tab; store.update(() => {}); });
on('vitalType', (el) => { session.vitalType = el.dataset.type; store.update(() => {}); });
on('delVital', async (el) => {
  if (await confirmBox(t('confirm.delete'), t('btn.delete'), true)) store.update((s) => (s.vitals = s.vitals.filter((v) => v.id !== el.dataset.id)));
});
on('delAppt', async (el) => {
  if (await confirmBox(t('confirm.delete'), t('btn.delete'), true)) store.update((s) => (s.appts = s.appts.filter((a) => a.id !== el.dataset.id)));
});
on('delQ', (el) => store.update((s) => (s.questions = s.questions.filter((q) => q.id !== el.dataset.id))));
on('apptIcs', (el) => {
  const a = store.get().appts.find((x) => x.id === el.dataset.id);
  if (a) download('appointment.ics', buildICS([apptEvent(a)]), 'text/calendar');
});
