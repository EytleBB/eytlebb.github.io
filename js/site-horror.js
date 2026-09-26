// The ordinary site never loads the pixel renderer or allocates these canvases.
let starting = null;
let presentation = null;
let away = false;

async function activateSiteHorror() {
  if (!window.eytleHorror?.isActive() || presentation || starting) return;
  starting = Promise.all([
    import('./museum-horror-glyphs.js?v=pixel-20260926'),
    import('./museum-horror-ui.js?v=site-horror-20260926'),
  ]).then(([{ createPixelGlyphPainter }, { createMuseumHorrorUI }]) => {
    presentation = createSiteHorrorPresentation({ createPixelGlyphPainter, createMuseumHorrorUI });
    if (!away) presentation.resume();
  }).catch(() => {
    // The red-black CSS theme remains usable if an optional drawing module fails.
  }).finally(() => { starting = null; });
  return starting;
}

function createSiteHorrorPresentation({ createPixelGlyphPainter, createMuseumHorrorUI }) {
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
  const face = document.createElement('canvas');
  face.width = 192;
  face.height = 256;
  const ink = face.getContext('2d', { alpha: false });
  const painter = createPixelGlyphPainter(document);
  const images = new Map();
  let ui = null;
  let imageDirty = true;
  let raf = 0;
  let previous = 0;
  let elapsed = 0;
  let frame = 0;
  let paused = true;
  const selector = '.gal-item img,.gallery-grid img,.gallery-masonry img,.lightbox-photo img';

  function drawFace() {
    if (!ink) return;
    const jitter = preference.matches ? 0 : Math.floor(Math.random() * 3) - 1;
    ink.fillStyle = '#100207';
    ink.fillRect(0, 0, 192, 256);
    ink.fillStyle = '#48101c';
    for (let row = 0; row < 15; row++) painter.line(ink, 28, 9, 8 + row * 17);
    ink.fillStyle = '#751c2b';
    ink.beginPath();
    ink.moveTo(74, 31); ink.lineTo(121, 29); ink.lineTo(145, 68);
    ink.lineTo(139, 152); ink.lineTo(118, 210); ink.lineTo(87, 227);
    ink.lineTo(60, 179); ink.lineTo(47, 86); ink.closePath(); ink.fill();
    ink.fillStyle = '#aa3c43';
    ink.fillRect(63, 65, 14, 60); ink.fillRect(126, 64, 8, 62);
    ink.fillRect(76, 40, 42, 7); ink.fillRect(74, 161, 8, 27);
    ink.fillStyle = '#13030a';
    ink.fillRect(58 + jitter, 89, 30, 21); ink.fillRect(106 + jitter, 83, 29, 24);
    ink.fillRect(70, 109, 6, 35); ink.fillRect(117, 105, 5, 39);
    ink.fillRect(85, 139, 27, 62); ink.fillRect(80, 152, 38, 28);
    ink.fillStyle = '#df7771';
    ink.fillRect(72 + jitter, 98, 3, 3); ink.fillRect(115 + jitter, 93, 3, 3);
    ink.fillRect(94, 177, 3, 9);
    ink.fillStyle = '#17030a';
    for (let row = 0; row < 256; row += 4) ink.fillRect(0, row, 192, 1);
    ink.fillStyle = '#b84851';
    painter.line(ink, 23, 26, 235);
    if (!preference.matches && frame % 7 === 0) {
      const y = 46 + Math.floor(Math.random() * 150);
      ink.drawImage(face, 0, y, 183, 5, 9, y, 183, 5);
    }
  }

  function drawBackground() {
    if (!background) return;
    background.clearRect(0, 0, field.width, field.height);
    background.imageSmoothingEnabled = false;
    // A dim figure amongst the original forest, away from the hero's text.
    background.globalAlpha = 0.72;
    const faceWidth = Math.min(124, field.width * 0.7);
    if (ink) background.drawImage(face, field.width * 0.76 - faceWidth / 2, field.height * 0.11, faceWidth, faceWidth * 1.68);
    background.globalAlpha = 1;
    background.fillStyle = '#541b29';
    for (let column = 0; column < 10; column++) {
      const x = 9 + column * field.width / 10;
      const y = 17 + (column * 37) % 83;
      painter.line(background, 3, x, y);
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
    if (record.context && ink) record.context.drawImage(face, 0, 0);
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
        record = { host, visible: !intersection, canvas: null, context: null };
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
  }

  function draw(dt) {
    frame++;
    drawFace();
    drawBackground();
    if (!admin) {
      if (mutations?.takeRecords().length) imageDirty = true;
      if (imageDirty) synchronizeImages();
      for (const record of images.values()) {
        if (record.visible && record.context && ink) record.context.drawImage(face, 0, 0);
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
      const step = elapsed;
      elapsed = Math.max(0, elapsed - interval * Math.floor((elapsed + 1e-8) / interval));
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
