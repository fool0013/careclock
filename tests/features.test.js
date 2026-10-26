// newer safety features: as-needed limits, early-dose detection, stopped meds, barcode/NDC parsing, units
import test from 'node:test';
import assert from 'node:assert/strict';
import { prnStatus, minutesUntil, dosesFor, adherence, isActiveOn } from '../js/schedule.js';
import { ndcCandidates, fromNdcResult, formFromFda, strengthText, lookupNdc } from '../js/fda.js';
import { weightIn } from '../js/views/health.js';
import { migrate } from '../js/store.js';

const now = new Date('2026-10-26T14:00:00');
const ibu = { id: 'ibu', name: 'Ibuprofen', asNeeded: true, minGap: 6, maxPerDay: 3 };
const use = (id, iso) => ({ id: iso, medId: id, at: new Date(iso).toISOString() });

test('as-needed: too soon until the gap has passed', () => {
  const s = prnStatus(ibu, [use('ibu', '2026-10-26T10:00:00')], now);
  assert.equal(s.tooSoon, true);
  assert.equal(s.nextAt.getHours(), 16);
  assert.equal(Math.round(s.hoursSince), 4);
  assert.equal(prnStatus(ibu, [use('ibu', '2026-10-26T07:00:00')], now).tooSoon, false);
});

test('as-needed: daily limit is a rolling 24 hours', () => {
  const uses = ['2026-10-25T16:00:00', '2026-10-25T23:00:00', '2026-10-26T06:00:00'].map((t) => use('ibu', t));
  const s = prnStatus(ibu, uses, now);
  assert.equal(s.in24, 3);
  assert.equal(s.overMax, true);
  assert.equal(s.countToday, 1);
  assert.equal(prnStatus(ibu, uses, new Date('2026-10-26T16:30:00')).overMax, false); // first one aged out
});

test('as-needed: no limits set = never warns; other meds ignored; future entries ignored', () => {
  const plain = { id: 'p', asNeeded: true };
  const s = prnStatus(plain, [use('p', '2026-10-26T13:59:00'), use('x', '2026-10-26T13:00:00'), use('p', '2026-10-27T09:00:00')], now);
  assert.equal(s.tooSoon, false);
  assert.equal(s.overMax, false);
  assert.equal(s.in24, 1);
  assert.equal(prnStatus(plain, [], now).last, null);
});

test('minutes until a dose (used for the early-dose check)', () => {
  const [d] = dosesFor([{ id: 'a', name: 'A', times: ['21:00'] }], '2026-10-26');
  assert.equal(minutesUntil(d, now), 420);
  assert.ok(minutesUntil(d, new Date('2026-10-26T22:00:00')) < 0);
});

test('a stopped med keeps its past history but has no doses after it stopped', () => {
  const m = { id: 'm', name: 'M', times: ['08:00'], startDate: '2026-10-01', endDate: '2026-10-20', archived: true };
  assert.ok(isActiveOn(m, '2026-10-15'));
  assert.ok(!isActiveOn(m, '2026-10-21'));
  assert.ok(!isActiveOn({ ...m, endDate: '' }, '2026-10-15')); // archived with no end = fully hidden
  const a = adherence([m], {}, '2026-10-14', '2026-10-26', now);
  assert.equal(a.counted, 7); // only the 7 days it was active
});

test('NDC candidates: printed, padded, UPC-A, GS1 and junk', () => {
  assert.deepEqual(ndcCandidates('0573-0150-30'), ['0573-0150-30']);
  assert.deepEqual(ndcCandidates('8042503931'), ['8042-5039-31', '80425-039-31', '80425-0393-1']);
  assert.deepEqual(ndcCandidates('380425039313'), ['8042-5039-31', '80425-039-31', '80425-0393-1']); // UPC-A
  assert.deepEqual(ndcCandidates('(01)00380425039313(17)261231'), ['8042-5039-31', '80425-039-31', '80425-0393-1']);
  assert.deepEqual(ndcCandidates('80425-0393-01'), ['80425-393-01', '80425-0393-1']); // 11-digit padded
  assert.deepEqual(ndcCandidates('12345'), []);
  assert.deepEqual(ndcCandidates('hello'), []);
  assert.deepEqual(ndcCandidates(''), []);
});

test('NDC result -> form fields', () => {
  const r = fromNdcResult({ brand_name: 'ADVIL', generic_name: 'IBUPROFEN', dosage_form: 'TABLET, COATED', active_ingredients: [{ name: 'IBUPROFEN', strength: '200 mg/1' }], product_ndc: '0573-0150' });
  assert.deepEqual(r, { name: 'Advil', generic: 'Ibuprofen', strength: '200 mg', form: 'tablet', productNdc: '0573-0150' });
  assert.equal(formFromFda('CAPSULE, GELATIN COATED'), 'capsule');
  assert.equal(formFromFda('SOLUTION'), 'liquid');
  assert.equal(formFromFda('INJECTION, SOLUTION'), 'injection');
  assert.equal(formFromFda('AEROSOL, METERED'), 'inhaler');
  assert.equal(formFromFda('PATCH, EXTENDED RELEASE'), 'patch');
  assert.equal(formFromFda('???'), 'tablet');
  assert.equal(strengthText([{ strength: '25 mg/1' }, { strength: '20 mg/1' }]), '25 mg / 20 mg');
  assert.equal(fromNdcResult(null), null);
  assert.equal(fromNdcResult({}), null);
});

test('NDC lookup queries every grouping in one request', async () => {
  const urls = [];
  const r = await lookupNdc('380425039313', async (u) => {
    urls.push(u);
    return { ok: true, status: 200, json: async () => ({ results: [{ brand_name: 'Ibuprofen', generic_name: 'IBUPROFEN', dosage_form: 'TABLET', active_ingredients: [{ strength: '800 mg/1' }] }] }) };
  });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /drug\/ndc\.json\?search=packaging\.package_ndc:"8042-5039-31"\+packaging\.package_ndc:"80425-039-31"\+packaging\.package_ndc:"80425-0393-1"/);
  assert.equal(r.strength, '800 mg');
  assert.equal(await lookupNdc('nope', async () => assert.fail('should not fetch')), null);
  assert.equal(await lookupNdc('0573-0150-30', async () => ({ ok: false, status: 404 })), null);
});

test('weights convert to the chosen unit', () => {
  assert.equal(weightIn({ value: 100, unit: 'kg' }, 'kg'), 100);
  assert.equal(Math.round(weightIn({ value: 100, unit: 'kg' }, 'lb')), 220);
  assert.equal(Math.round(weightIn({ value: 220.462, unit: 'lb' }, 'kg')), 100);
  assert.equal(weightIn({ value: 150 }, 'lb'), 150); // old readings without a unit = lb
});

test('as-needed limits survive the sanitizer and junk is dropped', () => {
  const s = migrate({ meds: [{ id: 'a', name: 'A', asNeeded: true, minGap: '6', maxPerDay: 4 }, { id: 'b', name: 'B', minGap: 'x', maxPerDay: -3 }] });
  assert.equal(s.meds[0].minGap, 6);
  assert.equal(s.meds[0].maxPerDay, 4);
  assert.equal(s.meds[1].minGap, null);
  assert.equal(s.meds[1].maxPerDay, 0);
});
