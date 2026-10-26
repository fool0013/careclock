import test from 'node:test';
import assert from 'node:assert/strict';
import { extract, termsFor, findInteractions, lifestyleFlags, lookupLabel, excerpt, clean, pickGeneric } from '../js/fda.js';

// trimmed-down versions of real openFDA label results
const warfarinLabel = {
  openfda: { generic_name: ['WARFARIN SODIUM'], brand_name: ['Coumadin'] },
  indications_and_usage: ['1 INDICATIONS AND USAGE Warfarin sodium is a vitamin K antagonist indicated for prophylaxis and treatment of venous thrombosis.'],
  boxed_warning: ['WARNING: BLEEDING RISK Warfarin sodium can cause major or fatal bleeding.'],
  drug_interactions: ['7 DRUG INTERACTIONS Concomitant use of drugs that increase bleeding risk. Antiplatelet agents such as aspirin and NSAIDs increase the risk of bleeding. Avoid grapefruit juice in large amounts.'],
  warnings_and_cautions: ['Eat a normal, balanced diet and keep vitamin K intake consistent.'],
};
const aspirinLabel = {
  openfda: { generic_name: ['ASPIRIN'], brand_name: ['Bayer'], pharm_class_epc: ['Nonsteroidal Anti-inflammatory Drug [EPC]', 'Platelet Aggregation Inhibitor [EPC]'] },
  purpose: ['Purpose Pain reliever'],
  ask_doctor_or_pharmacist: ['Ask a doctor or pharmacist before use if you are taking a prescription drug for anticoagulation (thinning the blood).'],
  warnings: ['Alcohol warning: if you consume 3 or more alcoholic drinks every day, ask your doctor.'],
};
const lisinoprilLabel = {
  openfda: { generic_name: ['LISINOPRIL'], brand_name: ['Zestril'], pharm_class_epc: ['Angiotensin Converting Enzyme Inhibitor [EPC]'] },
  indications_and_usage: ['Hypertension. Lisinopril is indicated for the treatment of hypertension.'],
  drug_interactions: ['Diuretics: patients on diuretics may experience hypotension. Potassium supplements and salt substitutes may increase serum potassium.'],
};

test('extract keeps only what the app needs', () => {
  const L = extract(warfarinLabel);
  assert.equal(L.generic, 'WARFARIN SODIUM');
  assert.deepEqual(L.brands, ['Coumadin']);
  assert.match(L.purpose, /^Warfarin sodium is a vitamin K antagonist/);
  assert.match(L.boxed, /^BLEEDING RISK/);
  assert.match(L.text, /aspirin and NSAIDs/);
  assert.ok(L.fetchedAt);
});

test('terms include generic names without salts, brands and class words', () => {
  const w = termsFor({ name: 'Warfarin', fda: extract(warfarinLabel) });
  assert.ok(w.includes('warfarin'));
  assert.ok(w.includes('coumadin'));
  assert.ok(w.includes('anticoagulation'));
  const a = termsFor({ name: 'Aspirin', fda: extract(aspirinLabel) });
  assert.ok(a.includes('nsaids'));
  assert.ok(a.includes('antiplatelet'));
  const l = termsFor({ name: 'Lisinopril', fda: null });
  assert.ok(l.includes('ace inhibitor'));
});

test('finds warfarin + aspirin from either label, strong words flagged', () => {
  const meds = [
    { id: 'w', name: 'Warfarin', fda: extract(warfarinLabel) },
    { id: 'a', name: 'Aspirin', fda: extract(aspirinLabel) },
    { id: 'l', name: 'Lisinopril', fda: extract(lisinoprilLabel) },
  ];
  const found = findInteractions(meds);
  assert.equal(found.length, 1);
  assert.equal(found[0].a, 'w');
  assert.equal(found[0].b, 'a');
  assert.equal(found[0].strong, true); // "bleeding"
  assert.match(found[0].excerpt, /aspirin/i);
});

