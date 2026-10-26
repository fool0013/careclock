// home screen: what to take today, one big button per dose

import { t, tn, fmtTime, fmtClock, fmtDate, fmtRelative, fmtDuration, fmtNum } from '../i18n.js';
import { icon, pillArt } from '../icons.js';
import { esc, dateStr } from '../util.js';
import { store, markDose, undoDose, logPrn, undoPrn } from '../store.js';
import { dosesFor, statusOf, dayStats, needsRefill, daysLeft, nextDose, periodOf, prnStatus, minutesUntil } from '../schedule.js';
import { findInteractions, clip } from '../fda.js';
import { on, toast, openDialog, closeDialog, go, telHref, confirmBox } from '../ui.js';
import { speak, snooze, chime, notify } from '../reminders.js';
import { amountText, foodChip, statusChip, firstName, canEdit, emptyState } from './common.js';

const PERIOD_ICON = { morning: 'sunrise', afternoon: 'sun', evening: 'sunset', night: 'moon' };
const EARLY_CONFIRM_MIN = 60; // tapping Take more than an hour early asks first (double-dose guard)

const findDose = (key, date) => dosesFor(store.get().meds, date).find((d) => d.key === key);
const isDone = (st) => st === 'taken' || st === 'skipped';

const doseSpeech = (d) =>
  [t('speak.dose', { name: d.med.name, amount: amountText(d.med) }), d.med.withFood === 'with' ? t('food.with') : d.med.withFood === 'empty' ? t('food.empty') : '', d.med.instructions].filter(Boolean).join('. ');

// first emergency contact with a phone number, used for "text for help"
const helper = () => store.get().profile.contacts.find((c) => c.phone);
const smsHref = (phone, body) => `sms:${String(phone).replace(/[^\d+]/g, '')}?body=${encodeURIComponent(body)}`;
const helpText = (d) => t('help.textMsg', { med: `${d.med.name} ${d.med.strength}`.trim(), time: fmtTime(d.time) });

function greeting(now) {
  const h = now.getHours();
  const k = h < 12 ? 'greet.morning' : h < 17 ? 'greet.afternoon' : 'greet.evening';
  const n = firstName();
  return n ? t(k, { name: n }) : t(`${k}.noname`);
}

function doseCard(d, s, now) {
  const st = statusOf(d, s.log, now);
  const entry = s.log[d.date]?.[d.key];
  const data = `data-key="${esc(d.key)}" data-date="${d.date}"`;
  return `<li class="dose s-${st}">
    <div class="dose-when"><span class="dose-time">${fmtTime(d.time)}</span>${statusChip(st, entry)}</div>
    <div class="dose-what">
      ${pillArt(d.med)}
      <div class="dose-text">
        <h3 class="dose-name">${esc(d.med.name)} <span class="dose-strength">${esc(d.med.strength)}</span></h3>
        <p class="dose-amt">${esc(t('dose.take', { amount: amountText(d.med) }))}${foodChip(d.med)}</p>
        ${d.med.instructions ? `<p class="dose-note">${icon('info')} ${esc(d.med.instructions)}</p>` : ''}
      </div>
    </div>
    <div class="dose-actions">
      ${isDone(st)
        ? `<button class="btn ghost" type="button" data-act="undoDose" ${data}>${icon('undo')} ${t('btn.undo')}</button>`
        : `<button class="btn primary take" type="button" data-act="take" ${data}>${icon('check')} ${t('btn.take')}</button>
           <button class="btn" type="button" data-act="doseMore" ${data}>${t('btn.more')}</button>`}
      <button class="btn icon" type="button" data-act="say" ${data} aria-label="${esc(t('btn.readAloud'))}" title="${esc(t('btn.readAloud'))}">${icon('speaker')}</button>
    </div>
  </li>`;
}

