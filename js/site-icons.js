/* Quiet SVG state changes, progressively enhanced with Morphicons 1.7.1.
   Paths are site-owned, on a shared 24 × 24 grid; no icon-font dependency. */
(() => {
  const paths = Object.freeze({
    sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.93 4.93l1.42 1.42 M17.65 17.65l1.42 1.42 M4.93 19.07l1.42-1.42 M17.65 6.35l1.42-1.42',
    moon: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-down': 'M6 9l6 6 6-6',
    'arrow-right': 'M4 12h16 M14 6l6 6-6 6',
    'arrow-down': 'M12 4v16 M6 14l6 6 6-6',
    'arrow-up-right': 'M6 18 18 6 M6 6h12v12',
    external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    plane: 'm22 2-7 20-4-8-8-4Z M22 2 11 14',
    check: 'M5 12l4 4L19 6',
    retry: 'M20 7v5h-5 M20 12a8 8 0 1 0-2 5',
    close: 'M6 6l12 12 M6 18 18 6',
  });
  const instances = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Critically damped: a soft landing without a playful bounce.
  const spring = { stiffness: 300, damping: 35 };
  let createMorph;

  function markup(name, className = '', hover = '') {
    if (!paths[name]) return '';
    return `<svg class="site-icon ${className}" data-icon="${name}"${paths[hover] ? ` data-icon-rest="${name}" data-icon-hover="${hover}"` : ''} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"></path></svg>`;
  }

  function set(svg, name, animate = true) {
    const target = paths[name];
    const path = svg?.querySelector('path');
    if (!target || !path || !svg.isConnected) return;
    let state = instances.get(svg);
    if (!state) {
      state = { path, target: path.getAttribute('d'), driver: null };
      instances.set(svg, state);
    }
    if (!state.driver && createMorph) {
      state.driver = createMorph(path, state.target, { reducedMotion: 'user' });
    }
    state.target = target;
    svg.dataset.icon = name;
    if (!state.driver) path.setAttribute('d', target);
    else if (animate && !document.hidden && !reducedMotion.matches) state.driver.morphTo(target, spring);
    else state.driver.set(target);
  }

  function settle() {
    for (const state of instances.values()) state.driver?.set(state.target);
  }

  function prune() {
    for (const [svg, state] of instances) {
      if (svg.isConnected) continue;
      state.driver?.destroy();
      instances.delete(svg);
    }
  }

  // Hover and keyboard focus share the same short directional cue.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  function interaction(event) {
    const control = event.target.closest?.('button, a');
    if (!control || control.contains(event.relatedTarget)) return;
    const svg = control.querySelector('[data-icon-hover]');
    if (!svg) return;
    const focused = event.type === 'focusin' || (event.type !== 'focusout' && control.contains(document.activeElement));
    const hovered = finePointer.matches && (event.type === 'pointerover' || (event.type !== 'pointerout' && control.matches(':hover')));
    set(svg, focused || hovered ? svg.dataset.iconHover : svg.dataset.iconRest);
  }
  for (const event of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
    document.addEventListener(event, interaction);
  }
  new MutationObserver(records => {
    if (records.some(record => record.removedNodes.length)) prune();
  }).observe(document.body, { childList: true, subtree: true });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) settle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  window.addEventListener('pagehide', settle);

  window.EytleIcons = Object.freeze({ markup, set });
  import('./vendor/morphicons-1.7.1/dom.js').then(module => {
    createMorph = module.createMorph;
    // Upgrade at the current endpoint, never replay an earlier click on load.
    prune();
    for (const state of instances.values()) {
      state.driver = createMorph(state.path, state.target, { reducedMotion: 'user' });
    }
  }).catch(() => {
    // Static SVGs and all controls remain usable if the enhancement cannot load.
  });
})();
