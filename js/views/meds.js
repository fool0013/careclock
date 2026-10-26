// medicine list, FDA safety check, and the add/edit form

import { t, fmtDate, speechLang } from '../i18n.js';
import { icon, pillArt, PILL_COLORS } from '../icons.js';
import { esc, uid, dateStr, addDays, parseDate } from '../util.js';
import { store } from '../store.js';
import { needsRefill } from '../schedule.js';
import { findInteractions, lifestyleFlags, lookupLabel, suggest, lookupNdc, clip } from '../fda.js';
import { on, toast, go, session, confirmBox, formData, openDialog, closeDialog } from '../ui.js';
import { FORMS, scheduleText, supplyText, canEdit, emptyState, pageHead, amountText } from './common.js';

const STALE_DAYS = 30;

// fetch FDA labels for any med that doesn't have a fresh one
export async function refreshLabels(force = false) {
  const todo = store.get().meds.filter((m) => !m.archived && (force || !m.fda || Date.now() - new Date(m.fda.fetchedAt) > STALE_DAYS * 864e5));
  if (!todo.length || session.checking) return;
  session.checking = true;
  store.update(() => {});
  let failed = false;
  for (const m of todo) {
    try {
      const label = await lookupLabel(m.name);
      store.update((s) => {
        const x = s.meds.find((y) => y.id === m.id);
        if (x) x.fda = label || { notFound: true, fetchedAt: new Date().toISOString() };
      });
    } catch {
      failed = true;
    }
  }
  session.checking = false;
  store.update(() => {});
  if (failed) toast(t('toast.offline'));
}

