// Runs synchronously in each page head so the returning museum visit cannot
// briefly reveal the ordinary site. The latch belongs only to this browser tab.
(() => {
  'use strict';
  const KEY = 'eytle-horror';
  let active = false;

  function readState() {
    try {
      // Keep an in-memory activation if storage is unavailable or rejected a
      // write. A stored activation can also wake a page restored from BFCache.
      const saved = window.sessionStorage.getItem(KEY);
      active = active || saved === '1';
    } catch { /* Private storage restrictions must not break the page. */ }
  }
  function syncClass() {
    document.documentElement.classList.toggle('site-horror', active);
  }
  function notify() {
    window.dispatchEvent(new CustomEvent('eytle:horror'));
  }

  readState();
  syncClass();
  window.eytleHorror = Object.freeze({
    isActive() { return active; },
    activate() {
      const changed = !active;
      active = true;
      if (changed) {
        try { window.sessionStorage.setItem(KEY, '1'); } catch { /* Keep the memory latch. */ }
      }
      syncClass();
      if (changed) notify();
      return active;
    },
  });
  window.addEventListener('pageshow', () => {
    readState();
    syncClass();
    if (active) notify();
  });
})();
