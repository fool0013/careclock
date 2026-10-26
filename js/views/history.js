// how well doses have been taken: stat tiles, 14-day chart, month calendar, per-med breakdown

import { t, fmtTime, fmtClock, fmtDate, fmtShort, fmtWeekday } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, dateStr, addDays, parseDate, at } from '../util.js';
import { store, markDose, undoDose } from '../store.js';
import { adherence, streak, dosesFor, statusOf, dayStats, nextDose } from '../schedule.js';
import { columnChart } from '../charts.js';
import { on, session, openDialog, shareText, toast } from '../ui.js';
import { statusChip, emptyState, pageHead, firstName } from './common.js';

const bucket = (pct) => (pct == null ? 'na' : pct === 100 ? 'full' : pct >= 75 ? 'most' : 'low');
const BUCKET_ICON = { full: 'check', most: 'info', low: 'alert' };

const tile = (label, value, sub = '') => `<div class="tile"><p class="tile-label">${esc(label)}</p><p class="tile-value">${value}</p>${sub ? `<p class="tile-sub">${esc(sub)}</p>` : ''}</div>`;

const FIX_DAYS = 7; // forgot to tap? fix doses from the past week

function dayDetail(s, ds, now) {
  const today = dateStr(now);
  const canFix = ds <= today && ds >= addDays(today, -(FIX_DAYS - 1));
  const doses = dosesFor(s.meds, ds);
  const prn = s.prn.filter((p) => dateStr(new Date(p.at)) === ds);
  let fixable = false;
  const rows = doses.map((d) => {
    const st = statusOf(d, s.log, now);
    const data = `data-key="${esc(d.key)}" data-date="${ds}"`;
    let acts = '';
    if (canFix && (st === 'missed' || st === 'late')) {
      fixable = true;
      acts = `<span class="fix"><button class="btn sm" type="button" data-act="fixDose" data-v="taken" ${data}>${icon('check')} ${t('hist.markTaken')}</button><button class="btn sm ghost" type="button" data-act="fixDose" data-v="skipped" ${data}>${t('hist.markSkipped')}</button></span>`;
    }
    return `<li><span class="dl-main"><strong>${esc(d.med.name)}</strong> <span class="muted">${fmtTime(d.time)}</span></span>${statusChip(st, s.log[ds]?.[d.key])}${acts}</li>`;
  });
  for (const p of prn) {
    const m = s.meds.find((x) => x.id === p.medId);
    rows.push(`<li><span class="dl-main"><strong>${esc(m?.name || '?')}</strong> <span class="muted">${t('sched.asNeeded')}</span></span>${statusChip('taken', p)}</li>`);
  }
  return `<section class="card" aria-live="polite"><h2>${esc(fmtDate(parseDate(ds)))}</h2>
    ${fixable ? `<p class="muted small">${t('hist.fixHelp')}</p>` : ''}
    ${rows.length ? `<ul class="day-list">${rows.join('')}</ul>` : `<p class="muted">${t('hist.noDoses')}</p>`}</section>`;
}

function calendar(days, selected) {
  // pad so the grid starts on sunday
  const lead = parseDate(days[0].date).getDay();
  const cells = Array(lead).fill('<span></span>');
  for (const d of days) {
    const b = bucket(d.pct);
    const label = d.pct == null ? `${fmtShort(parseDate(d.date))}` : `${fmtShort(parseDate(d.date))}: ${t('hist.pctTaken', { pct: d.pct })}`;
    cells.push(`<button type="button" class="cal b-${b} ${d.date === selected ? 'sel' : ''}" data-act="histDay" data-date="${d.date}" aria-label="${esc(label)}" aria-pressed="${d.date === selected}">
      <span class="cal-n">${parseDate(d.date).getDate()}</span>${b !== 'na' ? icon(BUCKET_ICON[b]) : ''}</button>`);
  }
  const heads = [0, 1, 2, 3, 4, 5, 6].map((i) => `<span class="cal-h">${t(`day.${i}`)}</span>`).join('');
  const legend = ['full', 'most', 'low'].map((b) => `<span class="leg"><span class="cal b-${b} mini">${icon(BUCKET_ICON[b])}</span>${t(`hist.leg.${b}`)}</span>`).join('');
  return `<div class="cal-grid">${heads}${cells.join('')}</div><div class="legend">${legend}</div>`;
}

