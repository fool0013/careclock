// the sample data drives the demo video, so make sure it always shows what we want to show
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from '../js/demo.js';
import { adherence, needsRefill, dosesFor, statusOf } from '../js/schedule.js';
import { migrate } from '../js/store.js';
import { bpLevel, glucoseLevel } from '../js/views/health.js';
import { dateStr, addDays } from '../js/util.js';

const now = new Date('2026-10-26T13:00:00');
const s = buildDemo(now);
const today = dateStr(now);

test('demo has meds, a realistic adherence rate and history', () => {
  assert.equal(s.meds.length, 7);
  const a = adherence(s.meds, s.log, addDays(today, -29), today, now);
  assert.ok(a.pct >= 80 && a.pct < 100, `pct ${a.pct}`);
});

test('demo shows a refill warning and leaves doses open today', () => {
  assert.ok(s.meds.some(needsRefill));
  const open = dosesFor(s.meds, today).filter((d) => ['due', 'late', 'upcoming'].includes(statusOf(d, s.log, now)));
  assert.ok(open.length > 0);
});

test('demo is deterministic', () => {
  const b = buildDemo(now);
  assert.deepEqual(Object.keys(b.log), Object.keys(s.log));
  assert.deepEqual(b.vitals.map((v) => v.sys ?? v.value), s.vitals.map((v) => v.sys ?? v.value));
});

test('old backups get new fields filled in', () => {
  const m = migrate({ meds: [{ id: 'x' }], settings: { lang: 'es' } });
  assert.equal(m.settings.lang, 'es');
  assert.equal(m.settings.size, 'l');
  assert.deepEqual(m.vitals, []);
  assert.equal(migrate(null).meds.length, 0);
});

test('vital sign ranges', () => {
  assert.equal(bpLevel(118, 76), 'ok');
  assert.equal(bpLevel(124, 79), 'elevated');
  assert.equal(bpLevel(134, 76), 'high');
  assert.equal(bpLevel(120, 82), 'high');
  assert.equal(bpLevel(185, 90), 'crisis');
  assert.equal(bpLevel(85, 55), 'low');
  assert.equal(glucoseLevel(65), 'low');
  assert.equal(glucoseLevel(120), 'ok');
  assert.equal(glucoseLevel(220), 'high');
});
