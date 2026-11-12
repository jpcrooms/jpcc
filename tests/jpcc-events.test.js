const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../assets/js/jpcc-events.js');
const dataRoot = path.join(__dirname, '..');
const clubs = JSON.parse(fs.readFileSync(path.join(dataRoot, 'data/clubs.json'), 'utf8'));
const extras = JSON.parse(fs.readFileSync(path.join(dataRoot, 'events.json'), 'utf8'));
const rooms = JSON.parse(fs.readFileSync(path.join(dataRoot, 'data/rooms.json'), 'utf8'));
const asData = { clubs, events: extras, rooms, bookings: [] };

test('two club pages are loaded, but only documented schedule is created', () => {
  assert.equal(clubs.length, 2);
  assert.equal(clubs.find(c => c.id === 'vk5alm').events.length, 1);
  assert.equal(clubs.find(c => c.id === 'murray-bridge-christadelphians').events.length, 0);
});

test('2nd and 4th Wednesday events in November and December 2026', () => {
  const evs = lib.expandRecurring(clubs, '2026-11-01', '2027-01-01');
  assert.deepEqual(evs.map(ev => ev.start.slice(0, 10)), [
    '2026-11-11', '2026-11-25', '2026-12-09', '2026-12-23'
  ]);
  assert.equal(evs[0].end, undefined); // The supplied page gives no finishing time.
  assert.equal(evs[0].extendedProps.clubName, 'Lower Murray Radio Club');
});

test('recurrence works beyond 2035', () => {
  const evs = lib.expandRecurring(clubs, '2040-01-01', '2040-02-01');
  assert.equal(evs.length, 2);
});

test('weekly events for a second club, with exclusions', () => {
  const other = [{ id: 'example', name: 'Another club', events: [{
    id: 'weekly', title: 'Weekly club session', frequency: 'weekly',
    weekdays: ['sun'], startDate: '2026-11-01', startTime: '10:00',
    endTime: '12:00', skipDates: ['2026-11-15']
  }]}];
  assert.deepEqual(lib.expandRecurring(other, '2026-11-01', '2026-12-01')
    .map(ev => ev.start.slice(0, 10)), ['2026-11-01', '2026-11-08', '2026-11-22', '2026-11-29']);
});

test('last and fifth weekdays, month interval, start and end bounds', () => {
  const list = [{id: 'last', name: 'Last day club', events: [{
    id: 'm', title: 'Special', frequency: 'monthly', weekday: 'sun',
    weeks: [5, -1], interval: 2, startDate: '2026-11-15', until: '2027-02-01',
    startTime: '13:00', endTime: '14:00'
  }]}];
  // November 2026 has a fifth Sunday; 5 and -1 must not duplicate it.
  const evs = lib.expandRecurring(list, '2026-11-01', '2027-03-01');
  assert.deepEqual(evs.map(e => e.start.slice(0, 10)), ['2026-11-29', '2027-01-31']);
});

test('one-off event is kept and has correct date; no invalid end time', () => {
  const evs = lib.publicEventsForRange(asData, '2026-11-22', '2026-11-23');
  assert.equal(evs.length, 1);
  assert.equal(evs[0].clubId, 'murray-bridge-christadelphians');
  assert.equal(evs[0].end, undefined);
});

test('club filter excludes other club events', () => {
  const evs = lib.publicEventsForRange(asData, '2026-11-01', '2026-12-01', 'vk5alm');
  assert.equal(evs.length, 2);
  assert.ok(evs.every(e => e.clubId === 'vk5alm'));
});

test('room conflicts only occur for overlapping uses of same room', () => {
  const occupied = [
    {id:'a', roomId:'room-1', start:'2026-11-11T19:00:00', end:'2026-11-11T21:00:00'},
    {id:'b', roomId:'room-1', start:'2026-11-11T20:00:00', end:'2026-11-11T22:00:00'},
    {id:'c', roomId:'room-2', start:'2026-11-11T20:00:00', end:'2026-11-11T22:00:00'},
    {id:'d', roomId:'room-1', start:'2026-11-11T22:00:00', end:'2026-11-11T23:00:00'},
    {id:'x', roomId:'room-1', start:'2026-11-11T20:00:00', end:'2026-11-11T21:00:00', status:'cancelled'}
  ];
  const conflicts = lib.findRoomConflicts(occupied);
  assert.deepEqual(conflicts.map(pair => pair.map(x => x.id)), [['a', 'b']]);
});

test('room use merges assigned club schedules and hires, ignoring unassigned events', () => {
  const occupiedData = { ...asData, clubs: JSON.parse(JSON.stringify(clubs)), bookings: [
    {id:'hire-1', roomId:'room-1', title:'Room hire', start:'2026-11-11T20:00:00',end:'2026-11-11T21:00:00',status:'confirmed'},
    {id:'cancelled', roomId:'room-1', title:'Cancelled', start:'2026-11-11T20:00:00',end:'2026-11-11T21:00:00',status:'cancelled'}
  ]};
  occupiedData.clubs.find(c => c.id === 'vk5alm').events[0].roomId = 'room-1';
  occupiedData.clubs.find(c => c.id === 'vk5alm').events[0].endTime = '21:00'; // Test fixture: an explicit, confirmed finish.
  const occupancy = lib.roomOccupancyForRange(occupiedData,'2026-11-11','2026-11-12');
  assert.equal(occupancy.length,2);
  assert.equal(lib.findRoomConflicts(occupancy).length,1);
});

test('adelaide time display is seasonal-neutral', () => {
  assert.equal(lib.formatTime('2026-11-11T19:00:00'), '7:00 pm Adelaide time');
  assert.equal(lib.formatTime('2026-11-12'), 'All day');
});


test('room reservation requires explicit finish time; public start-only recurrence is valid', () => {
  const radio = clubs.find(c => c.id === 'vk5alm');
  assert.equal(radio.events[0].endTime, undefined);
  assert.equal(radio.events[0].roomId, undefined);
  const events = lib.expandRecurring(clubs, '2026-11-11', '2026-11-12');
  assert.equal(events.length, 1);
  assert.equal(events[0].end, undefined);
  assert.equal(lib.roomOccupancyForRange(asData, '2026-11-11', '2026-11-12').length, 0);
});
