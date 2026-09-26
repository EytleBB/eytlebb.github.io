const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/museum-fullscreen.js');

async function harness({ prefixed = false, unsupported = false } = {}) {
  const { createMuseumFullscreen } = await modulePromise;
  const listeners = new Map(), updates = [];
  const state = { requests: 0, exits: 0 };
  const document = {
    documentElement: {}, fullscreenElement: null, webkitFullscreenElement: null,
    addEventListener(name, fn) { listeners.set(name, fn); },
    emit(name) { listeners.get(name)?.(); },
  };
  const property = prefixed ? 'webkitFullscreenElement' : 'fullscreenElement';
  const event = prefixed ? 'webkitfullscreenchange' : 'fullscreenchange';
  const setActive = value => { document[property] = value ? document.documentElement : null; document.emit(event); };
  if (!unsupported) {
    document.documentElement[prefixed ? 'webkitRequestFullscreen' : 'requestFullscreen'] = function () {
      assert.equal(this, document.documentElement);
      state.requests++;
      return state.request ? state.request() : setActive(true);
    };
    document[prefixed ? 'webkitExitFullscreen' : 'exitFullscreen'] = function () {
      assert.equal(this, document);
      state.exits++; setActive(false);
    };
  }
  const api = createMuseumFullscreen({ document, T: (zh, en) => en, onChange: value => updates.push(value) });
  return { api, state, document, setActive, updates };
}

test('entry requests fullscreen synchronously within the click and labels follow browser state', async () => {
  const h = await harness();
  const pending = h.api.enter();
  assert.equal(h.state.requests, 1, 'the native call must happen before yielding user activation');
  await pending;
  assert.equal(h.api.state().active, true);
  assert.equal(h.api.state().label, 'Exit fullscreen');
  assert.equal(h.api.state().pending, false);
  await h.api.enter();
  assert.equal(h.state.requests, 1);
  await h.api.toggle();
  assert.equal(h.state.exits, 1);
  assert.equal(h.api.state().label, 'Fullscreen');
});

test('denied automatic fullscreen leaves an actionable retry and does not reject entry', async () => {
  const h = await harness();
  h.state.request = () => Promise.reject(new Error('user activation required'));
  await assert.doesNotReject(h.api.enter());
  assert.equal(h.api.state().active, false);
  assert.equal(h.api.state().pending, false);
  assert.match(h.api.state().message, /retry/);
  h.state.request = null;
  await h.api.toggle();
  assert.equal(h.state.requests, 2);
  assert.equal(h.api.state().active, true);
  assert.equal(h.api.state().message, '');
});

test('a pending request prevents overlapping entry and toggle calls', async () => {
  const h = await harness();
  let resolve;
  h.state.request = () => new Promise(done => { resolve = done; });
  const first = h.api.enter();
  await h.api.enter(); await h.api.toggle();
  assert.equal(h.state.requests, 1);
  assert.equal(h.api.state().pending, true);
  h.setActive(true); resolve(); await first;
  assert.equal(h.api.state().pending, false);
});

test('browser Escape or native exit restores the button without forcing re-entry', async () => {
  const h = await harness();
  await h.api.enter();
  h.setActive(false);
  assert.equal(h.updates.at(-1).active, false);
  assert.equal(h.updates.at(-1).label, 'Fullscreen');
  assert.equal(h.state.requests, 1);
});

test('prefixed Safari entry and exit work even when the methods return void', async () => {
  const h = await harness({ prefixed: true });
  await h.api.enter();
  assert.equal(h.api.state().active, true);
  await h.api.toggle();
  assert.equal(h.api.state().active, false);
  assert.equal(h.state.exits, 1);
});

test('unsupported browsers explain fullscreen unavailability without blocking the visit', async () => {
  const h = await harness({ unsupported: true });
  await assert.doesNotReject(h.api.enter());
  assert.match(h.api.state().message, /does not support/);
  assert.equal(h.api.state().pending, false);
  await assert.doesNotReject(h.api.toggle());
  assert.equal(h.state.requests, 0);
});

test('asynchronous prefixed fullscreen errors provide feedback and allow retry', async () => {
  const h = await harness({ prefixed: true });
  h.state.request = () => undefined;
  await h.api.enter();
  h.document.emit('webkitfullscreenerror');
  assert.match(h.api.state().message, /retry/);
  h.state.request = null;
  await h.api.toggle();
  assert.equal(h.api.state().active, true);
  assert.equal(h.api.state().message, '');
});

test('an explicit browser fullscreen prohibition is reported without calling the native method', async () => {
  const h = await harness();
  h.document.fullscreenEnabled = false;
  await h.api.enter();
  assert.equal(h.state.requests, 0);
  assert.match(h.api.state().message, /does not support/);
});
