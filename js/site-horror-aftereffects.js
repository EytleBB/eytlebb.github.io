import { createAftereffectsAudio } from './site-horror-aftereffects-audio.js?v=aftereffects-20261003';
import { createAftereffectsScheduler } from './site-horror-aftereffects-scheduler.js?v=aftereffects-20261003';

const COOLDOWN_KEY = 'eytle-horror-aftereffect-cooldown';
const COOLDOWN_MS = 90000;

// The tab latch remains untouched. This controller only decorates a normal,
// previously haunted homepage, and leaves no ongoing animation between events.
export function createSiteAftereffects({ window, document, makeAudio = createAftereffectsAudio,
  makeScheduler = createAftereffectsScheduler,
  loadVisual = () => import('./site-horror-aftereffects-visual.js?v=aftereffects-20261003') }) {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const subscriptions = [];
  let hero = null, heroVisible = false, away = false, disposed = false, failed = false;
  let visual = null, audio = null, scheduler = null, factory = null, loading = null;
  let raf = 0, endTimer = 0, eventStarted = 0, incident = null;
  let lifecycle = 0;
  let stageObserver = null, overlayObserver = null, sectionObserver = null;
  const listen = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    subscriptions.push(() => target.removeEventListener(type, callback, options));
  };
  const eligible = () => Boolean(window.eytleHorror?.hasHistory?.() && !window.eytleHorror.isActive());
  function canRun() {
    return !disposed && !away && eligible() && !document.hidden && !preference.matches
      && root.dataset.section === 'about' && heroVisible && !document.querySelector('#ov')
      && document.hasFocus();
  }
  function stopIncident() {
    window.cancelAnimationFrame(raf); window.clearTimeout(endTimer);
    raf = endTimer = 0; incident = null;
    visual?.stop(); audio?.stop();
  }
  function frame(now) {
    raf = 0;
    if (!incident || !canRun()) { stopIncident(); return; }
    if (visual.update(Math.max(0, (now - eventStarted) / 1000))) raf = window.requestAnimationFrame(frame);
  }
  function playIncident(event) {
    if (!canRun()) return;
    stopIncident();
    incident = event;
    if (['glimpse', 'reflection', 'rush'].includes(event.kind)) {
      visual.show(event.kind, event);
      eventStarted = window.performance.now();
      raf = window.requestAnimationFrame(frame);
    }
    if (event.kind === 'rush') audio.play('scream', event);
    else if (event.kind === 'step' || event.kind === 'whisper') audio.play(event.kind, event);
    endTimer = window.setTimeout(stopIncident, Math.max(.1, Math.min(3, event.duration)) * 1000);
    window.dispatchEvent(new window.CustomEvent('eytle:aftereffect', { detail: { ...event } }));
  }
  async function claimEvent(event, now) {
    const token = lifecycle;
    const claim = () => {
      if (token !== lifecycle || !canRun()) return false;
      try {
        let saved = null;
        try { saved = JSON.parse(window.localStorage.getItem(COOLDOWN_KEY) || 'null'); } catch { /* Ignore an invalid old record. */ }
        if (saved?.version === 1 && Number.isFinite(saved.at) && saved.at > 0
          && now >= saved.at && now - saved.at < COOLDOWN_MS) return false;
        window.localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ version: 1, at: now, kind: event.kind }));
        return true;
      } catch { return false; }
    };
    if (window.navigator.locks?.request) {
      try {
        return await window.navigator.locks.request('eytle-horror-aftereffects', { ifAvailable: true }, lock => lock ? claim() : false);
      } catch { return false; }
    }
    // Older browsers still restrict events to the one focused document.
    return claim();
  }
  function createOwners() {
    if (scheduler || !factory || !canRun()) return;
    visual = factory({ window, document });
    audio ||= makeAudio();
    scheduler = makeScheduler({
      canRun,
      getAudioReady: () => Boolean(audio.ready && audio.hasScream),
      onEvent: playIncident, claimEvent,
    });
  }
  function sync() {
    if (disposed) return;
    if (!canRun()) {
      lifecycle++;
      scheduler?.pause(); stopIncident();
      return;
    }
    audio ||= makeAudio(); // Constructor is inert until an actual gesture unlocks it.
    if (!factory && !loading && !failed) {
      loading = loadVisual().then(module => {
        if (!disposed) factory = module.createAftereffectsVisual;
      }).catch(() => { failed = true; }).finally(() => {
        loading = null;
        if (!disposed) sync();
      });
    }
    createOwners();
    scheduler?.resume();
  }
  const intersection = typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.target === hero) heroVisible = entry.isIntersecting;
      sync();
    }, { threshold: 0 }) : null;
  function trackHero() {
    const next = document.querySelector('.hero');
    if (next !== hero) {
      if (hero) intersection?.unobserve(hero);
      hero = next;
      if (hero) intersection?.observe(hero);
    }
    if (hero) {
      const bounds = hero.getBoundingClientRect();
      heroVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
    } else heroVisible = false;
    sync();
  }
  function gesture(event) {
    if (!event.isTrusted || !canRun() || !audio || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.type === 'keydown' && (event.repeat || ['Shift', 'Control', 'Alt', 'Meta', 'Escape'].includes(event.key))) return;
    // Calling resume inside the original gesture satisfies browser autoplay
    // rules; a late import or decode can never queue a surprise sound.
    void audio.unlock().catch(() => {});
  }
  if (typeof window.MutationObserver === 'function') {
    const stage = document.getElementById('stage');
    if (stage) { stageObserver = new window.MutationObserver(trackHero); stageObserver.observe(stage, { childList: true }); }
    const overlay = document.getElementById('overlay-root');
    if (overlay) { overlayObserver = new window.MutationObserver(sync); overlayObserver.observe(overlay, { childList: true }); }
    sectionObserver = new window.MutationObserver(trackHero);
    sectionObserver.observe(root, { attributes: true, attributeFilter: ['data-section'] });
  }
  listen(window, 'eytle:aftereffects', trackHero);
  listen(window, 'eytle:horror', sync);
  listen(window, 'focus', trackHero);
  listen(window, 'blur', sync);
  listen(document, 'visibilitychange', trackHero);
  listen(window, 'pagehide', () => { away = true; lifecycle++; scheduler?.pause(); stopIncident(); });
  listen(window, 'pageshow', () => { away = false; failed = false; trackHero(); });
  listen(window, 'pointerdown', gesture, { passive: true });
  listen(window, 'keydown', gesture);
  listen(preference, 'change', sync);
  if (!intersection) listen(window, 'scroll', trackHero, { passive: true });
  trackHero();
  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true; stopIncident(); scheduler?.dispose(); visual?.dispose(); audio?.dispose();
      intersection?.disconnect(); stageObserver?.disconnect(); overlayObserver?.disconnect(); sectionObserver?.disconnect();
      for (const unsubscribe of subscriptions) unsubscribe();
    },
  };
}

if (typeof window !== 'undefined' && document.documentElement.dataset.horrorSurface === 'site'
  && document.getElementById('stage')) createSiteAftereffects({ window, document });
