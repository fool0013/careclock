// reminders while the app is open (or in a background tab): chime + spoken message + vibration
// + system notification. for alarms with the app fully closed, see the calendar export (ics.js).

import { store } from './store.js';
import { dosesFor, statusOf } from './schedule.js';
import { dateStr } from './util.js';
import { speechLang } from './i18n.js';

const REPEAT_MIN = 15; // nag again this often while a dose stays untaken
const GIVE_UP_MIN = 120; // stop nagging 2h after dose time

const lastAlert = new Map(); // dose id -> ms of last alert
const snoozedUntil = new Map(); // dose id -> ms
let onAlert = () => {};
let audio;

const idOf = (d) => `${d.date}|${d.key}`;

export function startReminders(handler) {
  onAlert = handler;
  setInterval(check, 15000);
  setTimeout(check, 1500);
  // browsers only allow sound after the first tap
  addEventListener('pointerdown', unlockAudio, { once: true });
}

export function snooze(doses, minutes = 10) {
  const until = Date.now() + minutes * 60000;
  for (const d of doses) snoozedUntil.set(idOf(d), until);
}

export function check(now = new Date()) {
  const s = store.get();
  if (!s.settings.reminders) return;
  const ready = [];
  for (const d of dosesFor(s.meds, dateStr(now))) {
    const st = statusOf(d, s.log, now);
    if (st !== 'due' && st !== 'late') continue;
    const mins = (now - new Date(`${d.date}T${d.time}`)) / 60000;
    if (mins < 0 || mins > GIVE_UP_MIN) continue;
    const id = idOf(d);
    if ((snoozedUntil.get(id) || 0) > +now) continue;
    const last = lastAlert.get(id);
    if (last && +now - last < REPEAT_MIN * 60000) continue;
    ready.push(d);
  }
  if (!ready.length) return;
  ready.forEach((d) => lastAlert.set(idOf(d), +now));
  onAlert(ready);
}

function unlockAudio() {
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* no audio, fine */ }
}

// soft 3-note chime, loud enough to hear across a room
export function chime() {
  if (!store.get().settings.sound || !audio) return;
  const t0 = audio.currentTime;
  [659, 784, 1047].forEach((f, i) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.35 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.9);
    o.connect(g).connect(audio.destination);
    o.start(t0 + i * 0.35);
    o.stop(t0 + i * 0.35 + 1);
  });
}

export function speak(text, force = false) {
  if ((!force && !store.get().settings.voice) || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang();
  const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v;
  u.rate = 0.9; // a little slower is easier to follow
  speechSynthesis.speak(u);
}

export async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const opts = { body, tag, renotify: true, requireInteraction: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [300, 150, 300] };
    if (reg) reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* notifications are a bonus, never block on them */ }
}
