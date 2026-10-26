// emergency card (with QR code paramedics can scan) + printable doctor report

import { t, fmtDate, fmtTime, fmtShort, fmtClock } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, dateStr, addDays, parseDate } from '../util.js';
import { store } from '../store.js';
import { adherence, dosesFor, statusOf, daysLeft } from '../schedule.js';
import { findInteractions } from '../fda.js';
import { pageHead, canEdit, amountText, scheduleText, emptyState } from './common.js';
import { fmtReading, bpLevel, readingValue } from './health.js';

// QR text stays in english on purpose: US paramedics/ER staff read it.
// plain text (not a link) so it works with any phone camera and no internet.
// detail 2 = full, 1 = no dose times, 0 = names only (used when there's too much for one QR code)
export function qrText(s, detail = 2) {
  const p = s.profile;
  const meds = s.meds.filter((m) => !m.archived);
  const L = ['EMERGENCY MEDICAL INFO', `Name: ${p.name || '-'}`];
  if (p.dob) L.push(`DOB: ${p.dob}`);
  if (p.blood) L.push(`Blood type: ${p.blood}`);
  L.push(`Allergies: ${p.allergies || 'none listed'}`);
  if (p.conditions) L.push(`Conditions: ${p.conditions}`);
  if (detail === 0) L.push(`Medications: ${meds.map((m) => m.name).join(', ')}`);
  else {
    L.push('Medications:');
    for (const m of meds) L.push(`- ${m.name} ${m.strength}${detail === 2 ? ` ${m.asNeeded ? '(as needed)' : `(${m.times.join(', ')})`}` : ''}`.replace(/\s+/g, ' ').trim());
  }
  for (const c of p.contacts) L.push(`Contact: ${c.name}${c.relation ? ` (${c.relation})` : ''} ${c.phone}`);
  if (p.doctor) L.push(`Doctor: ${p.doctor} ${p.doctorPhone}`);
  return L.join('\n');
}

