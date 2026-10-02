// This full-theme renderer loads only for an active horror tab.
let starting = null;
let presentation = null;
let away = false;

async function activateSiteHorror() {
  if (!window.eytleHorror?.isActive() || presentation || starting) return;
  starting = Promise.all([
    import('./museum-horror-glyphs.js?v=pixel-20260926'),
    import('./museum-horror-ui.js?v=horror-immersion-20260926'),
    import('./site-horror-portraits.js?v=horror-aftereffects-20261003'),
  ]).then(([{ createPixelGlyphPainter }, { createMuseumHorrorUI }, { createHorrorPortraits }]) => {
    presentation = createSiteHorrorPresentation({ createPixelGlyphPainter, createMuseumHorrorUI, createHorrorPortraits });
    if (!away) presentation.resume();
  }).catch(() => {
    // The red-black CSS theme remains usable if an optional drawing module fails.
  }).finally(() => { starting = null; });
  return starting;
}

function createSiteHorrorPresentation({ createPixelGlyphPainter, createMuseumHorrorUI, createHorrorPortraits }) {
  const admin = !!document.getElementById('login-view');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const field = document.createElement('canvas');
  field.id = 'site-horror-field';
  field.setAttribute('aria-hidden', 'true');
  function sizeField() {
    const aspect = Math.max(0.25, document.documentElement.clientWidth / Math.max(1, window.innerHeight));
    field.height = Math.max(1, Math.round(Math.min(270, 640 / aspect)));
    field.width = Math.max(1, Math.round(field.height * aspect));
  }
  sizeField();
  const background = field.getContext('2d');
  const base = document.querySelector('.bg');
  if (base) base.after(field);
  else document.body.prepend(field);
  const painter = createPixelGlyphPainter(document);
  const portraitPainter = createHorrorPortraits(document, painter);
  const { portraits } = portraitPainter;
  const images = new Map();
  let ui = null;
  let imageDirty = true;
  let raf = 0;
  let previous = 0;
  let elapsed = 0;
  let frame = 0;
  let sceneTime = 0;
  let imageIdentity = 0;
  let paused = true;
  const selector = '.gal-item img,.gallery-grid img,.gallery-masonry img,.lightbox-photo img';

  function presenceCue() {
    if (preference.matches || admin) return { alpha: 0.52, near: 0.34, identity: 0, cycle: 0 };
    const cycle = Math.floor(sceneTime / 24);
    const phase = sceneTime % 24;
    const ease = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
    const alpha = 0.76 * ease((phase - 3) / 3) * (1 - ease((phase - 18.2) / 0.9));
    return { alpha, near: ease((phase - 10) / 7), identity: cycle % portraits.length, cycle };
  }

  function drawBackground() {
    if (!background) return;
    background.clearRect(0, 0, field.width, field.height);
    background.imageSmoothingEnabled = false;
    // Long empty intervals make the figure's return legible. Its scale grows
    // slowly between the birches, without flashing or moving the page itself.
    const cue = presenceCue();
    const faceWidth = Math.min(72, field.width * 0.4) * (0.35 + cue.near * 0.65);
    const x = field.width * (cue.cycle % 2 ? 0.78 : 0.84);
    const y = field.height * (0.31 - cue.near * 0.18);
    const portrait = portraits[cue.identity];
    background.globalAlpha = cue.alpha;
    background.fillStyle = '#030105';
    background.beginPath();
    background.moveTo(x - faceWidth * 0.28, y + faceWidth);
    background.lineTo(x - faceWidth * 0.78, y + faceWidth * 1.47);
    background.lineTo(x - faceWidth * 0.48, y + faceWidth * 4.3);
    background.lineTo(x + faceWidth * 0.47, y + faceWidth * 4.5);
    background.lineTo(x + faceWidth * 0.67, y + faceWidth * 1.45);
    background.lineTo(x + faceWidth * 0.24, y + faceWidth);
    background.closePath(); background.fill();
    background.fillRect(x - faceWidth * 0.88, y + faceWidth * 1.63, faceWidth * 0.16, faceWidth * 2.28);
    background.fillRect(x + faceWidth * 0.65, y + faceWidth * 1.57, faceWidth * 0.14, faceWidth * 2.5);
    if (portrait.ink) background.drawImage(portrait.canvas, x - faceWidth / 2, y, faceWidth, faceWidth * 4 / 3);
    background.globalAlpha = 1;
    background.fillStyle = '#32101d';
    for (let column = 0; column < 5; column++) {
      const x = 9 + column * field.width / 10;
      const y = 17 + (column * 37) % 83;
      painter.line(background, 3, x, y, 1, () => (column + 1) / 7);
    }
    field.dataset.frame = String(frame);
  }

  function dropCanvas(record) {
    if (!record.canvas) return;
    record.canvas.remove();
    record.canvas.width = record.canvas.height = 0;
    record.canvas = record.context = null;
  }

  function ensureCanvas(record) {
    if (record.canvas || !record.visible) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'site-horror-image';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = 192;
    canvas.height = 256;
    record.canvas = canvas;
    record.context = canvas.getContext('2d', { alpha: false });
    record.host.append(canvas);
    drawImagePortrait(record);
  }

  function drawImagePortrait(record) {
    const portrait = portraits[record.identity];
    if (!record.context || !portrait.ink) return;
    const still = preference.matches || admin;
    const phase = (sceneTime + record.identity * 4) % 18;
    const near = still ? 0 : Math.max(0, Math.sin(Math.max(0, phase - 9) / 9 * Math.PI));
    const crop = Math.floor(near * 14);
    record.context.imageSmoothingEnabled = false;
    record.context.drawImage(portrait.canvas, crop, crop, 192 - crop * 2, 256 - crop * 2, 0, 0, 192, 256);
  }

  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = images.get(entry.target);
      if (!record) continue;
      record.visible = entry.isIntersecting;
      if (record.visible) ensureCanvas(record);
      else dropCanvas(record);
    }
  }, { rootMargin: '120px' }) : null;
  const mutations = !admin && typeof MutationObserver === 'function'
    ? new MutationObserver(() => { imageDirty = true; }) : null;
  const observeImages = () => mutations?.observe(document.body, { subtree: true, childList: true });

  function synchronizeImages() {
    mutations?.disconnect();
    for (const [host, record] of images) {
      if (!host.isConnected || !host.querySelector('img')) {
        intersection?.unobserve(host);
        dropCanvas(record);
        images.delete(host);
      }
    }
    for (const image of document.querySelectorAll(selector)) {
      let host = image.closest('.gal-item,.lightbox-photo,.site-horror-image-host');
      if (!host) {
        host = document.createElement('span');
        image.replaceWith(host);
        host.append(image);
      }
      host.classList.add('site-horror-image-host');
      image.classList.add('site-horror-image-covered');
      let record = images.get(host);
      if (!record) {
        record = { host, identity: imageIdentity++ % portraits.length, visible: !intersection, canvas: null, context: null };
        images.set(host, record);
        intersection?.observe(host);
        ensureCanvas(record);
      }
    }
    imageDirty = false;
    observeImages();
  }

  function resetText() {
    ui?.dispose();
    if (admin) return;
    ui = createMuseumHorrorUI({ reducedMotion: preference.matches, visibleOnly: true, nativeLabels: false });
    ui.enable();
    document.documentElement.classList.remove('site-horror-covering');
  }

  function draw(dt) {
    if (!preference.matches && !admin) sceneTime += dt;
    frame++;
    portraitPainter.draw(sceneTime, preference.matches || admin);
    drawBackground();
    if (!admin) {
      if (mutations?.takeRecords().length) imageDirty = true;
      if (imageDirty) synchronizeImages();
      for (const record of images.values()) {
        if (record.visible) drawImagePortrait(record);
      }
    }
  }

  function tick(now) {
    raf = 0;
    if (paused || document.hidden || away) return;
    const dt = previous ? Math.min(0.25, (now - previous) / 1000) : 1 / 24;
    previous = now;
    elapsed += dt;
    ui?.update(dt);
    const interval = preference.matches ? 0.5 : 1 / 24;
    if (elapsed + 1e-8 >= interval) {
      const step = interval * Math.floor((elapsed + 1e-8) / interval);
      elapsed = Math.max(0, elapsed - step);
      draw(step);
    }
    if (!admin) raf = requestAnimationFrame(tick);
  }

  function pause() {
    paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
    previous = elapsed = 0;
  }
  function resume() {
    if (document.hidden || away || !paused) return;
    paused = false;
    imageDirty = true;
    raf = requestAnimationFrame(tick);
  }
  preference.addEventListener('change', () => {
    resetText();
    draw(0.5);
  });
  window.addEventListener('resize', () => { sizeField(); drawBackground(); });
  resetText();
  draw(1 / 24);
  return { pause, resume };
}

window.addEventListener('eytle:horror', activateSiteHorror);
window.addEventListener('pagehide', () => { away = true; presentation?.pause(); });
window.addEventListener('pageshow', () => {
  away = false;
  if (presentation) presentation.resume();
  else activateSiteHorror();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) presentation?.pause();
  else if (!away) presentation?.resume();
});
activateSiteHorror();
