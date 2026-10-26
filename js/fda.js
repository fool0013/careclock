// FDA drug label lookup (openFDA, free, no key) + a simple interaction screen.
// idea: each official label has a "drug interactions" section. if med A's label names
// med B (or B's drug class), flag it so the family can ask the pharmacist.
// this is a conversation starter, NOT a replacement for a pharmacist.

const API = 'https://api.fda.gov/drug/label.json';

// salt words stripped so "warfarin sodium" also matches plain "warfarin"
const SALTS = /\b(sodium|potassium|hydrochloride|hcl|calcium|magnesium|besylate|tartrate|succinate|maleate|mesylate|citrate|sulfate|acetate|phosphate|bromide|fumarate|hyclate|monohydrate|dihydrate|anhydrous|er|xr|sr|dr)\b/g;

// label text usually talks about drug *classes* ("NSAIDs", "anticoagulants"), so each
// common senior med gets the class words a label would use for it
const CLASS_TERMS = [
  [/warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|heparin|enoxaparin/, ['anticoagulant', 'anticoagulants', 'anticoagulation', 'blood thinner', 'thinning the blood']],
  [/aspirin|clopidogrel|prasugrel|ticagrelor/, ['antiplatelet', 'platelet aggregation inhibitor']],
  [/aspirin|ibuprofen|naproxen|celecoxib|diclofenac|meloxicam|ketorolac|indomethacin/, ['nsaid', 'nsaids', 'nonsteroidal anti-inflammatory']],
  [/pril$/, ['ace inhibitor', 'ace inhibitors', 'angiotensin converting enzyme', 'angiotensin-converting enzyme']],
  [/sartan$/, ['angiotensin receptor blocker', 'angiotensin ii receptor', 'arbs']],
  [/statin$/, ['statin', 'statins', 'hmg-coa reductase']],
  [/hydrochlorothiazide|chlorthalidone|furosemide|torsemide|bumetanide|indapamide/, ['diuretic', 'diuretics']],
  [/spironolactone|eplerenone|amiloride|triamterene/, ['potassium-sparing', 'potassium sparing', 'diuretic', 'diuretics']],
  [/metformin|glipizide|glyburide|glimepiride|insulin|pioglitazone|sitagliptin|empagliflozin|dapagliflozin/, ['antidiabetic', 'hypoglycemic', 'blood glucose lowering', 'antidiabetic agents']],
  [/glipizide|glyburide|glimepiride/, ['sulfonylurea', 'sulfonylureas', 'insulin secretagogue']],
  [/sertraline|fluoxetine|citalopram|escitalopram|paroxetine|fluvoxamine/, ['ssri', 'ssris', 'selective serotonin reuptake', 'serotonergic']],
  [/duloxetine|venlafaxine|desvenlafaxine/, ['snri', 'snris', 'serotonergic']],
  [/tramadol|oxycodone|hydrocodone|morphine|codeine|fentanyl|hydromorphone/, ['opioid', 'opioids']],
  [/lorazepam|alprazolam|diazepam|clonazepam|temazepam/, ['benzodiazepine', 'benzodiazepines', 'cns depressant', 'cns depressants']],
  [/metoprolol|atenolol|carvedilol|propranolol|bisoprolol|nebivolol/, ['beta blocker', 'beta-blocker', 'beta blockers', 'beta-blockers', 'beta-adrenergic blocking']],
  [/amlodipine|diltiazem|verapamil|nifedipine|felodipine/, ['calcium channel blocker', 'calcium channel blockers']],
  [/omeprazole|pantoprazole|esomeprazole|lansoprazole|rabeprazole/, ['proton pump inhibitor', 'proton pump inhibitors', 'ppis']],
  [/prednisone|prednisolone|methylprednisolone|dexamethasone/, ['corticosteroid', 'corticosteroids']],
  [/levothyroxine|liothyronine/, ['thyroid hormone', 'thyroid hormones']],
  [/potassium chloride/, ['potassium supplement', 'potassium supplements']],
];

// things on the label worth knowing day to day
export const LIFESTYLE = {
  grapefruit: /grapefruit/i,
  alcohol: /drink(?:ing)? alcohol|alcohol(?:ic)? (?:use|intake|consumption|beverages?|drinks?)|ethanol/i,
  vitaminK: /vitamin k\b/i,
  potassium: /potassium supplements?|salt substitutes?/i,
  sun: /sunlight|sun exposure|photosensitiv|sunlamp/i,
  drowsy: /operat(?:e|ing) (?:heavy )?machinery|drive a car|driving/i,
};