// biggest QR a phone camera reads reliably is ~1,200 bytes, so step down the detail until it fits
const QR_MAX_BYTES = 1200;
function qrSvg(s) {
  if (typeof window.qrcode !== 'function') return '';
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  for (const detail of [2, 1, 0]) {
    const text = qrText(s, detail);
    if (new TextEncoder().encode(text).length > QR_MAX_BYTES) continue;
    try {
      const q = window.qrcode(0, 'M');
      q.addData(text, 'Byte');
      q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch { /* didn't fit, try less detail */ }
  }
  return '';
}

export function renderCard() {
  const s = store.get();
  const p = s.profile;
  const meds = s.meds.filter((m) => !m.archived);
  if (!p.name && !meds.length) {
    return pageHead(t('card.title')) + emptyState('card', t('card.emptyTitle'), t('card.emptyBody'), canEdit() ? `<a class="btn primary" href="#/profile">${icon('edit')} ${t('btn.addInfo')}</a>` : '');
  }
  const row = (label, val) => (val ? `<div class="kv"><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>` : '');
  return `${pageHead(t('card.title'), `<div class="row gap wrap no-print">${canEdit() ? `<a class="btn" href="#/profile">${icon('edit')} ${t('btn.edit')}</a>` : ''}<button class="btn primary" type="button" data-act="print">${icon('print')} ${t('btn.print')}</button></div>`)}
  <article class="ice-card">
    <header class="ice-head">${icon('heart')} <span>${t('card.banner')}</span></header>
    <div class="ice-body">
      <div class="ice-info">
        <h2>${esc(p.name || '—')}</h2>
        <dl>${row(t('profile.dob'), p.dob ? fmtDate(parseDate(p.dob), { year: 'numeric', month: 'long', day: 'numeric' }) : '')}${row(t('profile.blood'), p.blood)}
        ${row(t('profile.allergies'), p.allergies || t('card.noAllergies'))}${row(t('profile.conditions'), p.conditions)}</dl>
      </div>
      ${(() => { const q = qrSvg(s); return q ? `<figure class="ice-qr">${q}<figcaption>${t('card.scan')}</figcaption></figure>` : `<p class="ice-qr muted small">${t('card.qrTooLong')}</p>`; })()}
    </div>
    <h3>${t('card.meds')}</h3>
    <ul class="ice-meds">${meds.map((m) => `<li><strong>${esc(m.name)}</strong> ${esc(m.strength)} — ${esc(scheduleText(m))}${m.purpose ? ` <span class="muted">(${esc(m.purpose)})</span>` : ''}</li>`).join('')}</ul>
    <h3>${t('profile.contacts')}</h3>
    <ul class="ice-meds">${p.contacts.map((c) => `<li><strong>${esc(c.name)}</strong>${c.relation ? ` (${esc(c.relation)})` : ''} · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></li>`).join('') || `<li class="muted">${t('help.noContacts')}</li>`}
    ${p.doctor ? `<li><strong>${esc(p.doctor)}</strong> · ${esc(p.doctorPhone)}</li>` : ''}</ul>
  </article>
  <p class="muted small no-print">${t('card.tip')}</p>`;
}

// ---------- doctor report ----------

export function renderReport() {
  const s = store.get();
  const p = s.profile;
  const now = new Date();
  const today = dateStr(now);
  const from = addDays(today, -29);
  const meds = s.meds.filter((m) => !m.archived);
  const overall = adherence(meds, s.log, from, today, now);
  const byId = Object.fromEntries(meds.map((m) => [m.id, m]));
  if (!meds.length) {
    return pageHead(t('report.title')) + emptyState('print', t('report.emptyTitle'), t('report.emptyBody'), canEdit() ? `<a class="btn primary" href="#/meds/new">${icon('plus')} ${t('btn.addMed')}</a>` : '');
  }

  const medRows = meds.map((m) => {
    const a = m.asNeeded ? null : adherence([m], s.log, from, today, now);
    const prnN = m.asNeeded ? s.prn.filter((x) => x.medId === m.id && x.at.slice(0, 10) >= from).length : null;
    return `<tr><td><strong>${esc(m.name)}</strong> ${esc(m.strength)}</td><td>${esc(amountText(m))} · ${esc(scheduleText(m))}</td><td>${esc(m.purpose)}</td>
      <td class="num">${m.asNeeded ? esc(t('report.prnUses', { n: prnN })) : a.pct == null ? '—' : `${a.pct}%`}</td><td class="num">${esc(m.quantity ?? '—')}${daysLeft(m) != null ? ` (${esc(t('supply.days', { n: daysLeft(m) }))})` : ''}</td></tr>`;
  }).join('');

  // every missed dose in the last 2 weeks, so the doctor sees patterns (e.g. always the evening dose)
  const missed = [];
  for (let d = addDays(today, -13); d <= today; d = addDays(d, 1)) {
    for (const dose of dosesFor(meds, d)) if (['missed', 'late'].includes(statusOf(dose, s.log, now))) missed.push(`${fmtShort(parseDate(d))} ${fmtTime(dose.time)} — ${dose.med.name}`);
  }

  const inter = findInteractions(meds).map((f) => `<li><strong>${esc(byId[f.a].name)} + ${esc(byId[f.b].name)}</strong>: ${esc(f.excerpt)}</li>`).join('');

  const vit = (type) => s.vitals.filter((v) => v.type === type && v.at.slice(0, 10) >= from).sort((a, b) => a.at.localeCompare(b.at));
  const bp = vit('bp');
  const avg = (a, k) => Math.round(a.reduce((x, v) => x + v[k], 0) / a.length);
  const vitalsHtml = ['bp', 'glucose', 'weight'].map((type) => {
    const list = vit(type);
    if (!list.length) return '';
    const summary = type === 'bp' ? t('report.avgBp', { sys: avg(bp, 'sys'), dia: avg(bp, 'dia'), n: bp.length }) : t('report.avg', { v: fmtReading({ type, value: Math.round((list.reduce((x, v) => x + readingValue(v), 0) / list.length) * 10) / 10, unit: store.get().settings.weightUnit }), n: list.length });
    const highN = type === 'bp' ? bp.filter((v) => ['high', 'crisis'].includes(bpLevel(v.sys, v.dia))).length : 0;
    return `<h3>${t(`vit.${type}`)}</h3><p>${esc(summary)}${highN ? ` · ${esc(t('report.highN', { n: highN }))}` : ''}</p>
      <p class="small">${list.slice(-8).map((v) => `${esc(fmtShort(new Date(v.at)))}: ${esc(fmtReading(v))}`).join(' · ')}</p>`;
  }).join('');

  const qs = s.questions.filter((q) => !q.done).map((q) => `<li>☐ ${esc(q.text)}</li>`).join('');
  const nextAppt = s.appts.filter((a) => new Date(a.at) > now).sort((a, b) => a.at.localeCompare(b.at))[0];

  return `<div class="page-head no-print"><h1>${t('report.title')}</h1><button class="btn primary" type="button" data-act="print">${icon('print')} ${t('btn.print')}</button></div>
  <article class="report">
    <header><h1>${esc(t('report.heading', { name: p.name || '—' }))}</h1>
      <p>${p.dob ? `${t('profile.dob')}: ${esc(p.dob)} · ` : ''}${t('report.generated', { date: fmtDate(now, { year: 'numeric', month: 'long', day: 'numeric' }), time: fmtClock(now) })}</p>
      <p>${t('profile.allergies')}: <strong>${esc(p.allergies || t('card.noAllergies'))}</strong>${p.conditions ? ` · ${t('profile.conditions')}: ${esc(p.conditions)}` : ''}</p></header>
    <section><h2>${t('report.adherence')}</h2><p class="big-num">${overall.pct == null ? '—' : `${overall.pct}%`}</p><p>${esc(t('hist.dosesOf', { taken: overall.taken, total: overall.counted }))} · ${t('report.last30')}</p></section>
    <section><h2>${t('meds.title')}</h2><div class="table-wrap" tabindex="0" role="region" aria-label="${esc(t('meds.title'))}"><table class="table"><thead><tr><th>${t('report.med')}</th><th>${t('report.how')}</th><th>${t('f.purpose')}</th><th>${t('report.taken30')}</th><th>${t('report.left')}</th></tr></thead><tbody>${medRows}</tbody></table></div></section>
    <section><h2>${t('report.missed')}</h2>${missed.length ? `<ul class="cols">${missed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${t('report.noMissed')}</p>`}</section>
    ${inter ? `<section><h2>${t('safety.title')}</h2><ul>${inter}</ul><p class="small">${t('safety.disclaimer')}</p></section>` : ''}
    ${vitalsHtml ? `<section><h2>${t('health.vitals')}</h2>${vitalsHtml}</section>` : ''}
    ${qs ? `<section><h2>${t('q.title')}</h2><ul class="plain">${qs}</ul></section>` : ''}
    ${nextAppt ? `<p>${t('report.nextAppt')}: <strong>${esc(nextAppt.with)}</strong> · ${esc(fmtDate(new Date(nextAppt.at)))} ${esc(fmtClock(new Date(nextAppt.at)))}</p>` : ''}
    <footer class="small muted">${t('report.footer')}</footer>
  </article>`;
}
