// every language must have every key, with the same {placeholders}, and every key the code uses must exist
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTS, LANGS, t, tn, setLang } from '../js/i18n.js';

const en = DICTS.en;
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

for (const { code } of LANGS) {
  if (code === 'en') continue;
  test(`${code} has every key with matching placeholders`, () => {
    const d = DICTS[code];
    const missing = Object.keys(en).filter((k) => !(k in d));
    assert.deepEqual(missing, [], `${code} missing keys`);
    const extra = Object.keys(d).filter((k) => !(k in en) && !k.endsWith('.pl'));
    assert.deepEqual(extra, [], `${code} has unknown keys`);
    const bad = Object.keys(en).filter((k) => ph(en[k]) !== ph(d[k]));
    assert.deepEqual(bad, [], `${code} placeholder mismatch`);
  });
}

// keys built at runtime (template strings) are listed here
const DYNAMIC = [
  ...['morning', 'afternoon', 'evening'].flatMap((p) => [`greet.${p}`, `greet.${p}.noname`]),
  ...['ok', 'elevated', 'high', 'low', 'crisis'].map((l) => `bp.${l}`), ...['ok', 'high', 'low'].map((l) => `glu.${l}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `color.${i}`), ...[0, 1, 2, 3, 4, 5, 6].map((i) => `day.${i}`),
  ...['with', 'empty', 'none'].map((f) => `food.${f}`),
  ...['tablet', 'capsule', 'liquid', 'injection', 'inhaler', 'drops', 'patch', 'cream'].flatMap((f) => [`form.${f}`, `formName.${f}`]),
  ...['vitals', 'appts', 'questions'].map((k) => `health.${k}`), ...['full', 'most', 'low'].map((b) => `hist.leg.${b}`),
  ...['grapefruit', 'alcohol', 'vitaminK', 'potassium', 'sun', 'drowsy'].map((k) => `life.${k}`),
  ...['morning', 'afternoon', 'evening', 'night'].map((p) => `period.${p}`), ...['morning', 'noon', 'evening', 'bedtime'].map((p) => `preset.${p}`),
  'shape.round', 'shape.oval', 'size.m', 'size.l', 'size.xl',
  ...['taken', 'skipped', 'due', 'late', 'missed', 'upcoming'].map((s) => `st.${s}`),
  ...['auto', 'light', 'dark', 'contrast'].map((v) => `theme.${v}`), ...['bp', 'glucose', 'weight'].map((v) => `vit.${v}`),
  ...['today', 'meds', 'history', 'health', 'more'].map((v) => `nav.${v}`),
  'today.next', 'today.now', 'safety.strong', 'safety.mention', 'btn.reviewed', 'btn.unreview', 'btn.checkAgain', 'btn.checkNow',
  'form.addTitle', 'form.editTitle', 'btn.restart', 'btn.stopMed',
];

test('every key used in the code exists in english', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
  const files = [...readdirSync(root).map((f) => join(root, f)), ...readdirSync(join(root, 'views')).map((f) => join(root, 'views', f))].filter((f) => f.endsWith('.js'));
  const used = new Set(DYNAMIC);
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\btn?\(\s*'([a-zA-Z0-9.]+)'/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
});

test('interpolation and plurals', () => {
  setLang('en');
  assert.equal(t('greet.morning', { name: 'Rosa' }), 'Good morning, Rosa');
  assert.equal(tn('form.tablet', 1), '1 tablet');
  assert.equal(tn('form.tablet', 2), '2 tablets');
  assert.equal(tn('form.liquid', 5), '5 mL'); // no plural form -> falls back
  assert.equal(t('no.such.key'), 'no.such.key');
});
