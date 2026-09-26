// Keep the hidden experience consistent before the optional canvas modules load.
// This controls ordinary browser gestures, not access to public source files.
(() => {
  'use strict';
  const root = document.documentElement;
  const surface = root.dataset.horrorSurface;
  if (surface !== 'site' && surface !== 'museum') return;
  const CONTROL = 'a,button,summary,select,[role="button"],input[type="submit"],input[type="button"],input[type="reset"]';
  const EDITABLE = 'input,textarea,[contenteditable]:not([contenteditable="false"])';
  const MEDIA = 'img,canvas';
  const feedbackTimers = new Map();
  let observer = null;
  let prepared = false;
  let coveringStarted = false;
  const active = () => Boolean(window.eytleHorror?.isActive());
  const element = node => node?.nodeType === 1 ? node : node?.parentElement;
  const closest = (node, selector) => element(node)?.closest(selector);
  const editable = node => Boolean(closest(node, EDITABLE));

  function cancel(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function feedback(node) {
    const control = closest(node, CONTROL);
    if (!control || feedbackTimers.has(control)) return;
    control.classList.add('site-horror-denied');
    feedbackTimers.set(control, window.setTimeout(() => {
      control.classList.remove('site-horror-denied');
      feedbackTimers.delete(control);
    }, 240));
  }
  function permitted(node) {
    // Existing overlays can always be dismissed, as can browser UI itself.
    return Boolean(closest(node, '#ov-close'));
  }
  function blockControl(event) {
    if (!active() || surface !== 'site' || permitted(event.target)) return;
    if (!closest(event.target, CONTROL)) return;
    cancel(event);
    feedback(event.target);
  }

  // Capture on window before target handlers, including keyboard-generated clicks
  // and the middle mouse button. Keep scrolling, Tab, Escape and browser shortcuts.
  window.addEventListener('click', blockControl, true);
  window.addEventListener('auxclick', blockControl, true);
  window.addEventListener('submit', event => {
    if (!active() || surface !== 'site') return;
    cancel(event);
    feedback(event.submitter || element(event.target)?.querySelector('button,input[type="submit"]'));
  }, true);
  window.addEventListener('keydown', event => {
    if (!active()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !editable(event.target)) {
      cancel(event);
      return;
    }
    if (surface !== 'site' || permitted(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && closest(event.target, 'input') && closest(event.target, 'form')) {
      cancel(event);
      feedback(closest(event.target, CONTROL) || closest(event.target, 'form').querySelector('button,input[type="submit"]'));
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && closest(event.target, CONTROL)) {
      cancel(event);
      feedback(event.target);
    }
  }, true);
  window.addEventListener('selectstart', event => {
    if (active() && !editable(event.target)) cancel(event);
  }, true);
  for (const type of ['copy', 'cut']) window.addEventListener(type, event => {
    if (!active() || editable(event.target)) return;
    // Also blocks a selection made before activation, or selected through menus.
    event.clipboardData?.setData('text/plain', '');
    cancel(event);
  }, true);
  window.addEventListener('dragstart', event => {
    if (!active() || editable(event.target)) return;
    if (closest(event.target, `${MEDIA},a,.museum-horror-copy`)) {
      event.dataTransfer?.clearData();
      cancel(event);
    }
  }, true);
  window.addEventListener('contextmenu', event => {
    if (!active() || editable(event.target)) return;
    if (closest(event.target, `${MEDIA},a,.museum-horror-copy`)) cancel(event);
  }, true);

  function scrub(node) {
    if (!node || node.nodeType !== 1) return;
    const candidates = [node, ...node.querySelectorAll('[title],img,a[href],[placeholder]')];
    for (const candidate of candidates) {
      // Retain accessible names and real user input; browser tooltips must not
      // turn the visual corruption back into the original label.
      candidate.removeAttribute('title');
      if (surface === 'site') candidate.removeAttribute('placeholder');
      if (candidate.matches('img')) candidate.setAttribute('draggable', 'false');
      if (surface === 'site' && candidate.matches('a[href]')) {
        candidate.removeAttribute('href');
        if (!candidate.hasAttribute('role')) candidate.setAttribute('role', 'link');
        if (!candidate.hasAttribute('tabindex')) candidate.setAttribute('tabindex', '0');
        candidate.setAttribute('aria-disabled', 'true');
      }
    }
  }
  function prepare() {
    if (!active()) return;
    if (surface === 'site' && !coveringStarted) {
      coveringStarted = true;
      root.classList.add('site-horror-covering');
    }
    if (!document.body) return;
    if (surface === 'site') document.body.classList.add('site-horror-locked');
    if (prepared) return;
    prepared = true;
    // Clear a pre-existing page selection without touching a focused input draft.
    if (!editable(document.activeElement)) window.getSelection()?.removeAllRanges();
    scrub(document.body);
    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(records => {
        // Scrub only application additions/attribute changes, never scan every
        // animation frame. Disconnect for our own writes to avoid feedback.
        observer.disconnect();
        for (const record of records) {
          if (record.type === 'attributes') scrub(record.target);
          else for (const node of record.addedNodes) scrub(node);
        }
        observe();
      });
      observe();
    }
  }
  function observe() {
    observer?.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: surface === 'site' ? ['title', 'href', 'draggable', 'placeholder'] : ['title', 'href', 'draggable'],
    });
  }
  window.addEventListener('eytle:horror', prepare);
  window.addEventListener('pageshow', prepare);
  window.addEventListener('pagehide', () => {
    for (const [control, timer] of feedbackTimers) {
      window.clearTimeout(timer);
      control.classList.remove('site-horror-denied');
    }
    feedbackTimers.clear();
  });
  document.addEventListener('DOMContentLoaded', prepare, { once: true });
  prepare();
})();
