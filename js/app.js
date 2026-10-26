// entry point: routing, rendering, global events, reminders, service worker

import { store, prune } from './store.js';
import { setLang, detectLang, t, fmtClock } from './i18n.js';
import { actions, session } from './ui.js';
import { icon } from './icons.js';
import { bindCharts } from './charts.js';
import { startReminders } from './reminders.js';
import * as today from './views/today.js';
import * as meds from './views/meds.js';
import * as historyView from './views/history.js';
import * as health from './views/health.js';
import * as settings from './views/settings.js';
import * as card from './views/card.js';
import * as onboarding from './views/onboarding.js';
import * as legal from './views/legal.js';

// clickjacking guard: never run inside another site's frame (reading top.location throws cross-origin)
let framedByOther = false;
try {
  framedByOther = window.top !== window.self && window.top.location.origin !== location.origin;
} catch {
  framedByOther = true;
}
if (framedByOther) {
  document.body.innerHTML = '<p class="frame-block">For your safety, CareClock only runs in its own window. <a href="./" target="_top">Open CareClock</a></p>';
  throw new Error('framed');
}

// form: true = never re-render underneath someone who is typing
const ROUTES = {
  today: { render: today.render, nav: 'today', title: 'nav.today' },
  meds: { render: (id) => (id ? meds.renderForm(id) : meds.renderList()), mount: (el, id) => id && meds.mountForm(el, id), nav: 'meds', title: 'nav.meds', form: (id) => !!id },
  history: { render: historyView.render, nav: 'history', title: 'nav.history' },
  health: { render: health.render, mount: health.mount, nav: 'health', title: 'nav.health' },
  more: { render: settings.renderMore, nav: 'more', title: 'nav.more' },
  settings: { render: settings.renderSettings, mount: settings.mountSettings, nav: 'more', title: 'settings.title' },
  profile: { render: settings.renderProfile, mount: settings.mountProfile, nav: 'more', title: 'profile.title', form: () => true },
  about: { render: settings.renderAbout, nav: 'more', title: 'about.title' },
  card: { render: card.renderCard, nav: 'more', title: 'card.title' },
  report: { render: card.renderReport, nav: 'more', title: 'report.title' },
  welcome: { render: onboarding.render, mount: onboarding.mount, title: 'ob.welcome' },
  demo: { render: () => '', title: 'btn.tryDemo' }, // #/demo: one-click sample data (for a shared link)
  privacy: { render: legal.renderPrivacy, nav: 'more', title: 'legal.privacy' },
  terms: { render: legal.renderTerms, nav: 'more', title: 'legal.terms' },
  accessibility: { render: legal.renderAccessibility, nav: 'more', title: 'legal.a11y' },
  licenses: { render: legal.renderLicenses, nav: 'more', title: 'legal.licenses' },
};
const PUBLIC = ['privacy', 'terms', 'accessibility', 'licenses']; // readable before setup and in simple mode
const LOCKED_OK = ['today', 'card', ...PUBLIC]; // what simple mode shows without the caregiver pin

const NAV = [['today', 'home', 'nav.today'], ['meds', 'pill', 'nav.meds'], ['history', 'chart', 'nav.history'], ['health', 'heart', 'nav.health'], ['more', 'list', 'nav.more']];

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let current = '';
let lastSubmit = 0;

