/* A visual corruption layer: the exhibition's original text and input values remain intact. */
const NARROW_GLYPHS = '01#%+=?/\\|{}[]<>!?';
const WIDE_GLYPHS = '乂刈冂囗尸巛彡巜屮丿乚戈亠卄';
const IGNORED = 'script,style,noscript,template,canvas,svg,math,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),.guestbook-sr,.guestbook-honeypot,.museum-horror-copy';
const UPDATE_INTERVAL = 1 / 8;

export function scrambleMuseumText(text, random = Math.random) {
  return Array.from(text, character => {
    if (/\s/u.test(character)) return character;
    const alphabet = character.codePointAt(0) > 255 ? WIDE_GLYPHS : NARROW_GLYPHS;
    return alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  }).join('');
}

export function createMuseumHorrorUI({ root = document.body, reducedMotion = false, artCanvas = null } = {}) {
  const document = root.ownerDocument;
  const body = document.body;
  const textRecords = new Map();
  const nativeRecords = new Map();
  const artRecords = new Map();
  let observer = null;
  let enabled = false;
  let dirty = false;
  let elapsed = 0;
  let ownsClass = false;
  let previousTone = '';
  let previousTonePriority = '';

  function observe() {
    observer?.observe(root, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['placeholder', 'label'],
    });
  }

  function unwrap(record) {
    const { wrapper, original } = record;
    // Preserve any application update to the real text; only remove our presentation nodes.
    if (wrapper.parentNode && original.parentNode === wrapper) {
      wrapper.replaceWith(...original.childNodes);
    }
  }

  function restoreNative(record) {
    const { node, attribute, last, original, accessible, ownsAccessible } = record;
    if (node.getAttribute(attribute) === last) {
      if (original === null) node.removeAttribute(attribute);
      else node.setAttribute(attribute, original);
    }
    if (ownsAccessible && node.getAttribute(accessible) === record.text) {
      node.removeAttribute(accessible);
    }
  }

  function nativeRecord(node, attribute, accessible) {
    if (nativeRecords.has(node)) return;
    const original = node.getAttribute(attribute);
    const text = original ?? node.textContent;
    if (!text?.trim()) return;
    const ownsAccessible = !node.hasAttribute(accessible);
    if (ownsAccessible) node.setAttribute(accessible, text);
    nativeRecords.set(node, { node, attribute, accessible, original, text, last: original, ownsAccessible });
  }

  function restoreArt(record) {
    record.canvas.remove();
    record.canvas.width = record.canvas.height = 0;
    if (record.ownsHidden) record.node.classList.remove('museum-horror-art-covered');
  }

  function synchronizeArt() {
    for (const [node, record] of artRecords) {
      if (!root.contains(node) || record.canvas.parentNode !== node.parentNode) {
        restoreArt(record);
        artRecords.delete(node);
      }
    }
    if (!artCanvas) return;
    for (const node of root.querySelectorAll('img.guestbook-art')) {
      if (artRecords.has(node)) continue;
      const canvas = document.createElement('canvas');
      canvas.className = 'museum-horror-art';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = 256;
      canvas.height = Math.max(1, Math.round(256 * (artCanvas.height || 1) / (artCanvas.width || 1)));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) continue;
      const ownsHidden = !node.classList.contains('museum-horror-art-covered');
      node.classList.add('museum-horror-art-covered');
      node.after(canvas);
      artRecords.set(node, { node, canvas, context, ownsHidden });
    }
  }

  function synchronize() {
    for (const [node, record] of textRecords) {
      if (!root.contains(node) || !root.contains(record.wrapper)) {
        unwrap(record);
        textRecords.delete(node);
      }
    }
    for (const [node, record] of nativeRecords) {
      if (!root.contains(node)) {
        restoreNative(record);
        nativeRecords.delete(node);
      }
    }
    const walker = document.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
    const pending = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!textRecords.has(node) && node.data.trim() && !node.parentElement?.closest(IGNORED)) pending.push(node);
    }
    for (const node of pending) {
      const wrapper = document.createElement('span');
      wrapper.className = 'museum-horror-copy';
      const original = document.createElement('span');
      original.className = 'museum-horror-original';
      const visual = document.createElement('span');
      visual.className = 'museum-horror-visual';
      visual.setAttribute('aria-hidden', 'true');
      node.replaceWith(wrapper);
      original.append(node);
      wrapper.append(original, visual);
      textRecords.set(node, { node, wrapper, original, visual });
    }
    // Native controls cannot contain spans. Their display labels can change without touching values.
    for (const option of root.querySelectorAll('option')) nativeRecord(option, 'label', 'aria-label');
    for (const input of root.querySelectorAll('input[placeholder],textarea[placeholder]')) {
      if (!input.closest('.guestbook-honeypot')) nativeRecord(input, 'placeholder', 'aria-placeholder');
    }
    synchronizeArt();
    dirty = false;
  }

  function draw() {
    if (observer?.takeRecords().length) dirty = true;
    // Disconnect only for these synchronous presentation writes, avoiding observer feedback.
    observer?.disconnect();
    if (dirty) synchronize();
    for (const record of textRecords.values()) {
      record.visual.setAttribute('data-glyphs', scrambleMuseumText(record.node.data));
    }
    for (const record of nativeRecords.values()) {
      const current = record.node.getAttribute(record.attribute);
      if (current !== record.last) record.original = current;
      const text = record.original ?? record.node.textContent;
      if (record.ownsAccessible && record.node.getAttribute(record.accessible) === record.text) {
        record.node.setAttribute(record.accessible, text);
      }
      record.text = text;
      record.last = scrambleMuseumText(text);
      record.node.setAttribute(record.attribute, record.last);
    }
    for (const record of artRecords.values()) {
      const dialog = record.node.closest('dialog');
      if (record.node.closest('[hidden]') || (dialog && !dialog.open)) continue;
      record.context.drawImage(artCanvas, 0, 0, record.canvas.width, record.canvas.height);
    }
    // Text changes carry the flicker; brightness variation stays subtle and never flashes the scene.
    body.style.setProperty('--horror-text', reducedMotion ? '#a96863' : `rgb(${151 + Math.floor(Math.random() * 17)}, 82, 78)`);
    observe();
  }

  return {
    enable() {
      if (enabled) return;
      enabled = true;
      ownsClass = !body.classList.contains('museum-horror');
      previousTone = body.style.getPropertyValue('--horror-text');
      previousTonePriority = body.style.getPropertyPriority('--horror-text');
      body.classList.add('museum-horror');
      const Observer = document.defaultView?.MutationObserver;
      if (Observer) observer = new Observer(() => { dirty = true; });
      dirty = true;
      elapsed = 0;
      draw();
    },
    update(dt) {
      if (!enabled || document.hidden || !Number.isFinite(dt) || dt <= 0) return;
      elapsed += Math.min(dt, 0.25);
      const interval = reducedMotion ? 0.5 : UPDATE_INTERVAL;
      if (elapsed < interval) return;
      elapsed %= interval;
      // Without MutationObserver, a periodic scan still keeps dynamically created labels covered.
      if (!observer) dirty = true;
      draw();
    },
    dispose() {
      if (!enabled) return;
      enabled = false;
      observer?.disconnect();
      observer = null;
      for (const record of textRecords.values()) unwrap(record);
      for (const record of nativeRecords.values()) restoreNative(record);
      for (const record of artRecords.values()) restoreArt(record);
      textRecords.clear();
      nativeRecords.clear();
      artRecords.clear();
      if (ownsClass) body.classList.remove('museum-horror');
      if (previousTone) body.style.setProperty('--horror-text', previousTone, previousTonePriority);
      else body.style.removeProperty('--horror-text');
      dirty = false;
      elapsed = 0;
    },
  };
}
