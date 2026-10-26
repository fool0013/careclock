// first launch: language -> text size -> name -> add a med or try sample data. 4 taps total.

import { t, LANGS, setLang, getLang } from '../i18n.js';
import { icon } from '../icons.js';
import { esc } from '../util.js';
import { store } from '../store.js';
import { on, go, session, actions } from '../ui.js';
import { legalLinks } from './legal.js';

const dots = (i) => `<div class="ob-dots" role="img" aria-label="${esc(t('ob.step', { n: i + 1, total: 4 }))}">${[0, 1, 2, 3].map((k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>`;

export function render() {
  const step = session.obStep || 0;
  const st = store.get().settings;
  const back = step ? `<button class="btn ghost" type="button" data-act="obBack">${icon('back')} ${t('btn.back')}</button>` : '<span></span>';
  let body;
  if (step === 0) {
    body = `<img class="ob-logo" src="icons/icon.svg" alt="" width="64" height="64"><h1>${t('ob.welcome')}</h1><p class="lead">${t('ob.tagline')}</p>
      <h2>${t('ob.chooseLang')}</h2>
      <div class="choices big">${LANGS.map((l) => `<button type="button" class="choice ${l.code === getLang() ? 'on' : ''}" lang="${l.code}" data-act="obLang" data-v="${l.code}">${esc(l.name)}</button>`).join('')}</div>
      <p class="ob-demo">${icon('users')} <button type="button" class="linklike" data-act="obDemo">${t('ob.justLooking')}</button></p>`;
  } else if (step === 1) {
    body = `<h1>${t('ob.sizeTitle')}</h1><p class="lead">${t('ob.sizeBody')}</p>
      <div class="choices big">${['m', 'l', 'xl'].map((v, i) => `<button type="button" class="choice ${st.size === v ? 'on' : ''}" data-act="obSize" data-v="${v}"><span style="font-size:${1 + i * 0.3}em">Aa</span> ${t(`size.${v}`)}</button>`).join('')}</div>
      <button class="btn primary big" type="button" data-act="obNext">${t('btn.next')} ${icon('chevron')}</button>`;
  } else if (step === 2) {
    body = `<h1>${t('ob.nameTitle')}</h1><p class="lead">${t('ob.nameBody')}</p>
      <form id="ob-name" class="stack"><label for="ob-n" class="sr-only">${t('profile.name')}</label><input id="ob-n" name="name" value="${esc(store.get().profile.name)}" autocomplete="name">
      <button class="btn primary big" type="submit">${t('btn.next')} ${icon('chevron')}</button>
      <button class="btn ghost" type="button" data-act="obNext">${t('btn.skip')}</button></form>`;
  } else {
    body = `<h1>${t('ob.readyTitle')}</h1><p class="lead">${t('ob.readyBody')}</p>
      <div class="stack">
        <button class="btn primary big" type="button" data-act="obAdd">${icon('plus')} ${t('btn.addFirst')}</button>
        <button class="btn big" type="button" data-act="obDemo">${icon('users')} ${t('btn.tryDemo')}</button>
      </div>
      <p class="ob-legal">${t('ob.agree')}</p>
      <nav class="footer-links" aria-label="${esc(t('legal.title'))}">${legalLinks()}</nav>
      <ul class="ob-points">
        <li>${icon('shield')} ${t('ob.point1')}</li><li>${icon('globe')} ${t('ob.point2')}</li><li>${icon('heart')} ${t('ob.point3')}</li>
      </ul>`;
  }
  return `<div class="onboarding">${dots(step)}${step ? `<div class="ob-top">${back}</div>` : ''}${body}</div>`;
}

export function mount(root) {
  root.querySelector('#ob-name')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    store.update((s) => (s.profile.name = name));
    next();
  });
  root.querySelector('#ob-n')?.focus();
}

function next() {
  session.obStep = (session.obStep || 0) + 1;
  store.update(() => {});
}

function finish() {
  store.update((s) => {
    s.settings.onboarded = true;
    s.settings.lang = getLang();
  });
}

on('obLang', (el) => {
  setLang(el.dataset.v);
  store.update((s) => (s.settings.lang = el.dataset.v));
  next();
});
on('obSize', (el) => store.update((s) => (s.settings.size = el.dataset.v)));
on('obNext', next);
on('obBack', () => {
  session.obStep = Math.max(0, (session.obStep || 0) - 1);
  store.update(() => {});
});
on('obAdd', () => {
  finish();
  go('#/meds/new');
});
on('obDemo', () => {
  finish();
  actions.loadDemo();
});
