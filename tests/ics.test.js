import test from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, fold, icsEscape, rruleFor, medEvents, apptEvent } from '../js/ics.js';

test('escapes special characters', () => {
  assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('folds long lines at 75 octets, multi-byte safe', () => {
  const line = 'SUMMARY:' + '药'.repeat(40); // 3 bytes each
  const parts = fold(line).split('\r\n');
  const bytes = (s) => new TextEncoder().encode(s).length;
  assert.ok(parts.every((p) => bytes(p) <= 75));
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), line);
});

test('daily and weekly repeat rules', () => {
  assert.equal(rruleFor({ days: [] }), 'FREQ=DAILY');
  assert.equal(rruleFor({ days: [1, 3, 5] }), 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
  assert.equal(rruleFor({ days: [], endDate: '2026-12-31' }), 'FREQ=DAILY;UNTIL=20261231T235959');
});

test('one event per med per time, with an alarm at dose time', () => {
  const meds = [
    { id: 'a', name: 'Metformin', strength: '500 mg', times: ['08:00', '18:00'], days: [] },
    { id: 'b', name: 'Ibuprofen', asNeeded: true, times: [] },
    { id: 'c', name: 'Old', archived: true, times: ['09:00'] },
  ];
  const ev = medEvents(meds, '2026-10-26', () => 'Take 1 tablet');
  assert.equal(ev.length, 2);
  const ics = buildICS(ev, new Date(Date.UTC(2026, 9, 26, 12, 0, 0)));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261026T080000\r\n/);
  assert.match(ics, /DTSTART:20261026T180000\r\n/);
  assert.match(ics, /DTSTAMP:20261026T120000Z/);
  assert.match(ics, /TRIGGER:PT0M/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('appointments get day-before and hour-before alerts', () => {
  const e = apptEvent({ id: 'x', at: '2026-10-29T10:30', with: 'Dr. Patel', place: 'Clinic', phone: '555', notes: '' });
  assert.equal(e.date, '2026-10-29');
  assert.equal(e.time, '10:30');
  const ics = buildICS([e]);
  assert.match(ics, /TRIGGER:-PT1440M/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /DESCRIPTION:Clinic\\n555/);
});
