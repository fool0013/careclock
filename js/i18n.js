// translations. english is the source of truth; any missing key falls back to it.
// tests/i18n.test.js fails the build if a language is missing a key or a {placeholder}.

import en from './locales/en.js';
import es from './locales/es.js';
import zh from './locales/zh.js';
import vi from './locales/vi.js';
import tl from './locales/tl.js';
import ko from './locales/ko.js';

// the 5 most spoken non-english languages among older US adults + english
export const LANGS = [
  { code: 'en', name: 'English', speech: 'en-US' },
  { code: 'es', name: 'Español', speech: 'es-US' },
  { code: 'zh', name: '中文', speech: 'zh-CN' },
  { code: 'vi', name: 'Tiếng Việt', speech: 'vi-VN' },
  { code: 'tl', name: 'Tagalog', speech: 'fil-PH' },
  { code: 'ko', name: '한국어', speech: 'ko-KR' },
];

export const DICTS = { en, es, zh, vi, tl, ko };

let code = 'en';
let dict = en;

export function setLang(c) {
  code = DICTS[c] ? c : 'en';
  dict = DICTS[code];
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}

export const getLang = () => code;
export const speechLang = () => LANGS.find((l) => l.code === code).speech;

// best guess from the browser on first launch
export function detectLang() {
  const prefs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const p of prefs) {
    const c = (p || '').toLowerCase().split('-')[0];
    if (c === 'fil') return 'tl';
    if (DICTS[c]) return c;
  }
  return 'en';
}

export function t(key, vars) {
  let s = dict[key] ?? en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

// "1 tablet" / "2 tablets". languages without plurals just reuse the same word
export function tn(key, n, vars) {
  const k = n === 1 ? key : `${key}.pl`;
  return t(dict[k] ?? en[k] ? k : key, { n, ...vars });
}

const locale = () => (code === 'tl' ? 'fil' : code);

export const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
};
export const fmtClock = (d) => d.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
export const fmtDate = (d, opts = { weekday: 'long', month: 'long', day: 'numeric' }) => d.toLocaleDateString(locale(), opts);
export const fmtShort = (d) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
export const fmtWeekday = (d) => d.toLocaleDateString(locale(), { weekday: 'short' });
export const fmtNum = (n, digits = 0) => Number(n).toLocaleString(locale(), { maximumFractionDigits: digits });

// "in 2.5 hours" / "in 20 minutes" (future) using the browser's own translations
export function fmtRelative(mins) {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (Math.abs(mins) < 60) return rtf.format(Math.round(mins), 'minute');
  const h = mins / 60;
  return rtf.format(Math.abs(h) < 10 ? Math.round(h * 2) / 2 : Math.round(h), 'hour');
}

// "2.5 hours" / "45 minutes" (a length of time)
export function fmtDuration(mins) {
  const a = Math.max(0, mins);
  const [v, unit] = a < 60 ? [Math.round(a), 'minute'] : [a / 60 < 10 ? Math.round(a / 30) / 2 : Math.round(a / 60), 'hour'];
  return new Intl.NumberFormat(locale(), { style: 'unit', unit, unitDisplay: 'long', maximumFractionDigits: 1 }).format(v);
}
