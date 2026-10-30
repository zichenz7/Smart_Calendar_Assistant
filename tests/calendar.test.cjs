const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sources = ['Code.gs', 'smartbreaker.gs'].map(name => ({
  name, text: fs.readFileSync(path.join(__dirname, '..', name), 'utf8'),
}));

// Apps Script Utilities is mocked with Intl's IANA-zone data. Production uses
// Google's formatDate/parseDate; fixed UTC expectations below are independent.
function parts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(date).map(p => [p.type, p.value]));
}
function formatDate(date, zone, pattern) {
  const p = parts(date, zone);
  const day = `${p.year}-${p.month}-${p.day}`;
  if (pattern === 'yyyy-MM-dd') return day;
  if (pattern === 'HH:mm z') return `${p.hour}:${p.minute} ${p.timeZoneName}`;
  if (pattern === 'yyyy-MM-dd HH:mm z') return `${day} ${p.hour}:${p.minute} ${p.timeZoneName}`;
  throw new Error(`Unmocked date pattern: ${pattern}`);
}
function parseDate(text, zone, pattern) {
  assert.equal(pattern, 'yyyy-MM-dd HH:mm:ss');
  const wall = Date.parse(text.replace(' ', 'T') + 'Z');
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(instant), zone);
    const displayed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += wall - displayed;
  }
  return new Date(instant);
}
function harness({ now = '2026-10-30T15:00:00Z', zone = 'America/Chicago', events = [] } = {}) {
  const clock = Date.parse(now);
  const writes = [], reads = [], texts = [];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  function builder(type) {
    const calls = [];
    let proxy;
    proxy = new Proxy({}, { get(_target, method) {
      if (method === 'build') return () => ({ type, calls });
      return (...args) => {
        calls.push({ method, args });
        if (method === 'setText' || method === 'setSubtitle') texts.push(String(args[0]));
        return proxy;
      };
    }});
    return proxy;
  }
  const calendar = {
    getTimeZone: () => zone,
    getEvents: (from, to) => { reads.push([from.toISOString(), to.toISOString()]); return events; },
  };
  const ctx = vm.createContext({
    Date: FixedDate,
    CalendarApp: { getDefaultCalendar: () => calendar },
    Calendar: { Events: { insert: (event, id) => writes.push({ event, id }) } },
    // Deliberately differs from the calendar zone.
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
    Utilities: { formatDate, parseDate },
    CardService: new Proxy({
      TextButtonStyle: { FILLED: 'FILLED' },
      SelectionInputType: { DROPDOWN: 'DROPDOWN' },
    }, { get(target, key) { return target[key] || (() => builder(key)); } }),
  });
  for (const source of sources) vm.runInContext(source.text, ctx, { filename: source.name });
  return { ctx, writes, reads, texts };
}
function form(epoch = String(Date.parse('2026-10-30T15:00:00Z')), duration = '1') {
  const input = value => ({ stringInputs: { value: [value] } });
  return { commonEventObject: { formInputs: {
    startTime: { dateTimeInput: { msSinceEpoch: epoch, hasDate: true, hasTime: true } },
    duration: input(duration), title: input('Study'), tag: input('CPA Prep'),
    priority: input('High'), flexibility: input('No'), colorId: input('2'),
  } } };
}
function event(start, end, desc = '') {
  return {
    getStartTime: () => new Date(start), getEndTime: () => new Date(end),
    getDescription: () => desc, getTitle: () => 'Example',
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('full scalar string timestamp is preserved and sent as an absolute UTC instant', () => {
  const { ctx, writes, texts } = harness();
  ctx.submitAddTask(form());
  assert.equal(writes.length, 1);
  assert.equal(writes[0].event.start.dateTime, '2026-10-30T15:00:00.000Z');
  assert.equal(writes[0].event.end.dateTime, '2026-10-30T16:00:00.000Z');
  assert.equal(writes[0].event.start.timeZone, 'America/Chicago');
  assert.equal(writes[0].id, 'primary');
  assert.ok(texts.some(t => t.includes('2026-10-30 10:00') && t.includes('America/Chicago')));
});

test('numeric epoch, legacy one-element array and epoch zero are accepted', () => {
  const { ctx } = harness();
  for (const value of [0, '0', ['0']]) {
    assert.equal(ctx.buildTaskEvent_(form(value), 'UTC').start.dateTime, '1970-01-01T00:00:00.000Z');
  }
});

test('missing, partial and malformed dates never write Calendar events', () => {
  const { ctx, writes } = harness();
  for (const value of ['', null, 'abc', '1730123456789junk', Infinity, ['1', '2'], '999999999999999999']) {
    ctx.submitAddTask(form(value));
  }
  for (const flag of ['hasDate', 'hasTime']) {
    const e = form(); e.commonEventObject.formInputs.startTime.dateTimeInput[flag] = false;
    ctx.submitAddTask(e);
  }
  ctx.submitAddTask({});
  assert.equal(writes.length, 0);
});

test('duration must be positive, finite and produce a valid later instant', () => {
  const { ctx, writes } = harness();
  for (const duration of ['0', '-1', 'NaN', 'Infinity', '1hour', '', '1e100', '1e-100']) ctx.submitAddTask(form(undefined, duration));
  assert.equal(writes.length, 0);
  ctx.submitAddTask(form(undefined, '1.5'));
  assert.equal(writes[0].event.end.dateTime, '2026-10-30T16:30:00.000Z');
});

test('spring and autumn DST transitions preserve elapsed duration', () => {
  const { ctx } = harness();
  for (const [start, end] of [
    ['2026-03-08T07:30:00Z', '2026-03-08T08:30:00.000Z'],
    ['2026-11-01T06:30:00Z', '2026-11-01T07:30:00.000Z'],
    ['2026-01-10T15:00:00Z', '2026-01-10T16:00:00.000Z'],
  ]) {
    const result = ctx.buildTaskEvent_(form(String(Date.parse(start))), 'America/Chicago');
    assert.equal(result.start.dateTime, new Date(start).toISOString());
    assert.equal(result.end.dateTime, end);
  }
});

test('today uses the calendar date even when UTC and script dates differ', () => {
  const { ctx } = harness();
  const now = new Date('2026-10-31T02:00:00Z'); // Oct 30, 21:00 Chicago
  assert.equal(ctx.isToday(new Date('2026-10-30T15:00:00Z'), now, 'America/Chicago'), true);
  assert.equal(ctx.isToday(new Date('2026-10-31T06:00:00Z'), now, 'America/Chicago'), false);
});

test('metadata is line-bounded, handles CRLF/CR, Unicode, and canonical casing', () => {
  const { ctx } = harness();
  assert.deepEqual(plain(ctx.parseEventDescription('Tag: CPA Prep 学习\r\nPriority: hIGH\rFlexibility: yES')), {
    tag: 'CPA Prep 学习', priority: 'High', flexibility: 'Yes',
  });
  assert.equal(ctx.parseEventDescription('Tag: Study\nPriority: High').tag, 'Study');
});

test('invalid metadata and labels embedded in prose do not match', () => {
  const { ctx } = harness();
  assert.deepEqual(plain(ctx.parseEventDescription('Discuss Priority: High\nPriority: Highway\nFlexibility: Yesterday\nTag: ')), {});
  assert.deepEqual(plain(ctx.parseEventDescription(null)), {});
});

test('HTML line breaks and paragraph wrappers are supported', () => {
  const { ctx } = harness();
  assert.deepEqual(plain(ctx.parseEventDescription('<p>Tag: Work</p><p>Priority: Low<br/>Flexibility: No</p>')), {
    tag: 'Work', priority: 'Low', flexibility: 'No',
  });
});

test('first valid metadata occurrence wins and generated descriptions round-trip', () => {
  const { ctx } = harness();
  assert.equal(ctx.parseEventDescription('Priority: wrong\nPriority: low\nPriority: High').priority, 'Low');
  assert.deepEqual(plain(ctx.parseEventDescription(ctx.buildTaskEvent_(form(), 'UTC').description)), {
    tag: 'CPA Prep', priority: 'High', flexibility: 'No',
  });
});

test('home and confirmation escape title and tag markup and use rule-based wording', () => {
  const busy = event('2026-10-30T16:00:00Z', '2026-10-30T17:00:00Z', 'Tag: A&B\nPriority: High');
  busy.getTitle = () => '<b>Example</b>';
  const { ctx, texts } = harness({ events: [busy] });
  ctx.createHomePage();
  assert.ok(texts.some(t => t.includes('&lt;b&gt;Example&lt;/b&gt;')));
  assert.ok(texts.some(t => t.includes('A&amp;B')));
  assert.ok(texts.some(t => t.includes('Rule-based')));
  const e = form(); e.commonEventObject.formInputs.title.stringInputs.value = ['<b>Example</b>'];
  ctx.submitAddTask(e);
  assert.ok(texts.filter(t => t.includes('&lt;b&gt;Example&lt;/b&gt;')).length >= 2);
});

test('overlap, nested, out-of-window and cross-midnight busy events are clipped and merged', () => {
  const { ctx } = harness();
  const d = s => new Date(`2026-10-30T${s}:00Z`);
  const slots = ctx.findFreeSlots_([
    { start: d('11:30'), end: d('12:00') },
    { start: d('09:00'), end: d('11:00') },
    { start: d('10:30'), end: d('10:45') },
    { start: d('12:20'), end: d('13:00') },
    { start: d('14:00'), end: new Date('2026-10-31T01:00:00Z') },
  ], d('10:00'), d('23:00'));
  assert.deepEqual(plain(slots), [
    { start: d('11:00').toISOString(), end: d('11:30').toISOString() },
    { start: d('13:00').toISOString(), end: d('14:00').toISOString() },
  ]);
});

test('25-minute minimum and the 40/70-minute activity boundaries are preserved', () => {
  for (const [minutes, expected] of [[24, null], [25, 'Stand up'], [39, 'Stand up'], [40, 'Go for'], [69, 'Go for'], [70, 'Perfect time']]) {
    const start = new Date(Date.parse('2026-10-30T23:00:00Z') - minutes * 60000);
    const { ctx } = harness({ now: start.toISOString(), zone: 'UTC' });
    const slots = ctx.detectFreeTimeToday();
    assert.equal(slots.length, expected ? 1 : 0);
    if (expected) assert.ok(slots[0].suggestion.startsWith(expected));
  }
});

test('at or after 23:00 in the calendar zone no Calendar query is made', () => {
  for (const now of ['2026-10-31T04:00:00Z', '2026-10-31T04:30:00Z']) {
    const { ctx, reads } = harness({ now });
    assert.equal(ctx.detectFreeTimeToday().length, 0);
    assert.equal(reads.length, 0);
  }
});

test('23:00 boundary honors DST changes and fractional-offset zones', () => {
  for (const [now, zone, end] of [
    ['2026-03-08T06:30:00Z', 'America/Chicago', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01T05:30:00Z', 'America/Chicago', '2026-11-02T05:00:00.000Z'],
    ['2026-10-30T00:00:00Z', 'Asia/Kathmandu', '2026-10-30T17:15:00.000Z'],
    ['2026-10-31T02:00:00Z', 'America/Chicago', '2026-10-31T04:00:00.000Z'],
  ]) {
    const { ctx, reads } = harness({ now, zone });
    const slots = ctx.detectFreeTimeToday();
    assert.equal(reads[0][1], end);
    assert.equal(slots[0].end.toISOString(), end);
    assert.ok(slots[0].endStr.startsWith('23:00'));
  }
});

test('all-day occupied intervals yield no free slots', () => {
  const { ctx } = harness({ events: [event('2026-10-30T05:00:00Z', '2026-10-31T05:00:00Z')] });
  assert.equal(ctx.detectFreeTimeToday().length, 0);
});

test('one break entry point builds an informational card without writes', () => {
  const { ctx, writes, texts } = harness();
  ctx.showSmartBreaksCard({});
  assert.equal(writes.length, 0);
  assert.ok(texts.some(t => t.includes('America/Chicago')));
  const names = sources.flatMap(s => [...s.text.matchAll(/^function\s+(\w+)\(/gm)].map(m => m[1]));
  assert.equal(names.filter(name => name === 'showSmartBreaksCard').length, 1);
  assert.equal(new Set(names).size, names.length);
  assert.equal(typeof ctx.addBreakToCalendar_, 'undefined');
});