function parseRoute() {
  const s = store.get();
  let [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (name === 'demo') return { name, param, locked: false };
  if (!s.settings.onboarded && !PUBLIC.includes(name)) name = 'welcome';
  else if (name === 'welcome') name = 'today';
  const locked = s.settings.simple && !session.unlocked;
  if (!ROUTES[name] || (locked && !LOCKED_OK.includes(name))) name = 'today';
  return { name, param, locked };
}

function applySettings(st) {
  const root = document.documentElement;
  root.dataset.size = st.size;
  if (st.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = st.theme;
  const dark = st.theme === 'dark' || st.theme === 'contrast' || (st.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#0b1a2e' : '#162e51';
}

function renderNav(active, locked, onboardingNow) {
  if (onboardingNow) return (nav.innerHTML = '');
  if (locked) {
    nav.innerHTML = `<div class="nav-locked"><button class="btn ghost" type="button" data-act="unlock">${icon('lock')} ${t('btn.caregiver')}</button></div>`;
    return;
  }
  nav.innerHTML = `<ul>${NAV.map(([k, ic, label]) => `<li><a href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t(label)}</span></a></li>`).join('')}</ul>`;
}

// remember which control had focus so keyboard / screen reader users don't get thrown to the top
function focusKey(el) {
  if (!el || el === document.body || !main.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const act = el.dataset?.act;
  if (!act) return null;
  const extra = ['key', 'id', 'v', 'date', 'tab', 'type', 'pair'].filter((k) => el.dataset[k] != null).map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
  return `[data-act="${act}"]${extra}`;
}

export function render(fromNav = false) {
  const s = store.get();
  applySettings(s.settings);
  const { name, param, locked } = parseRoute();
  if (name === 'demo') return startDemo();
  const route = ROUTES[name];
  const id = `${name}/${param || ''}`;
  // keep the address bar honest when we redirected (locked, not set up yet, unknown page)
  const want = location.hash.replace(/^#\/?/, '');
  if (want && want !== id.replace(/\/$/, '') && !(name === 'today' && want === 'today')) window.history.replaceState(null, '', `#/${id.replace(/\/$/, '')}`);
  const changed = id !== current;

  if (!changed && !fromNav) {
    // background update (reminder tick, FDA result): don't wipe what someone is typing
    if (route.form?.(param)) return;
    const a = document.activeElement;
    const typing = a && main.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(a.type)));
    if (typing && Date.now() - lastSubmit > 800) return;
  }

  const fk = changed ? null : focusKey(document.activeElement);
  const y = scrollY;
  try {
    main.innerHTML = route.render(param) || '';
    route.mount?.(main, param);
    bindCharts(main);
  } catch (err) {
    // never leave an older person staring at a frozen screen
    console.error(err);
    main.innerHTML = `<div class="banner bad">${icon('alert')}<span>${t('err.screen')}</span><button class="btn sm" type="button" data-act="reload">${t('btn.reload')}</button></div>`;
  }
  renderNav(route.nav, locked, name === 'welcome' || !s.settings.onboarded);
  tickClock();
  document.title = `${t(route.title)} · CareClock`;
  document.body.classList.toggle('is-locked', locked);

  if (changed) {
    current = id;
    scrollTo(0, 0);
    const h = main.querySelector('h1');
    if (h && fromNav !== 'initial') {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  } else {
    scrollTo(0, y);
    if (fk) main.querySelector(fk)?.focus({ preventScroll: true });
  }
}

// #/demo loads the sample person straight away; asks first if real data would be replaced
let demoBusy = false;
async function startDemo() {
  if (demoBusy) return;
  demoBusy = true;
  const s = store.get();
  window.history.replaceState(null, '', '#/today');
  if (s.meds.length && s.settings.onboarded) {
    current = '';
    render(true);
    demoBusy = false;
    return actions.loadDemo();
  }
  if (!s.settings.lang) setLang(detectLang());
  await actions.loadDemo();
  demoBusy = false;
}

const clock = document.getElementById('clock');
function tickClock() {
  clock.textContent = fmtClock(new Date());
}
setInterval(tickClock, 15000);

// ---- global events ----

// double-tap guard: shaky hands often tap twice. after an action re-renders, the same spot may now hold
// a different button (Take -> Undo), so ignore a second tap on the same item within 700ms.
let lastTap = { id: '', t: 0 };
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  e.preventDefault();
  const id = el.dataset.key || el.dataset.id || '';
  if (id && id === lastTap.id && e.timeStamp - lastTap.t < 700) return;
  lastTap = { id, t: e.timeStamp };
  actions[el.dataset.act](el, e);
});

document.addEventListener('change', (e) => {
  const k = e.target.dataset?.setting;
  if (k) store.update((s) => (s.settings[k] = e.target.checked));
});

document.addEventListener('submit', () => (lastSubmit = Date.now()), true);

actions.print = () => print();
actions.reload = () => location.reload();

addEventListener('hashchange', () => render(true));
store.subscribe(() => render());

// re-check statuses every 30s on the home screen (due -> late, new day, ...)
setInterval(() => {
  if (current.startsWith('today') && !document.getElementById('dialog').open) render();
}, 30000);
document.addEventListener('visibilitychange', () => !document.hidden && render());
// rotate the phone / resize the window: redraw charts at the new width
let resizeTimer;
let lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(innerWidth - lastW) > 40 && main.querySelector('.chart')) render();
    lastW = innerWidth;
  }, 250);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettings(store.get().settings));

// ---- start ----

const s0 = store.get();
setLang(s0.settings.lang || detectLang());
prune(s0); // saved with the next change
render('initial');
startReminders(today.showAlert);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open') location.hash = '#/today';
  });
}
navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict our data