function summary(s, now, doses) {
  const stats = dayStats(s.meds, s.log, dateStr(now), now);
  if (!doses.length) return '';
  const sts = doses.map((d) => statusOf(d, s.log, now));
  const counts = ['taken', 'due', 'late', 'skipped', 'upcoming'].map((k) => [k, sts.filter((x) => x === k).length]).filter(([, n]) => n);
  const open = doses.filter((d, i) => sts[i] === 'due' || sts[i] === 'late');
  const nd = nextDose(s.meds, s.log, now);
  let line = '';
  if (stats.taken + stats.skipped === stats.total) line = `<p class="summary-line good">${icon('check')} <span>${t('today.allDone')}</span></p>`;
  else if (open.length) {
    const msg = open.length === 1 ? t('today.now', { name: open[0].med.name }) : t('today.nowMany', { name: open[0].med.name, n: open.length - 1 });
    line = `<p class="summary-line">${icon('bell')} <span>${esc(msg)}</span></p>`;
  } else if (nd && nd.date === dateStr(now)) {
    line = `<p class="summary-line">${icon('clock')} <span>${esc(t('today.next', { name: nd.med.name, time: fmtTime(nd.time) }))} <span class="muted">(${esc(fmtRelative(minutesUntil(nd, now)))})</span></span></p>`;
  }
  // one segment per dose, in time order, colored by status (with a text legend, so never color alone)
  return `<section class="summary" aria-label="${esc(t('today.progressLabel'))}">
    <p class="summary-count"><strong>${stats.taken}</strong> ${esc(t('today.progress', { total: stats.total }))}</p>
    <div class="segbar${sts.length > 24 ? ' dense' : ''}" role="img" aria-label="${esc(counts.map(([k, n]) => `${t(`st.${k}`)}: ${n}`).join(', '))}">${sts.map((x) => `<span class="s-${x}"></span>`).join('')}</div>
    <p class="segbar-legend">${counts.map(([k, n]) => `<span class="leg"><span class="sw s-${k}"></span>${esc(t(`st.${k}`))} ${n}</span>`).join('')}</p>
    ${line}
  </section>`;
}

function banners(s, now) {
  const out = [];
  if (store.saveError) out.push(`<div class="banner bad">${icon('alert')}<span>${t('banner.saveError')}</span></div>`);
  const low = s.meds.filter((m) => !m.archived && needsRefill(m)).sort((a, b) => daysLeft(a) - daysLeft(b));
  const call = s.profile.pharmacyPhone ? `<a class="btn sm" href="${telHref(s.profile.pharmacyPhone)}">${icon('phone')} ${t('btn.callPharmacy')}</a>` : '';
  if (low.length > 2) {
    // many at once: one banner, so today's doses stay near the top
    const names = low.slice(0, 3).map((m) => m.name).join(', ') + (low.length > 3 ? ` ${t('banner.andMore', { n: low.length - 3 })}` : '');
    out.push(`<div class="banner ${daysLeft(low[0]) > 0 ? 'warn' : 'bad'}">${icon('alert')}<span>${esc(t('banner.refillMany', { n: low.length, names }))}</span>${call}</div>`);
  } else {
    for (const m of low) {
      const left = daysLeft(m);
      const msg = left > 0 ? t('banner.refill', { name: m.name, n: left }) : t('banner.refillOut', { name: m.name });
      out.push(`<div class="banner ${left > 0 ? 'warn' : 'bad'}">${icon('alert')}<span>${esc(msg)}</span>${call}</div>`);
    }
  }
  const found = findInteractions(s.meds).filter((f) => !s.dismissed.includes(`${f.a}|${f.b}`));
  if (found.length) out.push(`<a class="banner info" href="#/meds">${icon('shield')}<span>${esc(tn('banner.interactions', found.length))}</span>${icon('chevron')}</a>`);
  const soon = s.appts.filter((a) => new Date(a.at) > now && new Date(a.at) - now < 3 * 864e5).sort((a, b) => a.at.localeCompare(b.at))[0];
  if (soon) {
    const d = new Date(soon.at);
    out.push(`<a class="banner info" href="#/health">${icon('calendar')}<span>${esc(t('banner.appt', { who: soon.with, when: `${fmtDate(d, { weekday: 'long' })} ${fmtClock(d)}` }))}</span>${icon('chevron')}</a>`);
  }
  return out.join('');
}

