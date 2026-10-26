// small helpers shared by everything. no DOM in here so node tests can import it.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const pad = (n) => String(n).padStart(2, '0');

// dates are stored as local "YYYY-MM-DD" strings so timezones never shift a day
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
};

// "08:30" -> minutes after midnight
export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// date string + "HH:MM" -> Date
export const at = (s, t) => {
  const d = parseDate(s);
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// list of date strings from..to inclusive
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// tiny seeded rng (mulberry32) so demo data is the same every time
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
