// Runs synchronously in each page head so the returning museum visit cannot
// briefly reveal the ordinary site. The latch belongs only to this browser tab.
(() => {
  'use strict';
  const KEY = 'eytle-horror';
  const HISTORY_KEY = 'eytle-horror-history';
  let active = false;
  let history = false;

  function readHistory() {
    let saved;
    try {
      saved = window.localStorage.getItem(HISTORY_KEY);
    } catch { return; /* Keep memory if the browser denies storage. */ }
    try {
      const record = JSON.parse(saved || 'null');
      history = Boolean(record?.version === 1 && Number.isFinite(record.triggeredAt) && record.triggeredAt > 0);
    } catch { history = false; }
  }
  function remember() {
    if (history) return false;
    history = true;
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, triggeredAt: Date.now() }));
    } catch { /* Full horror remains local when persistent storage is unavailable. */ }
    return true;
  }
  function notifyHistory() { window.dispatchEvent(new CustomEvent('eytle:aftereffects')); }

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
  readHistory();
  // A tab activated by the previous version also leaves a browser-local trace.
  if (active) remember();
  syncClass();
  window.eytleHorror = Object.freeze({
    isActive() { return active; },
    hasHistory() { return history; },
    activate() {
      const changed = !active;
      active = true;
      if (changed) {
        try { window.sessionStorage.setItem(KEY, '1'); } catch { /* Keep the memory latch. */ }
      }
      const remembered = remember();
      syncClass();
      if (remembered) notifyHistory();
      if (changed) notify();
      return active;
    },
  });
  window.addEventListener('pageshow', () => {
    const before = history;
    readState();
    readHistory();
    if (active) remember();
    syncClass();
    if (history !== before) notifyHistory();
    if (active) notify();
  });
  window.addEventListener('storage', event => {
    if (event.key !== HISTORY_KEY && event.key !== null) return;
    const before = history;
    readHistory();
    if (history !== before) notifyHistory();
  });
})();
