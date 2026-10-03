const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/site-horror-aftereffects-scheduler.js'), 'utf8');
const { chooseAftereffect, createAftereffectsScheduler } = vm.runInNewContext(
  `${source.replace(/^export /gm, '')}\n({ chooseAftereffect, createAftereffectsScheduler });`,
  { setTimeout, clearTimeout });
const settle = () => new Promise(resolve => setImmediate(resolve));

function sequence(...values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'random choice consumed more values than expected');
    return values[index++];
  };
}

function clock(start = 0) {
  let timestamp = start, id = 0;
  const timers = new Map();
  return {
    now: () => timestamp,
    setTimer(callback, delay) { const key = ++id; timers.set(key, { callback, at: timestamp + delay }); return key; },
    clearTimer(key) { timers.delete(key); },
    timers,
    next() { return [...timers].sort((a, b) => a[1].at - b[1].at)[0]; },
    move(ms) { timestamp += ms; },
    async fire(key = this.next()?.[0]) {
      const timer = timers.get(key);
      assert.ok(timer, 'the requested timer exists');
      timers.delete(key);
      timer.callback();
      await settle();
    },
    async advance(ms) {
      const target = timestamp + ms;
      let next;
      while ((next = this.next()) && next[1].at <= target) {
        timestamp = next[1].at;
        await this.fire(next[0]);
      }
      timestamp = target;
    },
  };
}

function harness(options = {}) {
  const time = clock();
  const events = [], claims = [];
  let allowed = true, audio = true;
  const scheduler = createAftereffectsScheduler({
    random: () => .5, now: time.now, setTimer: time.setTimer, clearTimer: time.clearTimer,
    canRun: () => allowed, getAudioReady: () => audio,
    onEvent(event, timestamp) { events.push({ event, timestamp }); },
    claimEvent(event, timestamp) { claims.push({ event, timestamp }); return true; },
    ...options,
  });
  return { time, events, claims, scheduler,
    allow(value) { allowed = value; }, audio(value) { audio = value; } };
}

test('the probability buckets include empty outcomes and all five event kinds at their specified weights', () => {
  const counts = { empty: 0, glimpse: 0, reflection: 0, whisper: 0, step: 0, rush: 0 };
  for (let index = 0; index < 100; index++) {
    const event = chooseAftereffect(sequence((index + .5) / 100, .5, .5), { audioReady: true });
    counts[event?.kind || 'empty']++;
  }
  assert.deepEqual(counts, { empty: 30, glimpse: 30, reflection: 12, whisper: 12, step: 10, rush: 6 });
});

test('visuals keep their identity and side while unready audio-only choices become empty and rush becomes glimpse', () => {
  for (const roll of [.75, .88]) assert.equal(chooseAftereffect(sequence(roll)), null);
  const fallback = chooseAftereffect(sequence(.97, .999, 0));
  assert.equal(fallback.kind, 'glimpse');
  assert.equal(fallback.identity, 2);
  assert.equal(fallback.side, -1);
  assert.equal(fallback.duration, 1.05);
  const counts = { empty: 0, glimpse: 0, reflection: 0 };
  for (let index = 0; index < 100; index++) {
    const event = chooseAftereffect(sequence((index + .5) / 100, .5, .5));
    counts[event?.kind || 'empty']++;
  }
  assert.deepEqual(counts, { empty: 52, glimpse: 36, reflection: 12 });
});

test('descriptors use renderer seconds, portrait identities zero through two, and signed sides', () => {
  const samples = [ [.45, 'glimpse', 1.05], [.65, 'reflection', 1.45], [.78, 'whisper', 1.2],
    [.89, 'step', .65], [.97, 'rush', 1.3] ];
  for (const [roll, kind, duration] of samples) {
    const event = chooseAftereffect(sequence(roll, .4, .75), { audioReady: true });
    assert.equal(event.kind, kind);
    assert.equal(event.duration, duration);
    assert.equal(event.identity, 1);
    assert.equal(event.side, 1);
    assert.deepEqual(Object.keys(event).sort(), ['duration', 'identity', 'kind', 'side']);
  }
  assert.equal(chooseAftereffect(sequence(.45, 0, .49), { audioReady: true }).identity, 0);
  assert.equal(chooseAftereffect(sequence(.45, .99, .49), { audioReady: true }).identity, 2);
});

