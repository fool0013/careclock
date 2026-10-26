// every piece of saved or imported data passes through here before the app touches it.
// a backup file is untrusted input: someone could hand-edit it to sneak html/js into a med name,
// a photo url, a color or an id. so: whitelist formats, coerce types, cap sizes, drop everything else.
// (all text is also html-escaped at render time — this is the second lock on the door.)

export const FORMS = ['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'drops', 'patch', 'cream'];
const FOOD = ['none', 'with', 'empty'];
const LANG_CODES = ['en', 'es', 'zh', 'vi', 'tl', 'ko'];

const ID = /^[a-z0-9]{1,40}$/i;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i;
const PIN_HASH = /^sha256:[0-9a-f]{32}:[0-9a-f]{64}$/;
const LOG_KEY = /^[a-z0-9]{1,40}@([01]\d|2[0-3]):[0-5]\d$/i;

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v, max = 1000) => (Array.isArray(v) ? v.slice(0, max) : []);
export const str = (v, max = 300) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max);
export const num = (v, lo, hi, dflt = null) => {
  if (v === '' || v == null) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const iso = (v) => (typeof v === 'string' && v.length < 40 && !Number.isNaN(Date.parse(v)) ? v : null);
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const id = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const date = (v) => (typeof v === 'string' && DATE.test(v) ? v : '');

export const safeColor = (c) => (typeof c === 'string' && COLOR.test(c) ? c : '#f4f1ea');
export const safePhoto = (p) => (typeof p === 'string' && p.length < 300000 && PHOTO.test(p) ? p : null);

function fda(f) {
  f = obj(f);
  if (f.notFound) return { notFound: true, fetchedAt: iso(f.fetchedAt) || new Date(0).toISOString() };
  if (!f.fetchedAt) return null;
  return {
    generic: str(f.generic, 200),
    brands: arr(f.brands, 5).map((b) => str(b, 80)),
    classes: arr(f.classes, 10).map((c) => str(c, 120)),
    purpose: str(f.purpose, 1000),
    boxed: str(f.boxed, 1000),
    text: str(f.text, 24000),
    lifestyleText: str(f.lifestyleText, 30000),
    fetchedAt: iso(f.fetchedAt) || new Date(0).toISOString(),
  };
}

function med(m) {
  m = obj(m);
  const mid = id(m.id);
  const name = str(m.name, 80).trim();
  if (!mid || !name) return null;
  return {
    id: mid,
    name,
    strength: str(m.strength, 40),
    form: pick(m.form, FORMS, 'tablet'),
    amount: num(m.amount, 0.25, 100, 1),
    shape: pick(m.shape, ['round', 'oval'], 'round'),
    color: safeColor(m.color),
    photo: safePhoto(m.photo),
    times: [...new Set(arr(m.times, 12).filter((t) => typeof t === 'string' && TIME.test(t)))].sort(),
    days: [...new Set(arr(m.days, 7).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
    asNeeded: m.asNeeded === true,
    withFood: pick(m.withFood, FOOD, 'none'),
    instructions: str(m.instructions, 200),
    quantity: num(m.quantity, 0, 100000, null),
    refillAt: num(m.refillAt, 0, 365, 7),
    minGap: num(m.minGap, 0, 72, null),
    maxPerDay: num(m.maxPerDay, 0, 48, null),
    prescriber: str(m.prescriber, 80),
    purpose: str(m.purpose, 80),
    startDate: date(m.startDate),
    endDate: date(m.endDate),
    notes: str(m.notes, 1000),
    archived: m.archived === true,
    fda: fda(m.fda),
  };
}

function log(l) {
  const out = {};
  for (const [d, day] of Object.entries(obj(l))) {
    if (!DATE.test(d)) continue;
    const clean = {};
    for (const [k, e] of Object.entries(obj(day))) {
      const status = pick(obj(e).status, ['taken', 'skipped'], null);
      if (LOG_KEY.test(k) && status) clean[k] = { status, at: iso(e.at) || `${d}T12:00:00.000Z` };
    }
    if (Object.keys(clean).length) out[d] = clean;
  }
  return out;
}

function vital(v) {
  v = obj(v);
  const type = pick(v.type, ['bp', 'glucose', 'weight'], null);
  const vid = id(v.id);
  const at = iso(v.at);
  if (!type || !vid || !at) return null;
  if (type === 'bp') {
    const sys = num(v.sys, 40, 300), dia = num(v.dia, 20, 200);
    return sys && dia ? { id: vid, type, at, sys: Math.round(sys), dia: Math.round(dia), pulse: num(v.pulse, 20, 250, null) } : null;
  }
  const value = num(v.value, 1, type === 'glucose' ? 1000 : 1500);
  return value ? { id: vid, type, at, value, unit: type === 'weight' ? pick(v.unit, ['lb', 'kg'], 'lb') : 'mg/dL' } : null;
}

function appt(a) {
  a = obj(a);
  const aid = id(a.id);
  const at = typeof a.at === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(a.at) ? a.at : null;
  const who = str(a.with, 100).trim();
  return aid && at && who ? { id: aid, at, with: who, place: str(a.place, 150), phone: str(a.phone, 30), notes: str(a.notes, 300) } : null;
}

const contact = (c) => {
  c = obj(c);
  const out = { name: str(c.name, 80), relation: str(c.relation, 40), phone: str(c.phone, 30) };
  return out.name || out.phone ? out : null;
};

// d = defaults() from store.js (passed in to avoid a circular import)
export function sanitize(input, d) {
  const s = obj(input);
  const st = obj(s.settings);
  const p = obj(s.profile);
  const meds = arr(s.meds, 200).map(med).filter(Boolean);
  const ids = new Set(meds.map((m) => m.id));
  return {
    version: d.version,
    settings: {
      lang: pick(st.lang, LANG_CODES, null),
      size: pick(st.size, ['m', 'l', 'xl'], d.settings.size),
      theme: pick(st.theme, ['auto', 'light', 'dark', 'contrast'], 'auto'),
      sound: st.sound !== false,
      voice: st.voice !== false,
      reminders: st.reminders !== false,
      simple: st.simple === true,
      pin: typeof st.pin === 'string' && PIN_HASH.test(st.pin) ? st.pin : '',
      onboarded: st.onboarded === true,
      weightUnit: pick(st.weightUnit, ['lb', 'kg'], 'lb'),
    },
    profile: {
      name: str(p.name, 100), dob: date(p.dob), blood: str(p.blood, 10),
      conditions: str(p.conditions, 500), allergies: str(p.allergies, 500),
      doctor: str(p.doctor, 100), doctorPhone: str(p.doctorPhone, 30),
      pharmacy: str(p.pharmacy, 100), pharmacyPhone: str(p.pharmacyPhone, 30),
      contacts: arr(p.contacts, 3).map(contact).filter(Boolean),
      notes: str(p.notes, 1000),
    },
    meds,
    log: log(s.log),
    prn: arr(s.prn, 5000).map((x) => ({ id: id(obj(x).id), medId: id(obj(x).medId), at: iso(obj(x).at) })).filter((x) => x.id && x.at && ids.has(x.medId)),
    vitals: arr(s.vitals, 5000).map(vital).filter(Boolean),
    appts: arr(s.appts, 500).map(appt).filter(Boolean),
    questions: arr(s.questions, 200).map((q) => ({ id: id(obj(q).id), text: str(obj(q).text, 300), done: obj(q).done === true })).filter((q) => q.id && q.text),
    dismissed: arr(s.dismissed, 500).filter((x) => typeof x === 'string' && /^[a-z0-9]{1,40}\|[a-z0-9]{1,40}$/i.test(x)),
  };
}
