import test from 'node:test';
import assert from 'node:assert/strict';
import { dosesFor, statusOf, dayStats, adherence, streak, unitsPerDay, daysLeft, needsRefill, nextDose, periodOf, isActiveOn } from '../js/schedule.js';
import { addDays } from '../js/util.js';

const med = (o) => ({ id: o.id || 'm1', name: o.name || 'Lisinopril', times: ['08:00'], days: [], amount: 1, ...o });
// 2026-10-26 is a Monday
const D = '2026-10-26';
const at = (hhmm, d = D) => new Date(`${d}T${hhmm}:00`);

test('doses are listed per time and sorted', () => {
  const meds = [med({ id: 'a', name: 'B', times: ['20:00', '08:00'] }), med({ id: 'b', name: 'A', times: ['08:00'] })];
  const ds = dosesFor(meds, D);
  assert.deepEqual(ds.map((d) => `${d.time} ${d.med.name}`), ['08:00 A', '08:00 B', '20:00 B']);
  assert.equal(ds[0].key, 'b@08:00');
});

test('as-needed, archived, out-of-range and wrong-weekday meds are skipped', () => {
  assert.equal(dosesFor([med({ asNeeded: true })], D).length, 0);
  assert.equal(dosesFor([med({ archived: true })], D).length, 0);
  assert.equal(dosesFor([med({ startDate: '2026-10-27' })], D).length, 0);
  assert.equal(dosesFor([med({ endDate: '2026-10-25' })], D).length, 0);
  assert.equal(dosesFor([med({ days: [2, 4] })], D).length, 0); // tue/thu only
  assert.ok(isActiveOn(med({ days: [1] }), D)); // monday
});

test('status moves upcoming -> due -> late, and missed on later days', () => {
  const [d] = dosesFor([med({})], D);
  assert.equal(statusOf(d, {}, at('07:00')), 'upcoming');
  assert.equal(statusOf(d, {}, at('07:45')), 'due'); // 15 min early
  assert.equal(statusOf(d, {}, at('08:59')), 'due');
  assert.equal(statusOf(d, {}, at('09:30')), 'late');
  assert.equal(statusOf(d, {}, at('09:30', addDays(D, 1))), 'missed');
  const log = { [D]: { 'm1@08:00': { status: 'taken', at: at('08:05').toISOString() } } };
  assert.equal(statusOf(d, log, at('23:00')), 'taken');
});

test('day stats and adherence ignore doses that are not due yet', () => {
  const meds = [med({ times: ['08:00', '20:00'] })];
  const log = { [D]: { 'm1@08:00': { status: 'taken', at: '' } } };
  const s = dayStats(meds, log, D, at('12:00'));
  assert.deepEqual(s, { total: 2, taken: 1, skipped: 0, missed: 0, pending: 1 });
  const a = adherence(meds, log, D, D, at('12:00'));
  assert.equal(a.pct, 100);
  const later = adherence(meds, log, D, D, at('23:00'));
  assert.equal(later.pct, 50);
});

test('adherence returns null when nothing is scorable', () => {
  assert.equal(adherence([], {}, D, D, at('12:00')).pct, null);
});

test('streak counts perfect days back from yesterday', () => {
  const meds = [med({ startDate: '2026-10-01' })];
  const log = {};
  for (let i = 1; i <= 5; i++) (log[addDays(D, -i)] = {})['m1@08:00'] = { status: 'taken', at: '' };
  assert.equal(streak(meds, log, at('07:00')), 5);
  log[D] = { 'm1@08:00': { status: 'taken', at: '' } };
  assert.equal(streak(meds, log, at('09:00')), 6); // today done too
  delete log[addDays(D, -3)]['m1@08:00'];
  assert.equal(streak(meds, log, at('09:00')), 3);
});

test('supply math handles amount, times and weekly schedules', () => {
  assert.equal(unitsPerDay(med({ times: ['08:00', '20:00'], amount: 2 })), 4);
  assert.equal(unitsPerDay(med({ days: [1, 3, 5] })), 3 / 7);
  assert.equal(unitsPerDay(med({ asNeeded: true })), 0);
  assert.equal(daysLeft(med({ quantity: 30, times: ['08:00', '20:00'] })), 15);
  assert.equal(daysLeft(med({ quantity: null })), null);
  assert.equal(daysLeft(med({ quantity: 10, asNeeded: true })), null);
  assert.ok(needsRefill(med({ quantity: 5 })));
  assert.ok(!needsRefill(med({ quantity: 30 })));
  assert.ok(needsRefill(med({ quantity: 12, refillAt: 14 })));
});

test('next dose is the first open dose today, else tomorrow', () => {
  const meds = [med({ times: ['08:00', '20:00'] })];
  assert.equal(nextDose(meds, {}, at('12:00')).time, '08:00'); // morning one is late, still open
  const log = { [D]: { 'm1@08:00': { status: 'taken', at: '' }, 'm1@20:00': { status: 'taken', at: '' } } };
  const n = nextDose(meds, log, at('21:00'));
  assert.equal(n.date, addDays(D, 1));
  assert.equal(n.time, '08:00');
});

test('time of day buckets', () => {
  assert.equal(periodOf('06:30'), 'morning');
  assert.equal(periodOf('12:00'), 'afternoon');
  assert.equal(periodOf('18:00'), 'evening');
  assert.equal(periodOf('22:00'), 'night');
  assert.equal(periodOf('02:00'), 'night');
});

test('daylight saving change day (US: 2026-11-01) still has every dose and day', async () => {
  const { dateRange } = await import('../js/util.js');
  assert.deepEqual(dateRange('2026-10-31', '2026-11-02'), ['2026-10-31', '2026-11-01', '2026-11-02']);
  const meds = [med({ times: ['01:30', '08:00'] })];
  assert.equal(dosesFor(meds, '2026-11-01').length, 2);
  const a = adherence(meds, {}, '2026-10-31', '2026-11-02', new Date('2026-11-03T00:00:00'));
  assert.equal(a.counted, 6);
});

test('a late-night dose rolls over to "missed" after midnight, not lost', () => {
  const [d] = dosesFor([med({ times: ['23:30'] })], '2026-10-26');
  assert.equal(statusOf(d, {}, new Date('2026-10-26T23:50:00')), 'due');
  assert.equal(statusOf(d, {}, new Date('2026-10-27T00:10:00')), 'missed');
  // and it can still be fixed later (history "Mark taken" writes into that day's log)
  const log = { '2026-10-26': { 'm1@23:30': { status: 'taken', at: '2026-10-26T23:30:00' } } };
  assert.equal(statusOf(d, log, new Date('2026-10-27T09:00:00')), 'taken');
});