test('the scheduler starts idle and the first random deadline stays within its configured quiet range', async () => {
  for (const roll of [0, .25, .5, .999]) {
    const h = harness({ random: () => roll });
    assert.equal(h.scheduler.running, false);
    assert.equal(h.time.timers.size, 0);
    h.scheduler.resume();
    const delay = h.time.next()[1].at;
    assert.ok(delay >= 30000 && delay < 90000);
    await h.time.advance(delay - 1);
    assert.equal(h.events.length, 0);
    assert.equal(h.claims.length, 0);
    assert.equal(h.time.timers.size, 1);
    h.scheduler.dispose();
    assert.equal(h.time.timers.size, 0);
  }
});

test('repeated resume keeps one timer and events are claimed once at a deadline, never during idle time', async () => {
  const h = harness();
  h.scheduler.resume();
  const first = h.time.next();
  h.scheduler.resume(); h.scheduler.resume();
  assert.equal(h.time.timers.size, 1);
  assert.equal(h.time.next()[0], first[0]);
  await h.time.advance(60000);
  assert.equal(h.events.length, 1);
  assert.equal(h.claims.length, 1);
  assert.equal(h.events[0].timestamp, 60000);
  assert.equal(h.events[0].event.kind, 'glimpse');
  assert.equal(h.time.timers.size, 1);
  assert.equal(h.time.next()[1].at, 210000);
});

test('empty attempts and refused claims sample another quiet interval without updating event cooldown', async () => {
  const empty = harness({ random: () => 0, firstDelay: [10, 10], nextDelay: [20, 20], cooldown: 100 });
  empty.scheduler.resume();
  await empty.time.advance(10);
  assert.equal(empty.events.length, 0);
  assert.equal(empty.claims.length, 0);
  assert.equal(empty.time.next()[1].at, 30);
  const refused = harness({ firstDelay: [10, 10], nextDelay: [20, 20], cooldown: 100,
    claimEvent: () => false });
  refused.scheduler.resume();
  await refused.time.advance(10);
  assert.equal(refused.events.length, 0);
  assert.equal(refused.time.next()[1].at, 30);
});

test('local cooldown floors short random waits after delivered events, including pause and resume', async () => {
  const h = harness({ firstDelay: [10, 10], nextDelay: [20, 20], cooldown: 100 });
  h.scheduler.resume();
  await h.time.advance(10);
  assert.equal(h.events.length, 1);
  assert.equal(h.time.next()[1].at, 110);
  await h.time.advance(20);
  h.scheduler.pause(); h.scheduler.resume();
  assert.equal(h.time.next()[1].at, 110);
  await h.time.advance(79);
  assert.equal(h.events.length, 1);
  await h.time.advance(1);
  assert.equal(h.events.length, 2);
});

test('a throttled deadline in a hidden or ineligible page stops without an event or catch-up timer', async () => {
  const h = harness();
  h.scheduler.resume();
  h.allow(false);
  h.time.move(600000);
  await h.time.fire();
  assert.equal(h.events.length, 0);
  assert.equal(h.claims.length, 0);
  assert.equal(h.scheduler.running, false);
  assert.equal(h.time.timers.size, 0);
  h.scheduler.resume();
  assert.equal(h.time.timers.size, 0);
  h.allow(true); h.scheduler.resume();
  assert.equal(h.time.next()[1].at, 660000);
});

test('pause and resume discard elapsed waiting and start a fresh first quiet interval', async () => {
  const h = harness();
  h.scheduler.resume();
  await h.time.advance(59000);
  h.scheduler.pause();
  assert.equal(h.scheduler.running, false);
  assert.equal(h.time.timers.size, 0);
  h.time.move(300000);
  h.scheduler.resume();
  assert.equal(h.time.next()[1].at, 419000);
  await h.time.advance(59999);
  assert.equal(h.events.length, 0);
  await h.time.advance(1);
  assert.equal(h.events.length, 1);
});