function prnSection(s, now) {
  const meds = s.meds.filter((m) => m.asNeeded && !m.archived);
  if (!meds.length) return '';
  const today = dateStr(now);
  return `<section class="period-group"><h2 class="period">${icon('pill')} ${t('today.asNeeded')}</h2><ul class="dose-list">` + meds.map((m) => {
    const ps = prnStatus(m, s.prn, now);
    const last = ps.last;
    const lastTxt = last ? (dateStr(last) === today ? t('prn.lastToday', { time: fmtClock(last), n: ps.countToday }) : t('prn.lastDay', { date: fmtDate(last, { month: 'short', day: 'numeric' }) })) : t('prn.never');
    const limits = [m.minGap && t('prn.gapRule', { n: fmtNum(m.minGap, 1) }), m.maxPerDay && t('prn.maxRule', { n: m.maxPerDay })].filter(Boolean).join(' · ');
    let warn = '';
    if (ps.overMax) warn = `<p class="status s-late prn-warn">${icon('alert')}<span>${esc(t('prn.limitReached', { n: m.maxPerDay }))}</span></p>`;
    else if (ps.tooSoon) warn = `<p class="status s-due prn-warn">${icon('clock')}<span>${esc(t('prn.nextAt', { time: fmtClock(ps.nextAt) }))}</span></p>`;
    return `<li class="dose prn ${ps.overMax ? 's-late' : ps.tooSoon ? 's-due' : ''}">
      <div class="dose-when"><span class="dose-last">${esc(lastTxt)}</span>${warn}</div>
      <div class="dose-what">
        ${pillArt(m)}
        <div class="dose-text">
          <h3 class="dose-name">${esc(m.name)} <span class="dose-strength">${esc(m.strength)}</span></h3>
          <p class="dose-amt">${esc(amountText(m))}${m.purpose ? ` · ${esc(m.purpose)}` : ''}</p>
          ${limits ? `<p class="dose-note">${icon('shield')} ${esc(limits)}</p>` : ''}
          ${m.instructions ? `<p class="dose-note">${icon('info')} ${esc(m.instructions)}</p>` : ''}
        </div>
      </div>
      <div class="dose-actions"><button class="btn" type="button" data-act="prn" data-id="${esc(m.id)}">${icon('check')} ${t('btn.tookOne')}</button></div>
    </li>`;
  }).join('') + '</ul></section>';
}

export function render() {
  const s = store.get();
  const now = new Date();
  const today = dateStr(now);
  const doses = dosesFor(s.meds, today);
  const head = `<header class="hello"><h1>${esc(greeting(now))}</h1><p class="date">${esc(fmtDate(now))}</p></header>`;
  const help = `<button class="btn help-btn" type="button" data-act="help">${icon('phone')} ${t('btn.help')}</button>`;

  if (!s.meds.filter((m) => !m.archived).length) {
    const btns = canEdit()
      ? `<a class="btn primary" href="#/meds/new">${icon('plus')} ${t('btn.addMed')}</a><button class="btn" type="button" data-act="loadDemo">${t('btn.tryDemo')}</button>`
      : '';
    return head + banners(s, now) + emptyState('pill', t('today.emptyTitle'), t('today.emptyBody'), btns) + help;
  }

  const groups = {};
  for (const d of doses) (groups[periodOf(d.time)] ||= []).push(d);
  const list = ['morning', 'afternoon', 'evening', 'night'].filter((p) => groups[p]).map((p) =>
    `<section class="period-group"><h2 class="period">${icon(PERIOD_ICON[p])} ${t(`period.${p}`)}</h2><ul class="dose-list">${groups[p].map((d) => doseCard(d, s, now)).join('')}</ul></section>`).join('');

  return head + banners(s, now) + summary(s, now, doses) + (list || `<p class="card muted">${t('today.noneScheduled')}</p>`) + prnSection(s, now) + help;
}

// ---- actions ----

async function take(d) {
  // guard against taking tonight's dose this morning by mistake
  const early = minutesUntil(d);
  if (early > EARLY_CONFIRM_MIN && !(await confirmBox(t('confirm.early', { name: d.med.name, time: fmtTime(d.time) }), t('btn.takeAnyway')))) return;
  markDose(d, 'taken');
  toast(t('toast.taken', { name: d.med.name }), () => undoDose(d));
  const s = store.get();
  const st = dayStats(s.meds, s.log, d.date);
  if (st.total && st.taken + st.skipped === st.total) setTimeout(() => toast(t('today.allDone')), 1200);
}

