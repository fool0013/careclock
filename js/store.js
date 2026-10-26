// app state. everything lives on this device (localStorage) -> no account, no server, private by default.

import { dateStr, addDays, uid } from './util.js';
import { sanitize } from './sanitize.js';

const KEY = 'careclock.v1';
export const VERSION = 1;

export const defaults = () => ({
  version: VERSION,
  settings: { lang: null, size: 'l', theme: 'auto', sound: true, voice: true, reminders: true, simple: false, pin: '', onboarded: false, weightUnit: 'lb' },
  profile: { name: '', dob: '', blood: '', conditions: '', allergies: '', doctor: '', doctorPhone: '', pharmacy: '', pharmacyPhone: '', contacts: [], notes: '' },
  meds: [],
  log: {}, // { 'YYYY-MM-DD': { 'medId@HH:MM': { status: 'taken'|'skipped', at: ISO } } }
  prn: [], // as-needed doses: [{ id, medId, at }]
  vitals: [], // [{ id, type: 'bp'|'glucose'|'weight', at, sys, dia, pulse, value, unit }]
  appts: [], // [{ id, at: 'YYYY-MM-DDTHH:MM', with, place, phone, notes }]
  questions: [], // [{ id, text, done }]
  dismissed: [], // interaction findings the family already reviewed
});

// validate + fill in fields added in later versions, so old (or tampered) backups load safely
export const migrate = (s) => sanitize(s, defaults());

let state = load();
let saveError = false;
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaults();
  } catch {
    return defaults();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = false;
  } catch {
    saveError = true; // storage full or blocked; ui shows a warning
  }
}

// the app open twice (installed app + a browser tab): pick up the other copy's changes instead of
// overwriting them with stale data on our next save
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = migrate(JSON.parse(e.newValue));
      subs.forEach((f) => f(state));
    } catch { /* ignore a half-written value */ }
  });
}

export const store = {
  get: () => state,
  get saveError() { return saveError; },
  // mutate through here so every change is saved + re-rendered
  update(fn) {
    fn(state);
    save();
    subs.forEach((f) => f(state));
  },
  replace(next) {
    state = migrate(next);
    save();
    subs.forEach((f) => f(state));
  },
  subscribe(f) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

// ---- dose actions ----

// when = the time it really happened (used when fixing a forgotten dose on a past day)
export function markDose(dose, status, when = new Date()) {
  store.update((s) => {
    const day = (s.log[dose.date] ||= {});
    const prev = day[dose.key];
    day[dose.key] = { status, at: when.toISOString() };
    const med = s.meds.find((m) => m.id === dose.med.id);
    // count pills down when taken (and back up if it was taken before)
    if (med && med.quantity != null && med.quantity !== '') {
      const amt = Number(med.amount) || 1;
      if (status === 'taken' && prev?.status !== 'taken') med.quantity = Math.max(0, Number(med.quantity) - amt);
      if (status !== 'taken' && prev?.status === 'taken') med.quantity = Number(med.quantity) + amt;
    }
  });
}

export function undoDose(dose) {
  store.update((s) => {
    const prev = s.log[dose.date]?.[dose.key];
    if (!prev) return;
    delete s.log[dose.date][dose.key];
    const med = s.meds.find((m) => m.id === dose.med.id);
    if (prev.status === 'taken' && med && med.quantity != null && med.quantity !== '') med.quantity = Number(med.quantity) + (Number(med.amount) || 1);
  });
}

export function logPrn(medId) {
  const id = uid();
  store.update((s) => {
    s.prn.push({ id, medId, at: new Date().toISOString() });
    const med = s.meds.find((m) => m.id === medId);
    if (med && med.quantity != null && med.quantity !== '') med.quantity = Math.max(0, Number(med.quantity) - (Number(med.amount) || 1));
  });
  return id;
}

export function undoPrn(id) {
  store.update((s) => {
    const e = s.prn.find((p) => p.id === id);
    if (!e) return;
    s.prn = s.prn.filter((p) => p.id !== id);
    const med = s.meds.find((m) => m.id === e.medId);
    if (med && med.quantity != null && med.quantity !== '') med.quantity = Number(med.quantity) + (Number(med.amount) || 1);
  });
}

// drop history older than ~13 months so storage stays small
export function prune(s, today = dateStr()) {
  const cutoff = addDays(today, -400);
  for (const d of Object.keys(s.log)) if (d < cutoff) delete s.log[d];
  s.prn = s.prn.filter((p) => p.at.slice(0, 10) >= cutoff);
}
