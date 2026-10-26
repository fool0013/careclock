// "more" hub, settings, my info (profile + contacts), backup/restore, about

import { t, LANGS, setLang, getLang } from '../i18n.js';
import { icon } from '../icons.js';
import { esc, dateStr } from '../util.js';
import { store, defaults, VERSION } from '../store.js';
import { buildICS, medEvents, apptEvent } from '../ics.js';
import { buildDemo } from '../demo.js';
import { on, toast, go, session, confirmBox, openDialog, closeDialog, download, formData } from '../ui.js';
import { pageHead, canEdit, amountText } from './common.js';
import { refreshLabels } from './meds.js';
import { legalLinks } from './legal.js';
import { hashPin, checkPin, lockRemaining, recordFail, recordSuccess } from '../pin.js';

const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

const link = (href, ic, label, sub = '') => `<a class="link-row" href="${href}">${icon(ic)}<span class="grow"><strong>${esc(label)}</strong>${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}</span>${icon('chevron')}</a>`;

export function renderMore() {
  return `${pageHead(t('more.title'))}
    <div class="link-list">
      ${link('#/card', 'card', t('card.title'), t('more.cardSub'))}
      ${link('#/report', 'print', t('report.title'), t('more.reportSub'))}
      ${canEdit() ? link('#/profile', 'users', t('profile.title'), t('more.profileSub')) : ''}
    </div>
    <div class="link-list">
      ${link('#/settings', 'gear', t('settings.title'), t('more.settingsSub'))}
      ${link('#/about', 'shield', t('about.title'), t('more.aboutSub'))}
    </div>
    ${store.get().settings.simple && session.unlocked ? `<button class="btn big" type="button" data-act="lock">${icon('lock')} ${t('btn.lock')}</button>` : ''}
    <nav class="footer-links" aria-label="${esc(t('legal.title'))}">${legalLinks()}</nav>`;
}

const choice = (act, val, cur, label, extra = '') => `<button type="button" class="choice ${val === cur ? 'on' : ''}" data-act="${act}" data-v="${val}" aria-pressed="${val === cur}" ${extra}>${label}</button>`;
const toggle = (key, label, help = '') => `<label class="toggle"><span><strong>${esc(label)}</strong>${help ? `<span class="muted small">${esc(help)}</span>` : ''}</span><input type="checkbox" role="switch" data-setting="${key}" ${store.get().settings[key] ? 'checked' : ''}></label>`;

export function renderSettings() {
  const st = store.get().settings;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `${pageHead(t('settings.title'))}
  <section class="card"><h2>${icon('globe')} ${t('set.language')}</h2>
    <div class="choices">${LANGS.map((l) => choice('setLang', l.code, getLang(), esc(l.name), `lang="${l.code}"`)).join('')}</div></section>

  <section class="card"><h2>${t('set.textSize')}</h2>
    <div class="choices">${[['m', 'A'], ['l', 'A'], ['xl', 'A']].map(([v, a], i) => choice('setSize', v, st.size, `<span style="font-size:${1 + i * 0.3}em">${a}</span> ${t(`size.${v}`)}`)).join('')}</div>
    <p class="muted">${t('set.textSizeHelp')}</p></section>

  <section class="card"><h2>${t('set.theme')}</h2>
    <div class="choices">${['auto', 'light', 'dark', 'contrast'].map((v) => choice('setTheme', v, st.theme, t(`theme.${v}`))).join('')}</div></section>

  <section class="card"><h2>${icon('bell')} ${t('set.reminders')}</h2>
    ${toggle('reminders', t('set.remindersOn'), t('set.remindersHelp'))}
    ${toggle('sound', t('set.sound'))}
    ${toggle('voice', t('set.voice'))}
    <div class="stack">
      ${perm === 'default' ? `<button class="btn" type="button" data-act="askNotify">${icon('bell')} ${t('btn.allowNotify')}</button>` : ''}
      ${perm === 'denied' ? `<p class="muted small">${t('set.notifyDenied')}</p>` : ''}
      <button class="btn" type="button" data-act="testAlert">${icon('speaker')} ${t('btn.testReminder')}</button>
      <button class="btn" type="button" data-act="exportIcs">${icon('calendar')} ${t('btn.exportIcs')}</button>
      <p class="muted small">${t('set.icsHelp')}</p>
    </div></section>

  <section class="card"><h2>${t('set.units')}</h2>
    <div class="choices">${choice('setUnit', 'lb', st.weightUnit, 'lb')}${choice('setUnit', 'kg', st.weightUnit, 'kg')}</div></section>

  ${canEdit() ? `<section class="card"><h2>${icon('lock')} ${t('set.caregiver')}</h2>
    ${toggle('simple', t('set.simple'), t('set.simpleHelp'))}
    ${st.simple && !st.pin ? `<p class="banner warn">${icon('alert')}<span>${t('set.noPinWarn')}</span></p>` : ''}
    <form id="pin-form">
      <label for="pin">${t(st.pin ? 'set.pinChange' : 'set.pin')}</label>
      <div class="row gap wrap"><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="${esc(t('set.pinPh'))}" autocomplete="new-password" class="grow">
        <button class="btn" type="submit">${t('btn.save')}</button>
        ${st.pin ? `<button class="btn ghost" type="button" data-act="removePin">${icon('trash')} ${t('btn.removePin')}</button>` : ''}</div>
    </form>
    ${st.pin ? `<p class="good small">${icon('check')} ${t('set.pinIsSet')}</p>` : ''}
    <p class="muted small">${t('set.pinHelp')}</p></section>

  <section class="card"><h2>${icon('download')} ${t('set.data')}</h2>
    <p class="muted">${t('set.dataHelp')}</p>
    <div class="stack">
      <button class="btn" type="button" data-act="exportData">${icon('download')} ${t('btn.backup')}</button>
      <label class="btn">${icon('upload')} ${t('btn.restore')}<input type="file" accept="application/json,.json" id="restore" hidden></label>
      <button class="btn" type="button" data-act="loadDemo">${icon('users')} ${t('btn.tryDemo')}</button>
      <button class="btn danger" type="button" data-act="eraseAll">${icon('trash')} ${t('btn.erase')}</button>
    </div></section>` : ''}`;
}