function safetyPanel(s) {
  const active = s.meds.filter((m) => !m.archived);
  if (active.length < 1) return '';
  const byId = Object.fromEntries(active.map((m) => [m.id, m]));
  const all = findInteractions(active);
  const shown = all.filter((f) => session.showDismissed || !s.dismissed.includes(`${f.a}|${f.b}`));
  const hiddenN = all.length - shown.length;
  const checked = active.filter((m) => m.fda);
  const missing = active.filter((m) => m.fda?.notFound);
  const lastCheck = checked.map((m) => m.fda.fetchedAt).sort().pop();

  const findings = shown.map((f) => {
    const A = byId[f.a], B = byId[f.b], src = byId[f.source];
    const pair = `${f.a}|${f.b}`;
    const reviewed = s.dismissed.includes(pair);
    return `<div class="finding ${f.strong ? 'strong' : ''}">
      <div class="finding-head">${icon('alert')}<strong>${esc(A.name)} + ${esc(B.name)}</strong>
        <span class="status ${f.strong ? 's-late' : 's-due'}">${icon(f.strong ? 'alert' : 'info')}<span>${t(f.strong ? 'safety.strong' : 'safety.mention')}</span></span></div>
      <blockquote>${esc(f.excerpt)}</blockquote>
      <p class="muted small">${esc(t('safety.source', { name: src.name }))}</p>
      <div class="row gap wrap">
        <button class="btn sm" type="button" data-act="askAbout" data-text="${esc(t('safety.question', { a: A.name, b: B.name }))}">${icon('question')} ${t('btn.addQuestion')}</button>
        ${canEdit() ? `<button class="btn sm ghost" type="button" data-act="dismiss" data-pair="${esc(pair)}">${icon(reviewed ? 'undo' : 'check')} ${t(reviewed ? 'btn.unreview' : 'btn.reviewed')}</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const flags = active.map((m) => {
    const f = lifestyleFlags(m);
    return f.length ? `<li><strong>${esc(m.name)}:</strong> ${f.map((k) => `<span class="chip">${t(`life.${k}`)}</span>`).join(' ')}</li>` : '';
  }).join('');

  let status;
  if (session.checking) status = `<p class="checking">${icon('search')} ${t('safety.checking')}</p>`;
  else if (!checked.length) status = `<p>${t('safety.intro')}</p>`;
  else if (!all.length) status = `<p class="good">${icon('check')} ${t('safety.none')}</p>`;
  else status = '';

  return `<section class="card safety" aria-labelledby="safety-h">
    <h2 id="safety-h">${icon('shield')} ${t('safety.title')}</h2>
    ${status}${findings}
    ${hiddenN ? `<button class="btn sm ghost" type="button" data-act="showDismissed">${t('safety.showReviewed', { n: hiddenN })}</button>` : ''}
    ${flags ? `<h3>${t('safety.lifestyle')}</h3><ul class="flags">${flags}</ul>` : ''}
    ${missing.length ? `<p class="muted small">${esc(t('safety.notFound', { names: missing.map((m) => m.name).join(', ') }))}</p>` : ''}
    <div class="row gap wrap">
      <button class="btn" type="button" data-act="checkFda" ${session.checking ? 'disabled' : ''}>${icon('search')} ${t(checked.length ? 'btn.checkAgain' : 'btn.checkNow')}</button>
      ${all.length ? `<a class="btn" href="#/report">${icon('print')} ${t('btn.printPharmacist')}</a>` : ''}
      ${lastCheck ? `<span class="muted small">${esc(t('safety.lastChecked', { date: fmtDate(new Date(lastCheck), { month: 'short', day: 'numeric' }) }))}</span>` : ''}
    </div>
    <p class="disclaimer">${icon('info')} ${t('safety.disclaimer')}</p>
  </section>`;
}

function medCard(m) {
  const inner = `${pillArt(m)}<div class="grow"><h3>${esc(m.name)} <span class="muted">${esc(m.strength)}</span></h3>
    <p>${esc(amountText(m))} · ${esc(scheduleText(m))}</p>
    ${m.purpose ? `<p class="muted">${esc(m.purpose)}</p>` : ''}
    ${!m.archived && m.endDate && m.endDate < dateStr() ? `<p><span class="chip">${icon('calendar')} ${esc(t('meds.ended', { date: fmtDate(parseDate(m.endDate), { month: 'short', day: 'numeric' }) }))}</span></p>` : ''}
    ${supplyText(m) ? `<p class="${needsRefill(m) ? 'warn-text' : 'muted'}">${needsRefill(m) ? icon('alert') : ''} ${esc(supplyText(m))}</p>` : ''}</div>`;
  return canEdit() ? `<a class="card med-card" href="#/meds/${esc(m.id)}">${inner}${icon('chevron')}</a>` : `<div class="card med-card">${inner}</div>`;
}

export function renderList() {
  const s = store.get();
  const active = s.meds.filter((m) => !m.archived);
  const old = s.meds.filter((m) => m.archived);
  const add = canEdit() ? `<a class="btn primary" href="#/meds/new">${icon('plus')} ${t('btn.add')}</a>` : '';
  if (!active.length && !old.length) {
    return pageHead(t('meds.title')) + emptyState('pill', t('today.emptyTitle'), t('meds.emptyBody'), add + (canEdit() ? `<button class="btn" type="button" data-act="loadDemo">${t('btn.tryDemo')}</button>` : ''));
  }
  return pageHead(t('meds.title'), add) + active.map(medCard).join('') + safetyPanel(s) +
    (old.length ? `<details class="card"><summary>${t('meds.stopped', { n: old.length })}</summary>${old.map(medCard).join('')}</details>` : '');
}

on('checkFda', () => refreshLabels(true));
on('showDismissed', () => { session.showDismissed = true; store.update(() => {}); });
on('dismiss', (el) => store.update((s) => {
  const p = el.dataset.pair;
  s.dismissed = s.dismissed.includes(p) ? s.dismissed.filter((x) => x !== p) : [...s.dismissed, p];
}));
on('askAbout', (el) => {
  const text = el.dataset.text;
  store.update((s) => { if (!s.questions.some((q) => q.text === text)) s.questions.push({ id: uid(), text, done: false }); });
  toast(t('toast.questionAdded'));
});

// ---------- add / edit form ----------

const blank = () => ({ minGap: null, maxPerDay: null, id: '', name: '', strength: '', form: 'tablet', amount: 1, shape: 'round', color: PILL_COLORS[0], photo: null, times: ['08:00'], days: [], asNeeded: false, withFood: 'none', instructions: '', quantity: null, refillAt: 7, prescriber: '', purpose: '', startDate: '', endDate: '', notes: '', archived: false, fda: null });

let draftFda = null; // label found while editing, saved with the med

const PRESETS = [['morning', '08:00'], ['noon', '12:00'], ['evening', '18:00'], ['bedtime', '21:00']];

const timeRow = (v) => `<div class="time-row"><input type="time" name="time" value="${v}" required aria-label="${esc(t('f.time'))}"><button class="btn icon" type="button" data-rm-time aria-label="${esc(t('btn.remove'))}">${icon('x')}</button></div>`;

function fdaBox(L) {
  if (!L) return '';
  if (L.notFound) return `<div class="fda-box muted">${icon('info')} ${t('med.fdaNotFound')}</div>`;
  return `<div class="fda-box">${icon('shield')}<div><strong>${t('med.fdaFound')}</strong> ${esc(L.generic || L.brands?.[0] || '')}
    ${L.purpose ? `<p class="small">${t('med.fdaSays')} ${esc(clip(L.purpose, 300))}</p>` : ''}
    ${L.boxed ? `<p class="small warn-text">${icon('alert')} <strong>${t('med.boxed')}</strong> ${esc(clip(L.boxed, 260))}</p>` : ''}</div></div>`;
}

export function renderForm(id) {
  if (!canEdit()) return go('#/today'), '';
  const s = store.get();
  const m = id === 'new' ? blank() : s.meds.find((x) => x.id === id);
  if (!m) return emptyState('pill', t('meds.notFound'), '', `<a class="btn" href="#/meds">${t('btn.back')}</a>`);
  draftFda = m.fda;
  const isNew = id === 'new';
  const someDays = m.days?.length > 0 && m.days.length < 7;
  const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const mic = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  return `${pageHead(t(isNew ? 'form.addTitle' : 'form.editTitle'))}
  <form class="med-form" id="med-form" novalidate>
    <fieldset class="card"><legend>${t('form.basics')}</legend>
      <label for="f-name">${t('f.name')} *</label>
      <div class="row gap wrap">
        <input id="f-name" name="name" value="${esc(m.name)}" required autocomplete="off" list="name-sugg" placeholder="${esc(t('f.namePh'))}" class="grow">
        ${mic ? `<button class="btn icon" type="button" id="f-mic" aria-label="${esc(t('btn.speakName'))}">${icon('mic')}</button>` : ''}
        <button class="btn" type="button" id="f-lookup">${icon('search')} ${t('btn.lookup')}</button>
      </div>
      <datalist id="name-sugg"></datalist>
      <button class="btn sm ghost scan-btn" type="button" id="f-ndc">${icon('barcode')} ${t('ndc.button')}</button>
      <div id="fda-out">${fdaBox(m.fda)}</div>
      <div class="grid2">
        <div><label for="f-strength">${t('f.strength')}</label><input id="f-strength" name="strength" value="${esc(m.strength)}" placeholder="10 mg"></div>
        <div><label for="f-purpose">${t('f.purpose')}</label><input id="f-purpose" name="purpose" value="${esc(m.purpose)}" placeholder="${esc(t('f.purposePh'))}"></div>
        <div><label for="f-form">${t('f.form')}</label><select id="f-form" name="form">${FORMS.map((f) => opt(f, m.form, t(`formName.${f}`))).join('')}</select></div>
        <div><label for="f-amount">${t('f.amount')}</label><input id="f-amount" name="amount" type="number" inputmode="decimal" min="0.25" step="0.25" value="${esc(m.amount)}"></div>
      </div>
    </fieldset>

    <fieldset class="card"><legend>${t('form.looks')}</legend>
      <p class="muted small">${t('form.looksHelp')}</p>
      <div class="row gap wrap center-v">
        <div id="art-preview">${pillArt(m, 72)}</div>
        <label class="btn">${icon('camera')} ${t('btn.photo')}<input type="file" accept="image/*" capture="environment" id="f-photo" hidden></label>
        <button class="btn ghost" type="button" id="f-photo-rm" ${m.photo ? '' : 'hidden'}>${icon('trash')} ${t('btn.removePhoto')}</button>
        <input type="hidden" name="photo" value="${esc(m.photo || '')}">
      </div>
      <div class="swatches" role="radiogroup" aria-label="${esc(t('f.color'))}">
        ${PILL_COLORS.map((c, i) => `<label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === m.color ? 'checked' : ''}><span class="sr-only">${t(`color.${i}`)}</span></label>`).join('')}
      </div>
      <div class="seg" role="radiogroup" aria-label="${esc(t('f.shape'))}">
        ${['round', 'oval'].map((sh) => `<label><input type="radio" name="shape" value="${sh}" ${m.shape === sh ? 'checked' : ''}><span>${t(`shape.${sh}`)}</span></label>`).join('')}
      </div>
    </fieldset>

    <fieldset class="card"><legend>${t('form.when')}</legend>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="asNeeded" value="no" ${m.asNeeded ? '' : 'checked'}><span>${t('f.scheduled')}</span></label>
        <label><input type="radio" name="asNeeded" value="yes" ${m.asNeeded ? 'checked' : ''}><span>${t('sched.asNeeded')}</span></label>
      </div>
      <div id="sched-box" ${m.asNeeded ? 'hidden' : ''}>
        <p class="label">${t('f.times')}</p>
        <div id="times">${(m.times.length ? m.times : ['08:00']).map(timeRow).join('')}</div>
        <div class="row gap wrap">
          ${PRESETS.map(([k, v]) => `<button class="btn sm" type="button" data-preset="${v}">${icon('plus')} ${t(`preset.${k}`)}</button>`).join('')}
        </div>
        <p class="label">${t('f.days')}</p>
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="dayMode" value="every" ${someDays ? '' : 'checked'}><span>${t('sched.everyDay')}</span></label>
          <label><input type="radio" name="dayMode" value="some" ${someDays ? 'checked' : ''}><span>${t('f.someDays')}</span></label>
        </div>
        <div class="days" id="days-box" ${someDays ? '' : 'hidden'}>
          ${[0, 1, 2, 3, 4, 5, 6].map((d) => `<label class="day"><input type="checkbox" name="day${d}" ${m.days?.includes(d) ? 'checked' : ''}><span>${t(`day.${d}`)}</span></label>`).join('')}
        </div>
      </div>
      <div id="prn-box" ${m.asNeeded ? '' : 'hidden'}>
        <div class="grid2">
          <div><label for="f-gap">${t('f.minGap')}</label><input id="f-gap" name="minGap" type="number" inputmode="decimal" min="0" max="72" step="0.5" value="${esc(m.minGap ?? '')}"></div>
          <div><label for="f-max">${t('f.maxPerDay')}</label><input id="f-max" name="maxPerDay" type="number" inputmode="numeric" min="1" max="48" step="1" value="${esc(m.maxPerDay ?? '')}"></div>
        </div>
        <p class="muted small">${t('f.prnHelp')}</p>
      </div>
      <label for="f-food">${t('f.food')}</label>
      <select id="f-food" name="withFood">${opt('none', m.withFood, t('food.none'))}${opt('with', m.withFood, t('food.with'))}${opt('empty', m.withFood, t('food.empty'))}</select>
      <label for="f-instr">${t('f.instructions')}</label>
      <input id="f-instr" name="instructions" value="${esc(m.instructions)}" placeholder="${esc(t('f.instructionsPh'))}">
    </fieldset>

    <fieldset class="card"><legend>${t('form.refill')}</legend>
      <div class="grid2">
        <div><label for="f-qty">${t('f.quantity')}</label><input id="f-qty" name="quantity" type="number" inputmode="numeric" min="0" value="${esc(m.quantity ?? '')}"></div>
        <div><label for="f-refill">${t('f.refillAt')}</label><input id="f-refill" name="refillAt" type="number" inputmode="numeric" min="0" value="${esc(m.refillAt ?? 7)}"></div>
        <div><label for="f-pres">${t('f.prescriber')}</label><input id="f-pres" name="prescriber" value="${esc(m.prescriber)}"></div>
        <div><label for="f-start">${t('f.start')}</label><input id="f-start" name="startDate" type="date" value="${esc(m.startDate)}"></div>
        <div><label for="f-end">${t('f.end')}</label><input id="f-end" name="endDate" type="date" value="${esc(m.endDate)}"></div>
      </div>
      <label for="f-notes">${t('f.notes')}</label>
      <textarea id="f-notes" name="notes" rows="2">${esc(m.notes)}</textarea>
    </fieldset>

    <p class="form-error" id="form-error" role="alert" hidden></p>
    <div class="row gap wrap sticky-actions">
      <button class="btn primary big grow" type="submit">${icon('check')} ${t('btn.save')}</button>
      <a class="btn big" href="#/meds">${t('btn.cancel')}</a>
    </div>
    ${isNew ? '' : `<div class="row gap wrap danger-zone">
      <button class="btn" type="button" data-act="archiveMed" data-id="${esc(m.id)}">${icon(m.archived ? 'undo' : 'skip')} ${t(m.archived ? 'btn.restart' : 'btn.stopMed')}</button>
      <button class="btn danger" type="button" data-act="deleteMed" data-id="${esc(m.id)}">${icon('trash')} ${t('btn.delete')}</button></div>`}
  </form>`;
}

// shrink a camera photo to a small square jpeg (keeps storage tiny)
function shrinkPhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const S = 240;
      const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
      const k = Math.max(S / img.width, S / img.height);
      const w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export function mountForm(root, id) {
  const form = root.querySelector('#med-form');
  if (!form) return;
  const $ = (sel) => form.querySelector(sel);
  const preview = () => {
    const d = formData(form);
    $('#art-preview').innerHTML = pillArt({ photo: d.photo || null, color: d.color, shape: d.shape, form: d.form }, 72);
  };
  form.addEventListener('change', preview);

  // name suggestions from FDA as you type
  let timer;
  $('#f-name').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const names = await suggest(e.target.value);
        $('#name-sugg').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
      } catch { /* offline: no suggestions */ }
    }, 350);
  });

  $('#f-lookup').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) return $('#f-name').focus();
    $('#fda-out').innerHTML = `<p class="checking">${icon('search')} ${t('safety.checking')}</p>`;
    try {
      draftFda = (await lookupLabel(name)) || { notFound: true, fetchedAt: new Date().toISOString() };
      $('#fda-out').innerHTML = fdaBox(draftFda);
    } catch {
      $('#fda-out').innerHTML = `<div class="fda-box muted">${icon('info')} ${t('toast.offline')}</div>`;
    }
  };

  // barcode / NDC: photo of the box (where the browser can read barcodes) or type the number
  $('#f-ndc').onclick = () => {
    const canScan = 'BarcodeDetector' in window;
    openDialog(`<h2>${icon('barcode')} ${t('ndc.title')}</h2><p>${t('ndc.help')}</p>
      ${canScan ? `<label class="btn big">${icon('camera')} ${t('ndc.photo')}<input type="file" accept="image/*" capture="environment" id="ndc-photo" hidden></label>` : ''}
      <form id="ndc-form" class="stack"><label for="ndc-num">${t('ndc.label')}</label>
        <input id="ndc-num" inputmode="numeric" autocomplete="off" placeholder="12345-678-90" maxlength="40">
        <p class="form-error" id="ndc-err" role="alert" hidden></p>
        <button class="btn primary big" type="submit">${icon('search')} ${t('ndc.find')}</button></form>`, {
      cls: 'small',
      onMount: (dlg) => {
        const err = dlg.querySelector('#ndc-err');
        const fail = (msg) => { err.textContent = msg; err.hidden = false; };
        const find = async (code) => {
          err.hidden = true;
          let r;
          try {
            r = await lookupNdc(code);
          } catch {
            return fail(t('toast.offline'));
          }
          if (!r) return fail(t('ndc.notFound'));
          $('#f-name').value = r.name;
          if (r.strength) $('#f-strength').value = r.strength;
          $('#f-form').value = r.form;
          preview();
          closeDialog();
          toast(t('ndc.found', { name: r.name }));
          $('#f-lookup').click(); // pull the FDA label too
        };
        dlg.querySelector('#ndc-form').onsubmit = (e) => {
          e.preventDefault();
          const v = dlg.querySelector('#ndc-num').value.trim();
          if (v) find(v);
        };
        dlg.querySelector('#ndc-photo')?.addEventListener('change', async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const det = new window.BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'code_128', 'data_matrix', 'qr_code'] });
            const codes = await det.detect(await createImageBitmap(f));
            if (!codes.length) return fail(t('ndc.noBarcode'));
            dlg.querySelector('#ndc-num').value = codes[0].rawValue;
            find(codes[0].rawValue);
          } catch {
            fail(t('ndc.noBarcode'));
          }
        });
        dlg.querySelector('#ndc-num').focus();
      },
    });
  };

  const micBtn = $('#f-mic');
  if (micBtn) micBtn.onclick = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.lang = speechLang();
    micBtn.classList.add('listening');
    rec.onresult = (e) => {
      $('#f-name').value = e.results[0][0].transcript.replace(/[.。]$/, '');
      $('#f-name').dispatchEvent(new Event('input'));
    };
    rec.onend = () => micBtn.classList.remove('listening');
    rec.start();
  };

  $('#f-photo').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    form.elements.photo.value = await shrinkPhoto(f);
    $('#f-photo-rm').hidden = false;
    preview();
  };
  $('#f-photo-rm').onclick = () => {
    form.elements.photo.value = '';
    $('#f-photo-rm').hidden = true;
    preview();
  };

  form.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) {
      const have = [...form.querySelectorAll('[name=time]')].map((i) => i.value);
      if (!have.includes(p.dataset.preset)) $('#times').insertAdjacentHTML('beforeend', timeRow(p.dataset.preset));
    }
    const rm = e.target.closest('[data-rm-time]');
    if (rm && form.querySelectorAll('.time-row').length > 1) rm.closest('.time-row').remove();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'asNeeded') {
      $('#sched-box').hidden = e.target.value === 'yes';
      $('#prn-box').hidden = e.target.value !== 'yes';
    }
    if (e.target.name === 'dayMode') $('#days-box').hidden = e.target.value !== 'some';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(form);
    const err = $('#form-error');
    const times = [...new Set([...form.querySelectorAll('[name=time]')].map((i) => i.value).filter(Boolean))].sort();
    const days = d.dayMode === 'some' ? [0, 1, 2, 3, 4, 5, 6].filter((i) => d[`day${i}`]) : [];
    const asNeeded = d.asNeeded === 'yes';
    let msg = '';
    if (!d.name) msg = t('err.name');
    else if (!asNeeded && !times.length) msg = t('err.times');
    else if (!asNeeded && d.dayMode === 'some' && !days.length) msg = t('err.days');
    else if (d.endDate && d.startDate && d.endDate < d.startDate) msg = t('err.dates');
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
      err.scrollIntoView({ block: 'center' });
      return;
    }
    const isNew = id === 'new';
    let nameChanged = false;
    store.update((s) => {
      const m = isNew ? { ...blank(), id: uid(), startDate: dateStr() } : s.meds.find((x) => x.id === id);
      nameChanged = m.name.toLowerCase() !== d.name.toLowerCase();
      Object.assign(m, {
        name: d.name, strength: d.strength, purpose: d.purpose, form: d.form, amount: Number(d.amount) || 1,
        photo: d.photo || null, color: d.color || m.color, shape: d.shape || 'round',
        asNeeded, times: asNeeded ? [] : times, days, withFood: d.withFood, instructions: d.instructions,
        quantity: d.quantity === '' ? null : Math.max(0, Number(d.quantity)), refillAt: d.refillAt === '' ? 7 : Math.max(0, Number(d.refillAt)),
        minGap: asNeeded && d.minGap !== '' ? Math.min(72, Math.max(0, Number(d.minGap))) : null,
        maxPerDay: asNeeded && d.maxPerDay !== '' ? Math.min(48, Math.max(1, Math.round(Number(d.maxPerDay)))) : null,
        prescriber: d.prescriber, startDate: d.startDate || m.startDate, endDate: d.endDate, notes: d.notes,
        fda: nameChanged && draftFda === m.fda ? null : draftFda,
      });
      if (isNew) s.meds.push(m);
    });
    toast(t('toast.saved'));
    go('#/meds');
    if (isNew || nameChanged) refreshLabels();
  });
}

on('archiveMed', (el) => {
  store.update((s) => {
    const m = s.meds.find((x) => x.id === el.dataset.id);
    m.archived = !m.archived;
    // stopped as of today: today's doses disappear, earlier history is kept.
    // restarting = a new course from today (so the stopped days don't count as missed)
    if (m.archived) m.endDate = addDays(dateStr(), -1);
    else {
      m.endDate = '';
      m.startDate = dateStr();
    }
  });
  go('#/meds');
});

on('deleteMed', async (el) => {
  const m = store.get().meds.find((x) => x.id === el.dataset.id);
  if (!(await confirmBox(t('confirm.deleteMed', { name: m.name }), t('btn.delete'), true))) return;
  store.update((s) => (s.meds = s.meds.filter((x) => x.id !== m.id)));
  go('#/meds');
});

