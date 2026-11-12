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

test('hall names, IDs and capacities match room hire options', () => {
  assert.deepEqual(rooms.map(r => [r.id, r.name, r.capacity]), [
    ['room-1', 'Large Hall', 80],
    ['room-2', 'Small Hall', 25]
  ]);
});

// Minimal DOM stand-ins to test the shared module's validation wiring without a browser.
test('room hire form limits attendance by hall and validates finish time and recurrence', () => {
  function field(value = '') {
    const listeners = {};
    return {
      value, max: '', min: '', required: false, hidden: false, dataset: {},
      validationMessage: '',
      addEventListener: (name, fn) => { listeners[name] = fn; },
      setCustomValidity(message) { this.validationMessage = message; },
      dispatch(name) { listeners[name](); }
    };
  }
  const room = field();
  const large = {dataset: {capacity:'80'}};
  const small = {dataset: {capacity:'25'}};
  room.selectedOptions = [large];
  const attendees = field('40');
  const date = field('2026-11-13');
  const finishDate = field();
  const start = field('19:00');
  const finish = field('21:00');
  const frequency = field('One-off');
  const repeatContainer = {hidden: true};
  const repeat = field('');
  const note = {textContent: ''};
  const fields = new Map([
    ['#hire-room',room],['#hire-attendees',attendees],['#hire-capacity-note',note],
    ['#hire-date',date],['#hire-end-date',finishDate],['#hire-start',start],['#hire-end',finish],
    ['#hire-frequency',frequency],['#hire-repeat-container',repeatContainer],
    ['#hire-repeat',repeat]
  ]);
  const listeners = {};
  const form = {
    querySelector: selector => fields.get(selector),
    addEventListener: (name, fn) => { listeners[name] = fn; },
    reportValidity: () => !attendees.validationMessage && !finish.validationMessage
  };
  lib.initRoomHireForm(form);
  assert.equal(attendees.max, '80');
  assert.equal(date.min, lib.todayInAdelaide());
  assert.equal(finishDate.value, '2026-11-13');
  assert.equal(repeat.required, false);
  room.selectedOptions = [small];
  room.dispatch('change');
  assert.equal(attendees.max, '25');
  assert.match(attendees.validationMessage, /25/);
  attendees.value = '20';
  attendees.dispatch('input');
  assert.equal(attendees.validationMessage, '');
  finish.value = '18:00';
  finish.dispatch('input');
  assert.match(finish.validationMessage, /later than/);
  let prevented = false;
  listeners.submit({preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  finish.value = '22:00';
  finish.dispatch('input');
  assert.equal(finish.validationMessage, '');
  finishDate.value = '2026-11-14';
  finishDate.dispatch('change');
  finish.value = '01:00';
  finish.dispatch('input');
  assert.equal(finish.validationMessage, ''); // Overnight hire is supported.
  frequency.value = 'Recurring';
  frequency.dispatch('change');
  assert.equal(repeatContainer.hidden, false);
  assert.equal(repeat.required, true);
  frequency.value = 'One-off';
  frequency.dispatch('change');
  assert.equal(repeatContainer.hidden, true);
  assert.equal(repeat.required, false);
});

// No live Formspree requests are made in tests: fetch and FormData are stubbed.
test('Formspree AJAX success sends JSON accept header and leaves original endpoint intact', async () => {
  const fetchOriginal = globalThis.fetch;
  const formDataOriginal = globalThis.FormData;
  try {
    let call;
    globalThis.FormData = class { constructor(form) { this.form = form; } };
    globalThis.fetch = async (url, options) => {
      call = {url, options};
      return {ok: true, status: 200, json: async () => ({ok: true})};
    };
    const form = {action: 'https://formspree.io/f/meagqraw'};
    const outcome = await lib.postRoomHireForm(form);
    assert.equal(outcome.ok, true);
    assert.equal(call.url, 'https://formspree.io/f/meagqraw');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers.Accept, 'application/json');
    assert.equal(call.options.body.form, form);
  } finally {
    globalThis.fetch = fetchOriginal;
    globalThis.FormData = formDataOriginal;
  }
});

test('Formspree validation errors are surfaced, not mistaken for success', async () => {
  const fetchOriginal = globalThis.fetch;
  const formDataOriginal = globalThis.FormData;
  try {
    globalThis.FormData = class {};
    globalThis.fetch = async () => ({ok: false, status: 422,
      json: async () => ({errors: [{message: 'Email address is invalid.'}]})});
    await assert.rejects(lib.postRoomHireForm({action: 'https://formspree.io/f/meagqraw'}), /Email address is invalid/);
    globalThis.fetch = async () => ({ok: false, status: 429, json: async () => ({})});
    await assert.rejects(lib.postRoomHireForm({action: 'https://formspree.io/f/meagqraw'}), /Too many submissions/);
    globalThis.fetch = async () => ({ok: true, status: 200, json: async () => { throw Error('Unexpected HTML'); }});
    await assert.rejects(lib.postRoomHireForm({action: 'https://formspree.io/f/meagqraw'}), /unexpected response/);
  } finally {
    globalThis.fetch = fetchOriginal;
    globalThis.FormData = formDataOriginal;
  }
});
