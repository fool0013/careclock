// security checks: tampered backups can't inject code, the CSP stays strict, offline cache stays complete
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, defaults } from '../js/store.js';
import { buildDemo } from '../js/demo.js';
import { safeColor, safePhoto } from '../js/sanitize.js';
import { hashPin, checkPin, recordFail, lockRemaining, recordSuccess } from '../js/pin.js';
import { pillArt } from '../js/icons.js';
import { esc } from '../js/util.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const XSS = '"><img src=x onerror=alert(1)>';

test('tampered backup: html/js payloads are dropped or neutralized', () => {
  const evil = {
    meds: [
      { id: 'ok1', name: XSS, color: `red" onload="alert(1)`, photo: 'javascript:alert(1)', times: ['08:00', '<script>', '25:99'], days: [1, 9, 'x'], form: 'evil', amount: 'lots', quantity: '1e99' },
      { id: `x" onmouseover="alert(1)`, name: 'Bad id' },
      { id: 'ok2', name: '' },
    ],
    log: { __proto__: { polluted: true }, '2026-10-26': { 'ok1@08:00': { status: 'taken', at: '2026-10-26T08:00:00Z' }, 'bad key': { status: 'taken' }, 'ok1@09:00': { status: 'pwned' } }, 'not-a-date': {} },
    vitals: [{ id: 'v1', type: 'bp', at: '2026-10-26T08:00:00Z', sys: '<b>', dia: 80 }, { id: 'v2', type: 'glucose', at: '2026-10-26T08:00:00Z', value: 110 }],
    appts: [{ id: 'a1', at: 'javascript:alert(1)', with: 'Dr' }, { id: 'a2', at: '2026-11-01T10:30', with: 'Dr. Patel' }],
    settings: { lang: '../../etc', theme: 'x', size: 'huge', pin: '1234' },
    dismissed: ['a|b', '<x>|y'],
  };
  const s = migrate(evil);
  assert.equal(s.meds.length, 1, 'meds with bad ids or no name are dropped');
  const m = s.meds[0];
  assert.equal(m.color, '#f4f1ea');
  assert.equal(m.photo, null);
  assert.deepEqual(m.times, ['08:00']);
  assert.deepEqual(m.days, [1]);
  assert.equal(m.form, 'tablet');
  assert.equal(m.amount, 1);
  assert.equal(m.quantity, 100000);
  assert.deepEqual(Object.keys(s.log), ['2026-10-26']);
  assert.deepEqual(Object.keys(s.log['2026-10-26']), ['ok1@08:00']);
  assert.equal({}.polluted, undefined, 'no prototype pollution');
  assert.equal(s.vitals.length, 1);
  assert.equal(s.appts.length, 1);
  assert.equal(s.settings.lang, null);
  assert.equal(s.settings.theme, 'auto');
  assert.equal(s.settings.size, 'l');
  assert.equal(s.settings.pin, '', 'plain-text pins are never accepted');
  assert.deepEqual(s.dismissed, ['a|b']);
  // the name is kept as text but always escaped when shown
  assert.ok(!esc(m.name).includes('<'));
});

test('pill art never emits attacker-controlled attributes', () => {
  const html = pillArt({ color: '#fff" onload="x', photo: 'data:text/html;base64,PHNjcmlwdD4=' });
  assert.ok(!html.includes('onload'));
  assert.ok(!html.includes('text/html'));
  assert.equal(safeColor('#AABBCC'), '#AABBCC');
  assert.equal(safePhoto('data:image/jpeg;base64,/9j/4AAQ=='), 'data:image/jpeg;base64,/9j/4AAQ==');
  assert.equal(safePhoto('data:image/svg+xml;base64,PHN2Zz4='), null, 'svg can carry script, not allowed');
});

test('valid data survives sanitizing unchanged', () => {
  const demo = buildDemo(new Date('2026-10-26T13:00:00'));
  const again = migrate(JSON.parse(JSON.stringify(demo)));
  assert.equal(again.meds.length, demo.meds.length);
  assert.deepEqual(again.meds.map((m) => m.times), demo.meds.map((m) => m.times));
  assert.equal(Object.keys(again.log).length, Object.keys(demo.log).length);
  assert.equal(again.vitals.length, demo.vitals.length);
  assert.equal(again.prn.length, demo.prn.length);
  assert.deepEqual(migrate(defaults()).settings, defaults().settings);
});

test('caregiver PIN is salted + hashed, and guessing gets locked out', async () => {
  const h = await hashPin('2468');
  assert.match(h, /^sha256:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.ok(!h.includes('2468'));
  assert.notEqual(h, await hashPin('2468'), 'random salt each time');
  assert.ok(await checkPin('2468', h));
  assert.ok(!(await checkPin('1357', h)));
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordFail(now);
  assert.ok(lockRemaining(now) > 0);
  recordSuccess();
});

test('CSP is strict and there are no inline scripts', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.fda\.gov(;|$)/);
  assert.ok(!/unsafe-eval/.test(csp));
  assert.equal((html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0);
  assert.ok(!/\son[a-z]+=/i.test(html), 'no inline event handlers');
});

test('no dangerous JS APIs anywhere in the app code', () => {
  const files = [join(ROOT, 'sw.js'), ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => join(ROOT, 'js', f)), ...readdirSync(join(ROOT, 'js', 'views')).map((f) => join(ROOT, 'js', 'views', f))];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\beval\s*\(|new Function\s*\(|document\.write|setTimeout\(\s*['"`]/.test(src), `unsafe API in ${f}`);
  }
});

test('offline cache lists every app file', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const need = [
    ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...readdirSync(join(ROOT, 'js', 'views')).map((f) => `js/views/${f}`),
    ...readdirSync(join(ROOT, 'js', 'locales')).map((f) => `js/locales/${f}`),
    ...readdirSync(join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`),
  ];
  const missing = need.filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});