test('already-queued callbacks cannot erase a replacement timer or play an old incident', async () => {
  const h = harness();
  h.scheduler.resume();
  const oldCallback = h.time.next()[1].callback;
  h.scheduler.pause(); h.scheduler.resume();
  const replacement = h.time.next();
  oldCallback(); await settle();
  assert.equal(h.events.length, 0);
  assert.equal(h.time.timers.size, 1);
  assert.equal(h.time.next()[0], replacement[0]);
  await h.time.advance(60000);
  assert.equal(h.events.length, 1);
  h.scheduler.pause();
  assert.equal(h.time.timers.size, 0);
});

test('a pending asynchronous claim keeps resume idempotent and is cancelled by pause even after resume', async () => {
  const pending = [];
  const h = harness({ claimEvent: () => new Promise(resolve => pending.push(resolve)) });
  h.scheduler.resume();
  await h.time.advance(60000);
  assert.equal(pending.length, 1);
  assert.equal(h.time.timers.size, 0);
  assert.equal(h.scheduler.running, true);
  h.scheduler.resume();
  assert.equal(h.time.timers.size, 0);
  h.scheduler.pause(); h.scheduler.resume();
  const next = h.time.next();
  pending[0](true); await settle();
  assert.equal(h.events.length, 0);
  assert.equal(h.time.timers.size, 1);
  assert.equal(h.time.next()[0], next[0]);
  await h.time.advance(60000);
  assert.equal(pending.length, 2);
  pending[1](true); await settle();
  assert.equal(h.events.length, 1);
  assert.equal(h.time.timers.size, 1);
});

test('eligibility is checked again after an asynchronous claim so a lost foreground never plays', async () => {
  let resolveClaim;
  const h = harness({ claimEvent: () => new Promise(resolve => { resolveClaim = resolve; }) });
  h.scheduler.resume();
  await h.time.advance(60000);
  h.allow(false);
  resolveClaim(true); await settle();
  assert.equal(h.events.length, 0);
  assert.equal(h.scheduler.running, false);
  assert.equal(h.time.timers.size, 0);
});

test('dispose is permanent and late claims, queued timers, and repeated lifecycle calls cannot leak', async () => {
  let resolveClaim;
  const h = harness({ claimEvent: () => new Promise(resolve => { resolveClaim = resolve; }) });
  h.scheduler.resume();
  const stale = h.time.next()[1].callback;
  await h.time.advance(60000);
  h.scheduler.dispose(); h.scheduler.dispose(); h.scheduler.pause(); h.scheduler.resume();
  resolveClaim(true); stale(); await settle();
  assert.equal(h.events.length, 0);
  assert.equal(h.scheduler.running, false);
  assert.equal(h.time.timers.size, 0);
});

test('failed optional claims or presentations consume one attempt and leave one later timer', async () => {
  for (const failure of ['claim', 'presentation']) {
    const h = harness({ firstDelay: [10, 10], nextDelay: [20, 20], cooldown: 0,
      ...(failure === 'claim' ? { claimEvent: () => Promise.reject(new Error('unavailable coordinator')) }
        : { onEvent: () => { throw new Error('unavailable canvas'); } }) });
    h.scheduler.resume();
    await h.time.advance(10);
    assert.equal(h.time.timers.size, 1);
    assert.equal(h.time.next()[1].at, 30);
    h.scheduler.dispose();
    assert.equal(h.time.timers.size, 0);
  }
});

test('audio eligibility is read at the attempt rather than at page entry', async () => {
  const h = harness({ random: () => .78, firstDelay: [10, 10], nextDelay: [20, 20], cooldown: 0 });
  h.audio(false); h.scheduler.resume();
  await h.time.advance(10);
  assert.equal(h.events.length, 0);
  h.audio(true);
  await h.time.advance(20);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].event.kind, 'whisper');
});