export function mountSettings(root) {
  root.querySelector('#pin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = e.target.elements.pin.value.trim();
    // an empty Save must never silently remove the PIN; removing is its own button
    if (!/^\d{4,6}$/.test(pin)) return toast(t('err.pin'));
    const hashed = await hashPin(pin);
    store.update((s) => (s.settings.pin = hashed));
    toast(t('toast.pinSet'));
  });
  root.querySelector('#restore')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = ''; // let the same file be picked again
    if (!f) return;
    if (f.size > MAX_BACKUP_BYTES) return toast(t('err.restore'));
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.meds)) throw new Error('bad file');
      if (!(await confirmBox(t('confirm.restore'), t('btn.restore'), true))) return;
      store.replace(data);
      setLang(store.get().settings.lang || 'en');
      toast(t('toast.restored'));
      go('#/today');
    } catch {
      toast(t('err.restore'));
    }
  });
}

on('removePin', () => {
  store.update((s) => (s.settings.pin = ''));
  toast(t('toast.pinCleared'));
});

on('setLang', (el) => {
  setLang(el.dataset.v);
  store.update((s) => (s.settings.lang = el.dataset.v));
});
on('setSize', (el) => store.update((s) => (s.settings.size = el.dataset.v)));
on('setTheme', (el) => store.update((s) => (s.settings.theme = el.dataset.v)));
on('setUnit', (el) => store.update((s) => (s.settings.weightUnit = el.dataset.v)));

on('askNotify', async () => {
  const r = await Notification.requestPermission();
  toast(r === 'granted' ? t('toast.notifyOn') : t('set.notifyDenied'));
  store.update(() => {});
});

on('exportIcs', () => {
  const s = store.get();
  const describe = (m) => [t('dose.take', { amount: amountText(m) }), m.withFood !== 'none' ? t(`food.${m.withFood}`) : '', m.instructions].filter(Boolean).join(' · ');
  const now = new Date();
  const events = [...medEvents(s.meds, dateStr(), describe), ...s.appts.filter((a) => new Date(a.at) > now).map(apptEvent)];
  if (!events.length) return toast(t('toast.noDoses'));
  download('careclock-reminders.ics', buildICS(events), 'text/calendar');
  toast(t('toast.icsDone'));
});

on('exportData', async () => {
  // backups hold health info and leave the app's protection, so say so first
  if (!(await confirmBox(t('confirm.backup'), t('btn.backup')))) return;
  download(`careclock-backup-${dateStr()}.json`, JSON.stringify(store.get(), null, 1), 'application/json');
});

on('loadDemo', async () => {
  const s = store.get();
  if (s.meds.length && !(await confirmBox(t('confirm.demo'), t('btn.tryDemo'), true))) return;
  store.replace(buildDemo(new Date(), { ...s.settings, lang: getLang(), simple: false, pin: '' }));
  toast(t('toast.demo'));
  go('#/today');
  refreshLabels();
});

on('eraseAll', async () => {
  if (!(await confirmBox(t('confirm.erase'), t('btn.erase'), true))) return;
  const keep = { lang: getLang(), size: store.get().settings.size, theme: store.get().settings.theme };
  const d = defaults();
  d.settings = { ...d.settings, ...keep, onboarded: true };
  store.replace(d);
  toast(t('toast.erased'));
  go('#/today');
});

