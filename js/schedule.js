// all the "what should be taken when" logic. pure functions -> unit tested in tests/schedule.test.js

import { dateStr, parseDate, addDays, at, dateRange } from './util.js';

export const DUE_EARLY = 30; // dose shows "due now" this many min before its time
export const LATE_AFTER = 60; // and "late" this many min after

export function isActiveOn(med, ds) {
  // a stopped med still counts on the days before it was stopped, so history stays truthful
  if (med.archived && !med.endDate) return false;
  if (med.startDate && ds < med.startDate) return false;
  if (med.endDate && ds > med.endDate) return false;
  if (med.days?.length && !med.days.includes(parseDate(ds).getDay())) return false;
  return true;
}

// every scheduled dose on a given day, sorted by time
export function dosesFor(meds, ds) {
  const out = [];
  for (const med of meds) {
    if (med.asNeeded || !isActiveOn(med, ds)) continue;
    for (const time of med.times || []) out.push({ med, time, date: ds, key: `${med.id}@${time}` });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name));
}

// taken | skipped | upcoming | due | late | missed
export function statusOf(dose, log, now = new Date()) {
  const e = log[dose.date]?.[dose.key];
  if (e) return e.status;
  const diff = (now - at(dose.date, dose.time)) / 60000;
  if (dose.date < dateStr(now)) return 'missed';
  if (dose.date > dateStr(now) || diff < -DUE_EARLY) return 'upcoming';
  if (diff <= LATE_AFTER) return 'due';
  return 'late';
}

// counts for one day. only doses whose time has already come count against you
export function dayStats(meds, log, ds, now = new Date()) {
  const s = { total: 0, taken: 0, skipped: 0, missed: 0, pending: 0 };
  for (const d of dosesFor(meds, ds)) {
    s.total++;
    const st = statusOf(d, log, now);
    if (st === 'taken') s.taken++;
    else if (st === 'skipped') s.skipped++;
    else if (st === 'missed' || st === 'late') s.missed++;
    else s.pending++;
  }
  return s;
}

// adherence % over a range. pending (future) doses are ignored. null = nothing to score
export function adherence(meds, log, from, to, now = new Date()) {
  let taken = 0, counted = 0;
  const days = dateRange(from, to).map((ds) => {
    const s = dayStats(meds, log, ds, now);
    const c = s.taken + s.skipped + s.missed;
    taken += s.taken;
    counted += c;
    return { date: ds, ...s, pct: c ? Math.round((100 * s.taken) / c) : null };
  });
  return { taken, counted, pct: counted ? Math.round((100 * taken) / counted) : null, days };
}

// consecutive perfect days ending yesterday (+ today if it's already fully done)
export function streak(meds, log, now = new Date()) {
  const today = dateStr(now);
  const t = dayStats(meds, log, today, now);
  let n = t.total > 0 && t.taken === t.total ? 1 : 0;
  let d = addDays(today, -1);
  for (let i = 0; i < 365; i++, d = addDays(d, -1)) {
    const s = dayStats(meds, log, d, now);
    if (s.total === 0) {
      // no meds scheduled that day. stop once we're before any med existed
      if (!meds.some((m) => !m.startDate || m.startDate <= d)) break;
      continue;
    }
    if (s.taken !== s.total) break;
    n++;
  }
  return n;
}

// units used per day on average (handles "only mon/wed/fri")
export function unitsPerDay(med) {
  if (med.asNeeded || med.archived) return 0;
  const perWeek = med.days?.length ? med.days.length : 7;
  return ((med.times?.length || 0) * (Number(med.amount) || 1) * perWeek) / 7;
}

export function daysLeft(med) {
  if (med.quantity == null || med.quantity === '') return null;
  const u = unitsPerDay(med);
  return u ? Math.floor(Number(med.quantity) / u) : null;
}

export function needsRefill(med) {
  const d = daysLeft(med);
  return d != null && d <= (med.refillAt ?? 7);
}

// first dose today that still needs doing; falls back to tomorrow's first
export function nextDose(meds, log, now = new Date()) {
  const today = dateStr(now);
  const open = dosesFor(meds, today).filter((d) => ['due', 'late', 'upcoming'].includes(statusOf(d, log, now)));
  if (open.length) return open[0];
  return dosesFor(meds, addDays(today, 1))[0] || null;
}

export function periodOf(time) {
  const h = Number(time.slice(0, 2));
  if (h >= 4 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

// as-needed (PRN) safety: "wait at least N hours" and "no more than M in 24 hours"
export function prnStatus(med, prn, now = new Date()) {
  const uses = prn.filter((p) => p.medId === med.id).map((p) => new Date(p.at)).filter((d) => d <= now).sort((a, b) => b - a);
  const last = uses[0] || null;
  const gap = Number(med.minGap) || 0;
  const max = Number(med.maxPerDay) || 0;
  const in24 = uses.filter((d) => now - d < 864e5).length;
  const nextAt = last && gap ? new Date(+last + gap * 36e5) : null;
  return {
    last,
    countToday: uses.filter((d) => dateStr(d) === dateStr(now)).length,
    in24,
    nextAt,
    hoursSince: last ? (now - last) / 36e5 : null,
    tooSoon: !!nextAt && nextAt > now,
    overMax: max > 0 && in24 >= max,
  };
}

// minutes until a dose's scheduled time (negative = overdue)
export const minutesUntil = (dose, now = new Date()) => (at(dose.date, dose.time) - now) / 60000;
