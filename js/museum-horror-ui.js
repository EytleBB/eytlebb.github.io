/* A visual corruption layer: the exhibition's original text and input values remain intact. */
import { PIXEL_ROWS, randomPixelGlyph, drawPixelGlyph, scrambleMuseumText } from './museum-horror-glyphs.js?v=pixel-20260926';
export { scrambleMuseumText };
const IGNORED = 'script,style,noscript,template,canvas,svg,math,input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),.guestbook-sr,.guestbook-honeypot,.museum-horror-copy';
const UPDATE_INTERVAL = 1 / 8;

export function createMuseumHorrorUI({ root = document.body, reducedMotion = false, artCanvas = null } = {}) {
  const document = root.ownerDocument;
  const body = document.body;
  const textRecords = new Map();
  const nativeRecords = new Map();
  const artRecords = new Map();
  let observer = null;
  let resizeObserver = null;
  const invalidateLayout = () => { for (const record of textRecords.values()) record.layoutDirty = true; };
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
    const { wrapper, original, visual } = record;
    resizeObserver?.unobserve(wrapper);
    visual.width = visual.height = 0;
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
      const visual = document.createElement('canvas');
      visual.className = 'museum-horror-visual';
      visual.setAttribute('aria-hidden', 'true');
      const context = visual.getContext('2d');
      node.replaceWith(wrapper);
      original.append(node);
      wrapper.append(original, visual);
      textRecords.set(node, { node, wrapper, original, visual, context, cells: [], text: '', layoutDirty: true });
      resizeObserver?.observe(wrapper);
    }
    // Native controls cannot contain spans. Their display labels can change without touching values.
    for (const option of root.querySelectorAll('option')) nativeRecord(option, 'label', 'aria-label');
    for (const input of root.querySelectorAll('input[placeholder],textarea[placeholder]')) {
      if (!input.closest('.guestbook-honeypot')) nativeRecord(input, 'placeholder', 'aria-placeholder');
    }
    synchronizeArt();
    dirty = false;
  }

  function drawText(record) {
    const { node, wrapper, visual, context } = record;
    // Hidden menus have no geometry and consume no pixel work. Only an
    // actual text/layout change needs character measurements; animated
    // frames reuse the same cells and cannot shuffle the surrounding UI.
    if (!context) return;
    if (record.layoutDirty || node.data !== record.text || !resizeObserver) {
      record.layoutDirty = false;
      record.text = node.data;
      const bounds = wrapper.getBoundingClientRect();
      record.cells.length = 0;
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(document.defaultView?.devicePixelRatio || 1, 2);
      const style = document.defaultView.getComputedStyle(record.original);
      visual.width = Math.ceil(bounds.width * ratio);
      visual.height = Math.ceil(bounds.height * ratio);
      const range = document.createRange();
      let offset = 0;
      for (const character of node.data) {
        range.setStart(node, offset);
        offset += character.length;
        range.setEnd(node, offset);
        if (/\s/u.test(character)) continue;
        const cell = range.getBoundingClientRect();
        record.cells.push({
          x: Math.round((cell.left - bounds.left) * ratio),
          y: Math.round((cell.top - bounds.top) * ratio),
          width: Math.max(1, Math.floor(cell.width * ratio)),
          height: Math.max(1, Math.floor(cell.height * ratio)),
          scale: Math.max(1, Math.floor(parseFloat(style.fontSize) * ratio / 7)),
        });
      }
      range.detach();
    }
    if (!record.cells.length) return;
    context.clearRect(0, 0, visual.width, visual.height);
    context.fillStyle = '#b46760';
    context.imageSmoothingEnabled = false;
    for (const cell of record.cells) {
      const index = randomPixelGlyph();
      const scale = Math.max(1, Math.min(cell.scale, Math.floor(cell.width / 6)));
      const verticalScale = Math.max(1, Math.min(cell.scale, Math.floor(cell.height / 7)));
      const width = Math.min(5 * scale, cell.width);
      const x = cell.x + Math.floor((cell.width - width) / 2);
      const y = cell.y + Math.floor((cell.height - 7 * verticalScale) / 2);
      if (cell.width >= 5 * scale) drawPixelGlyph(context, index, x, y, scale, verticalScale);
      else {
        // Narrow original characters retain their own advance as well.
        const rows = PIXEL_ROWS[index];
        for (let row = 0; row < 7; row++) {
          for (let column = 0; column < width; column++) {
            if (rows[row] & (1 << Math.round(4 - column * 4 / Math.max(1, width - 1)))) context.fillRect(x + column, y + row * verticalScale, 1, verticalScale);
          }
        }
      }
    }
    // A tiny frame marker is useful to verify the cadence without exposing
    // gibberish to accessibility APIs or creating thousands of DOM spans.
    record.frame = (record.frame || 0) + 1;
    visual.setAttribute('data-glyphs', String(record.frame));
  }

  function draw() {
    if (observer?.takeRecords().length) dirty = true;
    // Disconnect only for these synchronous presentation writes, avoiding observer feedback.
    observer?.disconnect();
    if (dirty) synchronize();
    for (const record of textRecords.values()) {
      drawText(record);
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
      const ResizeObserver = document.defaultView?.ResizeObserver;
      if (ResizeObserver) resizeObserver = new ResizeObserver(entries => {
        const changed = new Set(entries.map(entry => entry.target));
        for (const record of textRecords.values()) if (changed.has(record.wrapper)) record.layoutDirty = true;
      });
      document.defaultView?.addEventListener('resize', invalidateLayout);
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
      resizeObserver?.disconnect();
      resizeObserver = null;
      document.defaultView?.removeEventListener('resize', invalidateLayout);
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