on('unlock', () => {
  const pin = store.get().settings.pin;
  if (!pin) {
    session.unlocked = true;
    return go('#/more');
  }
  openDialog(`<h2>${icon('lock')} ${t('pin.title')}</h2><form id="unlock-form" class="stack">
    <label for="unlock-pin">${t('pin.enter')}</label><input id="unlock-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="pin-input">
    <p class="form-error" id="pin-err" role="alert" hidden>${t('pin.wrong')}</p>
    <button class="btn primary big" type="submit">${t('btn.unlock')}</button></form>`, {
    cls: 'small',
    onMount: (d) => {
      d.querySelector('#unlock-pin').focus();
      const err = d.querySelector('#pin-err');
      d.querySelector('#unlock-form').onsubmit = async (e) => {
        e.preventDefault();
        const wait = lockRemaining();
        if (wait) {
          err.textContent = t('pin.locked', { n: wait });
          err.hidden = false;
          return;
        }
        if (await checkPin(d.querySelector('#unlock-pin').value, pin)) {
          recordSuccess();
          session.unlocked = true;
          closeDialog();
          go('#/more');
        } else {
          recordFail();
          d.querySelector('#unlock-pin').value = '';
          err.textContent = lockRemaining() ? t('pin.locked', { n: lockRemaining() }) : t('pin.wrong');
          err.hidden = false;
        }
      };
    },
  });
});

on('lock', () => {
  session.unlocked = false;
  go('#/today');
});

// ---------- my info ----------

export function renderProfile() {
  if (!canEdit()) return go('#/today'), '';
  const p = store.get().profile;
  const f = (name, label, type = 'text', extra = '') => `<div><label for="p-${name}">${label}</label><input id="p-${name}" name="${name}" type="${type}" value="${esc(p[name])}" ${extra}></div>`;
  const contacts = [0, 1, 2].map((i) => {
    const c = p.contacts[i] || {};
    return `<div class="grid3 contact"><div><label for="c-n${i}">${t('profile.cName')}</label><input id="c-n${i}" name="cname${i}" value="${esc(c.name)}"></div>
      <div><label for="c-r${i}">${t('profile.cRel')}</label><input id="c-r${i}" name="crel${i}" value="${esc(c.relation)}"></div>
      <div><label for="c-p${i}">${t('profile.cPhone')}</label><input id="c-p${i}" name="cphone${i}" type="tel" inputmode="tel" value="${esc(c.phone)}"></div></div>`;
  }).join('');
  return `${pageHead(t('profile.title'))}<p class="muted">${t('profile.help')}</p>
  <form id="profile-form" class="med-form">
    <fieldset class="card"><legend>${t('profile.about')}</legend><div class="grid2">
      ${f('name', t('profile.name'))}${f('dob', t('profile.dob'), 'date')}${f('blood', t('profile.blood'), 'text', 'placeholder="O+"')}</div>
      <label for="p-conditions">${t('profile.conditions')}</label><textarea id="p-conditions" name="conditions" rows="2">${esc(p.conditions)}</textarea>
      <label for="p-allergies">${t('profile.allergies')}</label><textarea id="p-allergies" name="allergies" rows="2">${esc(p.allergies)}</textarea></fieldset>
    <fieldset class="card"><legend>${t('profile.contacts')}</legend>${contacts}</fieldset>
    <fieldset class="card"><legend>${t('profile.care')}</legend><div class="grid2">
      ${f('doctor', t('f.doctor'))}${f('doctorPhone', t('profile.phone'), 'tel', 'inputmode="tel"')}${f('pharmacy', t('profile.pharmacy'))}${f('pharmacyPhone', t('profile.phone'), 'tel', 'inputmode="tel"')}</div>
      <label for="p-notes">${t('profile.notes')}</label><textarea id="p-notes" name="notes" rows="2">${esc(p.notes)}</textarea></fieldset>
    <div class="row gap sticky-actions"><button class="btn primary big grow" type="submit">${icon('check')} ${t('btn.save')}</button></div>
  </form>`;
}

export function mountProfile(root) {
  root.querySelector('#profile-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = formData(e.target);
    store.update((s) => {
      for (const k of ['name', 'dob', 'blood', 'conditions', 'allergies', 'doctor', 'doctorPhone', 'pharmacy', 'pharmacyPhone', 'notes']) s.profile[k] = d[k];
      s.profile.contacts = [0, 1, 2].map((i) => ({ name: d[`cname${i}`], relation: d[`crel${i}`], phone: d[`cphone${i}`] })).filter((c) => c.name || c.phone);
    });
    toast(t('toast.saved'));
    go('#/more');
  });
}

// ---------- about ----------

export function renderAbout() {
  return `${pageHead(t('about.title'))}
    <section class="card"><h2>${icon('shield')} ${t('about.privacyTitle')}</h2><p>${t('about.privacy')}</p></section>
    <section class="card"><h2>${icon('info')} ${t('about.medicalTitle')}</h2><p>${t('about.medical')}</p></section>
    <section class="card"><h2>${t('about.dataTitle')}</h2><p>${t('about.data')}</p>
      <p><a href="https://open.fda.gov/" target="_blank" rel="noopener">open.fda.gov</a></p></section>
    <section class="card"><h2>${t('about.offlineTitle')}</h2><p>${t('about.offline')}</p></section>
    <nav class="footer-links" aria-label="${esc(t('legal.title'))}">${legalLinks()}</nav>
    <p class="muted small">CareClock ${VERSION}.0 · ${t('about.made')}</p>`;
}