export function render() {
  const s = store.get();
  const now = new Date();
  const today = dateStr(now);
  if (!s.meds.some((m) => !m.asNeeded)) return pageHead(t('hist.title')) + emptyState('chart', t('hist.emptyTitle'), t('hist.emptyBody'));

  const wk = adherence(s.meds, s.log, addDays(today, -6), today, now);
  const mo = adherence(s.meds, s.log, addDays(today, -29), today, now);
  const st = streak(s.meds, s.log, now);
  const pctTxt = (a) => (a.pct == null ? '—' : `${a.pct}%`);

  const last14 = mo.days.slice(-14);
  const chart = columnChart(last14.map((d, i) => ({
    value: d.pct,
    label: i % 2 === last14.length % 2 ? '' : fmtWeekday(parseDate(d.date)),
    tip: `${fmtShort(parseDate(d.date))}: ${d.pct == null ? t('hist.noDoses') : t('hist.tip', { taken: d.taken, total: d.taken + d.skipped + d.missed, pct: d.pct })}`,
  })));

  // calendar = last 5 weeks ending today
  const calFrom = addDays(today, -34);
  const cal = adherence(s.meds, s.log, calFrom, today, now).days;
  const sel = session.histDay || today;

  const perMed = s.meds.filter((m) => !m.asNeeded && !m.archived).map((m) => {
    const a = adherence([m], s.log, addDays(today, -29), today, now);
    const b = bucket(a.pct);
    return `<li><span class="grow"><strong>${esc(m.name)}</strong> <span class="muted">${esc(m.strength)}</span></span>
      <span class="pm-pct">${a.pct == null ? '—' : `${a.pct}%`}</span>
      <span class="meter thin b-${b}" role="img" aria-label="${esc(`${m.name}: ${a.pct ?? 0}%`)}"><span style="width:${a.pct ?? 0}%"></span></span></li>`;
  }).join('');

  return `${pageHead(t('hist.title'))}
    <div class="tiles">${tile(t('hist.week'), pctTxt(wk), t('hist.dosesOf', { taken: wk.taken, total: wk.counted }))}${tile(t('hist.month'), pctTxt(mo), t('hist.dosesOf', { taken: mo.taken, total: mo.counted }))}${tile(t('hist.streak'), String(st), t('hist.streakSub'))}</div>
    <section class="card"><h2>${t('hist.chartTitle')}</h2><p class="muted small">${t('hist.chartSub')}</p>${chart}</section>
    <section class="card"><h2>${t('hist.calTitle')}</h2>${calendar(cal, sel)}</section>
    ${dayDetail(s, sel, now)}
    <section class="card"><h2>${t('hist.perMed')}</h2><ul class="per-med">${perMed}</ul></section>
    <div class="row gap wrap">
      <button class="btn" type="button" data-act="shareDay">${icon('share')} ${t('btn.shareToday')}</button>
      <a class="btn" href="#/report">${icon('print')} ${t('btn.report')}</a>
    </div>`;
}

const doseAt = (el) => dosesFor(store.get().meds, el.dataset.date).find((d) => d.key === el.dataset.key);

on('fixDose', (el) => {
  const d = doseAt(el);
  if (!d) return;
  // record it at the scheduled time for past days, so the history reads sensibly
  const when = d.date < dateStr() ? at(d.date, d.time) : new Date();
  markDose(d, el.dataset.v, when);
  toast(t(el.dataset.v === 'taken' ? 'toast.taken' : 'toast.skipped', { name: d.med.name }), () => undoDose(d));
});

on('histDay', (el) => {
  session.histDay = el.dataset.date;
  store.update(() => {});
});

// plain-text daily summary a caregiver can get by text message
export function daySummary(now = new Date()) {
  const s = store.get();
  const ds = dateStr(now);
  const st = dayStats(s.meds, s.log, ds, now);
  const missed = dosesFor(s.meds, ds).filter((d) => ['missed', 'late'].includes(statusOf(d, s.log, now)));
  const nd = nextDose(s.meds, s.log, now);
  const lines = [
    `CareClock · ${firstName() || t('share.someone')} · ${fmtDate(now)}`,
    t('share.taken', { taken: st.taken, total: st.total }),
  ];
  if (missed.length) lines.push(`${t('share.missed')}: ${missed.map((d) => `${d.med.name} ${fmtTime(d.time)}`).join(', ')}`);
  if (nd && nd.date === ds) lines.push(`${t('share.next')}: ${nd.med.name} ${fmtTime(nd.time)}`);
  lines.push(`(${t('share.sentAt', { time: fmtClock(now) })})`);
  return lines.join('\n');
}

on('shareDay', () => {
  const text = daySummary();
  const contacts = store.get().profile.contacts.filter((c) => c.phone);
  openDialog(`<h2>${t('share.title')}</h2><pre class="share-preview">${esc(text)}</pre>
    <div class="stack">
      ${contacts.map((c) => `<a class="btn big" href="sms:${esc(c.phone.replace(/[^\d+]/g, ''))}?body=${encodeURIComponent(text)}">${icon('phone')} ${esc(t('share.textTo', { name: c.name }))}</a>`).join('')}
      <button class="btn big" type="button" id="sh-any">${icon('share')} ${t('btn.shareOther')}</button>
    </div>`, { onMount: (d) => (d.querySelector('#sh-any').onclick = () => shareText('CareClock', text)) });
});