const STRONG = /contraindicated|do not use|avoid|fatal|life-threatening|serious|bleeding|death/i;

const first = (a) => (Array.isArray(a) ? a[0] || '' : a || '');
export const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([).,;:])/g, '$1').replace(/\(\s+/g, '(').trim();

// shorten to about n characters, ending on a sentence (or at least a whole word)
export function clip(s, n) {
  if (!s || s.length <= n) return s || '';
  const cut = s.slice(0, n);
  const dot = cut.lastIndexOf('. ');
  if (dot > n * 0.5) return cut.slice(0, dot + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
}

// shrink a raw openFDA result to just what we store
export function extract(r) {
  const o = r.openfda || {};
  const join = (...keys) => clean(keys.map((k) => [].concat(r[k] || []).join(' ')).join(' '));
  return {
    generic: (o.generic_name || [])[0] || '',
    brands: (o.brand_name || []).slice(0, 5),
    classes: (o.pharm_class_epc || []).map((c) => c.replace(/\s*\[EPC\]/, '')),
    purpose: clean(first(r.purpose) || first(r.indications_and_usage)).replace(/^(\d+(\.\d+)?\s*)?(indications\s*(and|&)\s*usage|purposes?|uses?)\s*:?\s*/i, '').slice(0, 1000),
    boxed: clean(first(r.boxed_warning)).replace(/^((boxed\s+)?warning:?\s*)+/i, '').slice(0, 1000),
    // section most likely to name other drugs, capped so localStorage doesn't balloon
    text: join('drug_interactions', 'drug_interactions_table', 'ask_doctor_or_pharmacist', 'do_not_use', 'contraindications', 'boxed_warning').slice(0, 24000),
    lifestyleText: join('drug_interactions', 'warnings', 'warnings_and_cautions', 'information_for_patients', 'ask_doctor', 'when_using').slice(0, 30000),
    fetchedAt: new Date().toISOString(),
  };
}

const ingredients = (term) => baseName(term).split(/\s*(?:,| and |\/|-)\s*/).filter(Boolean);

// a fuzzy search for "lisinopril" also hits "lisinopril and hydrochlorothiazide" combo pills.
// openFDA can count matching generic names cheaply, so pick the right one before downloading a label:
// exact name > single-ingredient (brand typed, e.g. Lipitor) > combo only if the user typed a combo brand
export function pickGeneric(query, counts) {
  const q = baseName(query);
  const byCount = counts.slice().sort((a, b) => b.count - a.count);
  const exact = byCount.find((c) => baseName(c.term) === q);
  if (exact) return exact.term;
  const single = byCount.find((c) => ingredients(c.term).length === 1);
  if (single) return single.term;
  // only combos matched: fine for a combo brand ("Zestoretic"), wrong for "vitamin d3" inside a multivitamin
  if (byCount.some((c) => ingredients(c.term).includes(q))) return null;
  return byCount[0]?.term || null;
}

async function getJson(url, fetchFn) {
  const r = await fetchFn(url);
  if (r.status === 404) return null; // openFDA answers 404 for "no matches"
  if (!r.ok) throw new Error(`FDA lookup failed (${r.status})`);
  return r.json();
}

export async function lookupLabel(name, fetchFn = fetch) {
  const q = encodeURIComponent(name.trim().replace(/["\\]/g, ''));
  if (!q) return null;
  const counts = await getJson(`${API}?search=openfda.brand_name:"${q}"+openfda.generic_name:"${q}"&count=openfda.generic_name.exact&limit=25`, fetchFn);
  const term = pickGeneric(name, counts?.results || []);
  if (!term) return null;
  const g = encodeURIComponent(term.replace(/"/g, ''));
  // prescription labels have a real "drug interactions" section; OTC ones (aspirin) don't, so fall back
  const j = (await getJson(`${API}?search=openfda.generic_name.exact:"${g}"+AND+_exists_:drug_interactions&limit=1`, fetchFn))
    || (await getJson(`${API}?search=openfda.generic_name.exact:"${g}"&limit=1`, fetchFn));
  return j?.results?.[0] ? extract(j.results[0]) : null;
}

// name suggestions while typing ("lisi" -> Lisinopril). count queries are tiny vs full labels
export async function suggest(prefix, fetchFn = fetch) {
  const p = prefix.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '');
  if (p.length < 3 || p.includes(' ')) return [];
  const search = `search=openfda.brand_name:${p}*+openfda.generic_name:${p}*`;
  const lists = await Promise.all(['brand_name', 'generic_name'].map(async (f) => {
    const r = await fetchFn(`${API}?${search}&count=openfda.${f}.exact&limit=30`);
    return r.ok ? (await r.json()).results || [] : [];
  }));
  const names = new Set();
  for (const { term } of lists.flat().sort((a, b) => b.count - a.count)) {
    const n = baseName(term);
    if (n.startsWith(p) && n.length < 30 && !/[,/\d]| and /.test(n)) names.add(titleCase(n));
  }
  return [...names].slice(0, 8);
}

export const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const baseName = (s) => s.toLowerCase().replace(SALTS, '').replace(/\s+/g, ' ').trim();

// every word/phrase another label might use to refer to this med
export function termsFor(med) {
  const L = med.fda || {};
  const names = [med.name, L.generic, ...(L.brands || [])].filter(Boolean).map(baseName);
  // combo products: "amlodipine and benazepril" -> both parts
  const parts = names.flatMap((n) => n.split(/\s*(?:,| and |\/)\s*/));
  const terms = new Set([...names, ...parts]);
  for (const p of parts) for (const [re, words] of CLASS_TERMS) if (re.test(p)) words.forEach((w) => terms.add(w));
  for (const c of L.classes || []) terms.add(c.toLowerCase().replace(/ drug$/, ''));
  return [...terms].filter((t) => t.length >= 4);
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the sentence around a match, cut at sentence/word boundaries so it reads cleanly
export function excerpt(text, idx, len, before = 140, after = 160) {
  let s = text.lastIndexOf('. ', idx);
  s = s < 0 ? 0 : s + 2;
  if (idx - s > before) s = text.indexOf(' ', idx - before) + 1;
  let e = text.indexOf('. ', idx + len);
  e = e < 0 ? text.length : e + 1;
  if (e - (idx + len) > after) e = text.lastIndexOf(' ', idx + len + after);
  const cutStart = s > 0 && text.slice(Math.max(0, s - 2), s) !== '. ';
  const cutEnd = e < text.length && text[e - 1] !== '.';
  // drop label cross-references like "( 7.1 )" that mean nothing to a patient
  const body = text.slice(s, e).replace(/\s*\(\s*\d+(\.\d+)*\s*\)/g, '').trim().replace(/^\d+(\.\d+)*\s+(?=[A-Za-z])/, '');
  return (cutStart ? '…' : '') + body + (cutEnd ? '…' : '');
}

// earliest mention wins: the prose "drug interactions" section comes before the tables
function findMention(text, terms) {
  let best = null;
  for (const t of terms) {
    const m = new RegExp(`\\b${reEsc(t)}\\b`, 'i').exec(text);
    if (m && (!best || m.index < best.idx)) best = { term: t, idx: m.index, len: m[0].length };
  }
  return best;
}

// pairs of meds where one label mentions the other. returns [{a, b, source, term, excerpt, strong}]
export function findInteractions(meds) {
  const list = meds.filter((m) => !m.archived);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (const [A, B] of [[list[i], list[j]], [list[j], list[i]]]) {
        const text = A.fda?.text;
        if (!text) continue;
        // don't let a med "match" itself through a shared class word (two statins etc)
        const own = new Set(termsFor(A));
        const hit = findMention(text, termsFor(B).filter((t) => !own.has(t)));
        if (!hit) continue;
        const ex = excerpt(text, hit.idx, hit.len);
        out.push({ a: list[i].id, b: list[j].id, source: A.id, term: hit.term, excerpt: ex, strong: STRONG.test(ex) });
        break; // one finding per pair is enough
      }
    }
  }
  return out.sort((x, y) => y.strong - x.strong);
}

export function lifestyleFlags(med) {
  const t = med.fda?.lifestyleText || '';
  return Object.keys(LIFESTYLE).filter((k) => LIFESTYLE[k].test(t));
}

// ---------- barcode / NDC lookup ----------
// US drug packages carry an NDC (National Drug Code). It shows up as:
//   printed "12345-678-90" (10 digits in 4-4-2, 5-3-2 or 5-4-1 groups), or padded 11-digit "12345-0678-90"
//   UPC-A barcode: "3" + 10 NDC digits + check digit;  GS1 DataMatrix GTIN-14: "003" + 10 NDC digits + check
// a bare 10-digit number is ambiguous, so we try every grouping and let openFDA tell us which is real.

const SPLITS = [[4, 4, 2], [5, 3, 2], [5, 4, 1]];
const group = (d, [a, b]) => `${d.slice(0, a)}-${d.slice(a, a + b)}-${d.slice(a + b)}`;

export function ndcCandidates(raw) {
  const s = String(raw || '').trim();
  const parts = s.split('-');
  // already grouped like a real NDC
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const lens = parts.map((p) => p.length).join('-');
    if (['4-4-2', '5-3-2', '5-4-1'].includes(lens)) return [s];
    if (lens === '5-4-2') return ndcCandidates(parts.join(''));
  }
  let d = s.replace(/\D/g, '');
  // GS1 (DataMatrix on prescription packs): "(01)<gtin14>..." or raw "01<gtin14>17<expiry>..."
  const gtin = /\(01\)\s*(\d{14})/.exec(s) || (d.length >= 16 && /^01(\d{14})/.exec(d));
  if (gtin) d = gtin[1];
  if (d.length === 14 && d.startsWith('003')) d = d.slice(3, 13); // GTIN-14
  else if (d.length === 13 && d.startsWith('03')) d = d.slice(2, 12); // EAN-13
  else if (d.length === 12 && d.startsWith('3')) d = d.slice(1, 11); // UPC-A
  if (d.length === 11) {
    // padded 5-4-2: drop the leading zero of whichever group was padded
    const [l, p, k] = [d.slice(0, 5), d.slice(5, 9), d.slice(9)];
    const out = [];
    if (l[0] === '0') out.push(`${l.slice(1)}-${p}-${k}`);
    if (p[0] === '0') out.push(`${l}-${p.slice(1)}-${k}`);
    if (k[0] === '0') out.push(`${l}-${p}-${k.slice(1)}`);
    return out;
  }
  if (d.length === 10) return SPLITS.map((sp) => group(d, sp));
  return [];
}

const FORM_MAP = [
  [/capsule/i, 'capsule'], [/tablet|caplet|pill/i, 'tablet'], [/inhal|aerosol/i, 'inhaler'],
  [/drop|ophthalmic|otic/i, 'drops'], [/patch|transdermal/i, 'patch'], [/cream|ointment|gel|lotion/i, 'cream'],
  [/inject|syringe|pen/i, 'injection'], [/solution|suspension|syrup|liquid|elixir/i, 'liquid'],
];
export const formFromFda = (f) => (FORM_MAP.find(([re]) => re.test(f || '')) || [null, 'tablet'])[1];
// "800 mg/1" -> "800 mg"; combos joined with " / "
export const strengthText = (ings) => (ings || []).map((i) => String(i.strength || '').replace(/\/1$/, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ');

export function fromNdcResult(r) {
  if (!r) return null;
  const name = titleCase(r.brand_name || r.generic_name || '');
  return name ? { name, generic: titleCase(r.generic_name || ''), strength: strengthText(r.active_ingredients), form: formFromFda(r.dosage_form), productNdc: r.product_ndc || '' } : null;
}

export async function lookupNdc(raw, fetchFn = fetch) {
  const c = ndcCandidates(raw);
  if (!c.length) return null;
  const q = c.map((x) => `packaging.package_ndc:"${x}"`).join('+');
  let j = await getJson(`${API.replace('label', 'ndc')}?search=${q}&limit=1`, fetchFn);
  // someone may type just the 2-part product code (12345-678)
  if (!j?.results?.length && /^\d{4,5}-\d{3,4}$/.test(String(raw).trim())) j = await getJson(`${API.replace('label', 'ndc')}?search=product_ndc:"${String(raw).trim()}"&limit=1`, fetchFn);
  return fromNdcResult(j?.results?.[0]);
}