on('take', (el) => {
  const d = findDose(el.dataset.key, el.dataset.date);
  if (d && !isDone(statusOf(d, store.get().log))) take(d);
});

on('undoDose', (el) => {
  const d = findDose(el.dataset.key, el.dataset.date);
  if (d) undoDose(d);
});

on('say', (el) => {
  const d = findDose(el.dataset.key, el.dataset.date);
  if (d) speak(doseSpeech(d), true);
});

on('prn', async (el) => {
  const s = store.get();
  const m = s.meds.find((x) => x.id === el.dataset.id);
  if (!m) return;
  // as-needed limits: confirm before going past what the label / doctor allows
  const ps = prnStatus(m, s.prn);
  if (ps.overMax && !(await confirmBox(t('confirm.prnOverMax', { name: m.name, n: ps.in24 }), t('btn.takeAnyway'), true))) return;
  if (!ps.overMax && ps.tooSoon && !(await confirmBox(t('confirm.prnTooSoon', { name: m.name, since: fmtDuration(ps.hoursSince * 60), gap: fmtNum(m.minGap, 1) }), t('btn.takeAnyway'), true))) return;
  const id = logPrn(m.id);
  toast(t('toast.taken', { name: m.name }), () => undoPrn(id));
});

on('doseMore', (el) => {
  const d = findDose(el.dataset.key, el.dataset.date);
  if (!d) return;
  const m = d.med;
  const h = helper();
  const late = statusOf(d, store.get().log) === 'late';
  const info = [m.purpose && `<p><strong>${t('f.purpose')}:</strong> ${esc(m.purpose)}</p>`, m.fda?.purpose && `<p class="muted small">${t('med.fdaSays')} ${esc(clip(m.fda.purpose, 300))}</p>`].filter(Boolean).join('');
  openDialog(`<div class="dlg-head">${pillArt(m, 64)}<div><h2>${esc(m.name)} ${esc(m.strength)}</h2><p>${fmtTime(d.time)} · ${esc(amountText(m))}</p></div></div>${info}
    <div class="stack">
      <button class="btn big" type="button" id="dm-snooze">${icon('snooze')} ${t('btn.snooze')}</button>
      <button class="btn big" type="button" id="dm-skip">${icon('skip')} ${t('btn.skip')}</button>
      <button class="btn big" type="button" id="dm-say">${icon('speaker')} ${t('btn.readAloud')}</button>
      ${late && h ? `<a class="btn big" href="${smsHref(h.phone, helpText(d))}">${icon('phone')} ${esc(t('help.text', { name: h.name }))}</a>` : ''}
      ${canEdit() ? `<a class="btn big" href="#/meds/${esc(m.id)}" data-close>${icon('edit')} ${t('btn.editMed')}</a>` : ''}
    </div>`, {
    onMount: (dlg) => {
      dlg.querySelector('#dm-snooze').onclick = () => { snooze([d]); closeDialog(); toast(t('toast.snoozed')); };
      dlg.querySelector('#dm-skip').onclick = () => { markDose(d, 'skipped'); closeDialog(); toast(t('toast.skipped', { name: m.name }), () => undoDose(d)); };
      dlg.querySelector('#dm-say').onclick = () => speak(doseSpeech(d), true);
    },
  });
});

on('help', () => {
  const p = store.get().profile;
  const people = p.contacts.filter((c) => c.phone).map((c) =>
    `<a class="btn big" href="${telHref(c.phone)}">${icon('phone')} ${esc(t('help.call', { name: c.name }))}${c.relation ? ` <span class="muted">(${esc(c.relation)})</span>` : ''}</a>`).join('');
  const doc = p.doctorPhone ? `<a class="btn big" href="${telHref(p.doctorPhone)}">${icon('phone')} ${esc(t('help.call', { name: p.doctor || t('f.doctor') }))}</a>` : '';
  openDialog(`<h2>${t('help.title')}</h2>
    <div class="stack">
      ${people}${doc}
      <a class="btn big danger" href="tel:911">${icon('phone')} ${t('help.911')}</a>
      <a class="btn big" href="#/card" data-close>${icon('card')} ${t('help.card')}</a>
    </div>
    ${!people ? `<p class="muted">${t('help.noContacts')}</p>` : ''}`);
});

