// .ics calendar export. a web page can't ring an alarm when it's fully closed,
// but the phone's own calendar can -> export every dose as a repeating event with an alert.

import { pad } from './util.js';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// floating local time (no Z) so 8:00 stays 8:00 wherever the phone is
const local = (ds, t) => `${ds.replace(/-/g, '')}T${t.replace(':', '')}00`;
const utcStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

// RFC 5545: lines max 75 octets, continuation lines start with a space
export function fold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    const b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// events: [{uid, title, description, date, time, minutes, rrule, alarms: [minutesBefore]}]
export function buildICS(events, now = new Date()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareClock//Medicine Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.uid}@careclock`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${local(e.date, e.time)}`, `DURATION:PT${e.minutes || 5}M`, `SUMMARY:${icsEscape(e.title)}`);
    if (e.description) L.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.rrule) L.push(`RRULE:${e.rrule}`);
    for (const m of e.alarms || [0]) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:${m ? `-PT${m}M` : 'PT0M'}`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export function rruleFor(med) {
  let r = med.days?.length && med.days.length < 7 ? `FREQ=WEEKLY;BYDAY=${med.days.map((d) => DAYS[d]).join(',')}` : 'FREQ=DAILY';
  if (med.endDate) r += `;UNTIL=${med.endDate.replace(/-/g, '')}T235959`;
  return r;
}

// one repeating event per med per time of day
export function medEvents(meds, today, describe) {
  const ev = [];
  for (const m of meds) {
    if (m.asNeeded || m.archived) continue;
    for (const t of m.times || []) {
      ev.push({ uid: `${m.id}-${t.replace(':', '')}`, title: `${m.name}${m.strength ? ' ' + m.strength : ''}`, description: describe(m), date: m.startDate && m.startDate > today ? m.startDate : today, time: t, rrule: rruleFor(m), alarms: [0] });
    }
  }
  return ev;
}

export function apptEvent(a) {
  const [date, time] = a.at.split('T');
  return { uid: `appt-${a.id}`, title: a.with, description: [a.place, a.phone, a.notes].filter(Boolean).join('\n'), date, time: time.slice(0, 5), minutes: 60, alarms: [60 * 24, 60] };
}
