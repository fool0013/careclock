// realistic sample person so anyone trying the app can see every feature in 1 tap.
// warfarin + aspirin + ibuprofen is on purpose: a classic risky combo the safety check should catch.

import { defaults } from './store.js';
import { dateStr, addDays, at, uid, rng } from './util.js';
import { dosesFor } from './schedule.js';
import { t } from './i18n.js';

export function buildDemo(now = new Date(), keepSettings) {
  const s = defaults();
  if (keepSettings) s.settings = { ...keepSettings };
  s.settings.onboarded = true;
  const today = dateStr(now);
  const start = addDays(today, -60);
  const R = rng(42);

  s.profile = {
    name: 'Rosa Alvarez', dob: '1948-03-12', blood: 'O+',
    conditions: t('demo.conditions'), allergies: t('demo.allergies'),
    doctor: 'Dr. Priya Patel', doctorPhone: '555-0142', pharmacy: 'Main Street Pharmacy', pharmacyPhone: '555-0199',
    contacts: [
      { name: 'Ana Alvarez', relation: t('demo.daughter'), phone: '555-0123' },
      { name: 'Luis Alvarez', relation: t('demo.son'), phone: '555-0188' },
    ],
    notes: '',
  };

  const med = (o) => ({ id: uid(), strength: '', form: 'tablet', amount: 1, shape: 'round', color: '#f4f1ea', photo: null, times: [], days: [], asNeeded: false, withFood: 'none', instructions: '', quantity: null, refillAt: 7, prescriber: 'Dr. Patel', purpose: '', startDate: start, endDate: '', notes: '', archived: false, fda: null, ...o });
  s.meds = [
    med({ name: 'Lisinopril', strength: '10 mg', color: '#fbcfe8', times: ['08:00'], purpose: t('demo.p.bp'), quantity: 24 }),
    med({ name: 'Metformin', strength: '500 mg', shape: 'oval', times: ['08:00', '18:00'], withFood: 'with', purpose: t('demo.p.diabetes'), quantity: 9 }),
    med({ name: 'Warfarin', strength: '5 mg', color: '#fdba74', times: ['18:00'], purpose: t('demo.p.clots'), instructions: t('demo.i.warfarin'), quantity: 50, prescriber: 'Dr. Nguyen' }),
    med({ name: 'Aspirin', strength: '81 mg', color: '#fde68a', times: ['08:00'], purpose: t('demo.p.heart'), quantity: 100 }),
    med({ name: 'Atorvastatin', strength: '20 mg', shape: 'oval', times: ['21:00'], purpose: t('demo.p.chol'), quantity: 40 }),
    med({ name: 'Vitamin D3', strength: '1000 IU', form: 'capsule', color: '#fde68a', times: ['08:00'], days: [1, 3, 5], purpose: t('demo.p.bones'), prescriber: '' }),
    med({ name: 'Ibuprofen', strength: '200 mg', shape: 'oval', color: '#c4a484', asNeeded: true, minGap: 6, maxPerDay: 4, purpose: t('demo.p.pain'), instructions: t('demo.i.ibuprofen'), quantity: 30, prescriber: '' }),
  ];

  // ~6 weeks of mostly-good history (covers the 5-week calendar) with a few realistic misses
  for (let d = addDays(today, -40); d <= today; d = addDays(d, 1)) {
    for (const dose of dosesFor(s.meds, d)) {
      const due = at(d, dose.time);
      if (d === today && due > new Date(now - 45 * 60000)) continue; // leave recent/future doses open
      const r = R();
      if (r < 0.06) continue; // missed
      const status = r < 0.08 ? 'skipped' : 'taken';
      (s.log[d] ||= {})[dose.key] = { status, at: new Date(+due + Math.round(R() * 25 - 5) * 60000).toISOString() };
    }
  }
  const ibu = s.meds[6].id;
  for (const back of [2, 9, 16]) s.prn.push({ id: uid(), medId: ibu, at: at(addDays(today, -back), '14:20').toISOString() });
  // one dose ~2h ago (if that's still today) so the "next dose allowed at" safety line shows
  const recent = new Date(+now - 2 * 36e5);
  if (dateStr(recent) === today) s.prn.push({ id: uid(), medId: ibu, at: recent.toISOString() });

  // blood pressure trending down after the new med = a nice story for the doctor
  for (let i = 28; i >= 0; i -= 2) {
    const d = addDays(today, -i);
    const k = (28 - i) / 28;
    s.vitals.push({ id: uid(), type: 'bp', at: at(d, '08:30').toISOString(), sys: Math.round(146 - 18 * k + R() * 8 - 4), dia: Math.round(90 - 10 * k + R() * 6 - 3), pulse: Math.round(72 + R() * 8 - 4) });
  }
  for (let i = 27; i >= 0; i -= 3) s.vitals.push({ id: uid(), type: 'glucose', at: at(addDays(today, -i), '07:45').toISOString(), value: Math.round(118 + R() * 40 - 15) });
  for (let i = 28; i >= 0; i -= 7) s.vitals.push({ id: uid(), type: 'weight', at: at(addDays(today, -i), '07:30').toISOString(), value: +(163 - (28 - i) * 0.08 + R()).toFixed(1), unit: 'lb' });

  s.appts = [
    { id: uid(), at: `${addDays(today, 3)}T10:30`, with: 'Dr. Priya Patel', place: t('demo.place1'), phone: '555-0142', notes: t('demo.apptNote') },
    { id: uid(), at: `${addDays(today, 12)}T14:00`, with: 'Dr. Minh Nguyen', place: t('demo.place2'), phone: '555-0177', notes: '' },
    { id: uid(), at: `${addDays(today, -20)}T09:00`, with: 'Dr. Priya Patel', place: t('demo.place1'), phone: '555-0142', notes: '' },
  ];
  s.questions = [
    { id: uid(), text: t('demo.q1'), done: false },
    { id: uid(), text: t('demo.q2'), done: false },
    { id: uid(), text: t('demo.q3'), done: true },
  ];
  return s;
}