// big "time for your medicine" popup fired by reminders.js
let pendingAlert = null;
export function showAlert(doses) {
  const dlg0 = document.getElementById('dialog');
  // never yank away something the person is in the middle of (help, a confirm...): wait for it to close
  if (dlg0.open && !dlg0.classList.contains('alert')) {
    pendingAlert = [...new Map([...(pendingAlert || []), ...doses].map((d) => [d.key, d])).values()];
    dlg0.addEventListener('close', () => {
      const next = pendingAlert;
      pendingAlert = null;
      const open = (next || []).filter((d) => !isDone(statusOf(d, store.get().log)));
      if (open.length) setTimeout(() => showAlert(open), 300);
    }, { once: true });
    return;
  }
  const names = doses.map((d) => d.med.name).join(', ');
  chime();
  navigator.vibrate?.([400, 200, 400, 200, 400]);
  speak(doses.length === 1 ? doseSpeech(doses[0]) : t('speak.many', { n: doses.length, names }));
  if (document.hidden) notify(t('alert.title'), names, 'dose');
  const h = helper();
  const lateOne = doses.find((d) => statusOf(d, store.get().log) === 'late');
  const rows = () => doses.map((d) => {
    const st = statusOf(d, store.get().log);
    return `<div class="alert-row">${pillArt(d.med, 56)}<div class="grow"><strong>${esc(d.med.name)} ${esc(d.med.strength)}</strong><div>${esc(amountText(d.med))} · ${fmtTime(d.time)}</div></div>
      ${isDone(st) ? statusChip(st, store.get().log[d.date]?.[d.key]) : `<button class="btn primary" type="button" data-k="${esc(d.key)}">${icon('check')} ${t('btn.take')}</button>`}</div>`;
  }).join('').replace('<button class="btn primary" type="button" data-k=', '<button class="btn primary" type="button" autofocus data-k=');
  openDialog(`<div class="alert-head">${icon('bell', 'big ring')}<h2>${t('alert.title')}</h2></div>
    <div class="alert-list">${rows()}</div>
    <div class="stack">
      ${doses.length > 1 ? `<button class="btn primary big" type="button" id="al-all">${icon('check')} ${t('btn.takeAll')}</button>` : ''}
      <button class="btn big" type="button" id="al-snooze">${icon('snooze')} ${t('btn.snooze')}</button>
      ${lateOne && h ? `<a class="btn big" href="${smsHref(h.phone, helpText(lateOne))}">${icon('phone')} ${esc(t('help.text', { name: h.name }))}</a>` : ''}
    </div>`, {
    cls: 'alert',
    onMount: (dlg) => {
      const refresh = () => {
        dlg.querySelector('.alert-list').innerHTML = rows();
        bindRows();
        if (doses.every((d) => isDone(statusOf(d, store.get().log)))) setTimeout(closeDialog, 900);
      };
      const bindRows = () => dlg.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => {
        const d = doses.find((x) => x.key === b.dataset.k);
        if (d && !isDone(statusOf(d, store.get().log))) markDose(d, 'taken');
        refresh();
      }));
      bindRows();
      dlg.querySelector('#al-all')?.addEventListener('click', () => {
        doses.forEach((d) => !isDone(statusOf(d, store.get().log)) && markDose(d, 'taken'));
        refresh();
      });
      dlg.querySelector('#al-snooze').onclick = () => { snooze(doses); closeDialog(); toast(t('toast.snoozed')); };
    },
  });
}

on('testAlert', () => {
  const s = store.get();
  const all = dosesFor(s.meds, dateStr());
  const d = all.find((x) => !isDone(statusOf(x, s.log))) || all[0];
  if (d) showAlert([d]);
  else toast(t('toast.noDoses'));
});

on('openToday', () => go('#/today'));
