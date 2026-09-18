const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const icons = fs.readFileSync(path.join(root, 'js', 'site-icons.js'), 'utf8');

test('message button includes an accessible decorative paper plane', () => {
  assert.match(js, /class="msg-send-label"/);
  assert.match(js, /siteIcon\('plane', 'msg-plane'\)/);
  assert.match(icons, /aria-hidden="true" focusable="false"/);
  assert.match(icons, /plane: 'm22 2-7 20-4-8-8-4Z M22 2 11 14'/);
});

function messageForm(fetch) {
  function element() {
    const listeners = {};
    const attributes = new Map();
    const classes = new Set();
    return {
      value: '', textContent: '', dataset: {}, disabled: false,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
      addEventListener(name, callback) { listeners[name] = callback; },
      emit(name) { return listeners[name]?.(); },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
      removeAttribute(name) { attributes.delete(name); },
      focus() {},
    };
  }
  const nodes = Object.fromEntries(['msg-text', 'msg-count', 'msg-send', 'msg-hint', 'msg-hp'].map(id => [id, element()]));
  const label = element();
  const icon = element();
  nodes['msg-send'].querySelector = selector => selector === '.msg-plane' ? icon : label;
  const context = vm.createContext({
    document: { getElementById: id => nodes[id] },
    window: { setTimeout() {} },
    MSG_CONFIG: { web3formsKey: 'test-only' },
    t: zh => zh,
    EytleIcons: { set(svg, name) { svg.dataset.icon = name; } },
    fetch,
  });
  vm.runInContext(js.match(/function wireMessageForm\(\) \{[\s\S]*?\n\}/)[0], context);
  context.wireMessageForm();
  return { nodes, label, icon, send: () => nodes['msg-send'].emit('click') };
}

test('message result icons follow the response, preserve drafts and reset on input', async () => {
  let resolve;
  const form = messageForm(() => new Promise(done => { resolve = done; }));
  form.nodes['msg-text'].value = 'A note';
  const pending = form.send();
  assert.equal(form.icon.dataset.icon, 'plane');
  assert.equal(form.nodes['msg-send'].disabled, true);
  resolve({ ok: true, json: async () => ({ success: true }) });
  await pending;
  assert.equal(form.icon.dataset.icon, 'check');
  assert.equal(form.label.textContent, '已发送');
  assert.equal(form.nodes['msg-text'].value, '');
  assert.equal(form.nodes['msg-send'].disabled, false);

  form.nodes['msg-text'].value = 'Another note';
  form.nodes['msg-text'].emit('input');
  assert.equal(form.icon.dataset.icon, 'plane');
  assert.equal(form.label.textContent, '发送');
  const next = form.send();
  form.nodes['msg-text'].value = 'An unsent draft';
  form.nodes['msg-text'].emit('input');
  resolve({ ok: true, json: async () => ({ success: true }) });
  await next;
  assert.equal(form.nodes['msg-text'].value, 'An unsent draft');
  assert.equal(form.icon.dataset.icon, 'plane');
});

test('failed messages show retry, keep the text and can then succeed', async () => {
  let attempts = 0;
  const form = messageForm(async () => {
    if (++attempts === 1) throw new Error('Offline');
    return { ok: true, json: async () => ({ success: true }) };
  });
  form.nodes['msg-text'].value = 'Keep this note';
  await form.send();
  assert.equal(form.icon.dataset.icon, 'retry');
  assert.equal(form.label.textContent, '重试');
  assert.equal(form.nodes['msg-text'].value, 'Keep this note');
  assert.equal(form.nodes['msg-send'].disabled, false);
  await form.send();
  assert.equal(form.icon.dataset.icon, 'check');
});

test('empty messages and the honeypot never submit or report success', async () => {
  let requests = 0;
  const form = messageForm(() => { requests++; });
  await form.send();
  assert.equal(form.nodes['msg-text'].getAttribute('aria-invalid'), 'true');
  form.nodes['msg-text'].value = 'A note';
  form.nodes['msg-hp'].value = 'Bot';
  await form.send();
  assert.equal(requests, 0);
  assert.notEqual(form.icon.dataset.icon, 'check');
});

test('paper plane lifts on hover and launches only after validation', () => {
  assert.match(css, /\.msg-send:hover \.msg-plane/);
  assert.match(css, /@keyframes message-plane-takeoff/);
  assert.match(js, /if \(!text\)[\s\S]*?return; \}\s*if \(hp\.value\) return;[\s\S]*?launchPlane\(\);/);
  assert.match(js, /btn\.classList\.add\('is-launching'\)/);
});