test('no false match between unrelated meds or a med and itself', () => {
  const meds = [{ id: 'l', name: 'Lisinopril', fda: extract(lisinoprilLabel) }, { id: 'v', name: 'Vitamin D3', fda: { notFound: true } }];
  assert.equal(findInteractions(meds).length, 0);
  // two statins share the word "statin" -> must not flag each other through it
  const s = [{ id: '1', name: 'Atorvastatin', fda: { text: 'Other statins may increase risk.' } }, { id: '2', name: 'Simvastatin', fda: { text: '' } }];
  assert.equal(findInteractions(s).length, 0);
});

test('archived meds are ignored', () => {
  const meds = [{ id: 'w', name: 'Warfarin', fda: extract(warfarinLabel) }, { id: 'a', name: 'Aspirin', archived: true, fda: extract(aspirinLabel) }];
  assert.equal(findInteractions(meds).length, 0);
});

test('lifestyle flags read the label text', () => {
  assert.deepEqual(lifestyleFlags({ fda: extract(warfarinLabel) }).sort(), ['grapefruit', 'vitaminK']);
  assert.deepEqual(lifestyleFlags({ fda: extract(aspirinLabel) }), ['alcohol']);
  assert.deepEqual(lifestyleFlags({ fda: extract(lisinoprilLabel) }), ['potassium']);
  assert.deepEqual(lifestyleFlags({}), []);
});

test('excerpt trims to the matching sentence', () => {
  const text = 'First sentence here. The aspirin sentence is this one. Last one.';
  const i = text.indexOf('aspirin');
  assert.equal(excerpt(text, i, 7), 'The aspirin sentence is this one.');
  const long = 'x'.repeat(50) + ' ' + 'word '.repeat(60) + 'aspirin ' + 'more '.repeat(60);
  const ex = excerpt(long, long.indexOf('aspirin'), 7);
  assert.ok(ex.startsWith('…word') && ex.endsWith('…'), 'cut mid-text at word boundaries');
  assert.ok(ex.length < 330);
  assert.equal(clean('<b>a</b>\n  b'), 'a b');
});

test('picks the exact single-ingredient drug, not a combo pill', () => {
  const c = (term, count) => ({ term, count });
  assert.equal(pickGeneric('Lisinopril', [c('LISINOPRIL AND HYDROCHLOROTHIAZIDE', 39), c('LISINOPRIL', 152)]), 'LISINOPRIL');
  assert.equal(pickGeneric('metformin', [c('SITAGLIPTIN AND METFORMIN HYDROCHLORIDE', 15), c('METFORMIN HYDROCHLORIDE', 238)]), 'METFORMIN HYDROCHLORIDE');
  assert.equal(pickGeneric('Lipitor', [c('ATORVASTATIN CALCIUM', 1)]), 'ATORVASTATIN CALCIUM');
  assert.equal(pickGeneric('Zestoretic', [c('LISINOPRIL AND HYDROCHLOROTHIAZIDE', 1)]), 'LISINOPRIL AND HYDROCHLOROTHIAZIDE');
  assert.equal(pickGeneric('Vitamin D3', [c('FOLIC ACID, VITAMIN D3', 6), c('FOLATE, VITAMIN D3', 3)]), null);
  assert.equal(pickGeneric('x', []), null);
});

test('lookupLabel: count names, then fetch the chosen label', async () => {
  const urls = [];
  const fake = async (u) => {
    urls.push(u);
    if (u.includes('count=')) return { ok: true, status: 200, json: async () => ({ results: [{ term: 'LISINOPRIL', count: 9 }] }) };
    return { ok: true, status: 200, json: async () => ({ results: [lisinoprilLabel] }) };
  };
  const L = await lookupLabel('Lisinopril', fake);
  assert.match(urls[0], /openfda\.brand_name:"Lisinopril"\+openfda\.generic_name:"Lisinopril"&count=openfda\.generic_name\.exact/);
  assert.match(urls[1], /openfda\.generic_name\.exact:"LISINOPRIL"\+AND\+_exists_:drug_interactions/);
  assert.equal(L.generic, 'LISINOPRIL');
  assert.equal(await lookupLabel('zzz', async () => ({ ok: false, status: 404 })), null);
  await assert.rejects(lookupLabel('x', async () => ({ ok: false, status: 500 })));
});
