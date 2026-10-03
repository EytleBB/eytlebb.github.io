import { createPixelGlyphPainter } from './museum-horror-glyphs.js?v=pixel-20260926';
import { createHorrorPortraits } from './site-horror-portraits.js?v=horror-aftereffects-20261003';

// The ordinary site imports this renderer only after a previous museum ending.
// The caller owns scheduling, visibility and reduced-motion preferences.
export function createAftereffectsVisual({ document = globalThis.document, window = globalThis.window } = {}) {
  const field = document.createElement('canvas');
  field.id = 'site-horror-aftereffects-field';
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.inset = '0';
  field.style.width = field.style.height = '100%';
  field.style.pointerEvents = 'none';
  field.style.imageRendering = 'pixelated';
  field.dataset.active = 'false';
  field.hidden = true;
  const background = field.getContext('2d');
  const forest = document.querySelector('.forest-scene');
  if (forest) forest.after(field);
  else document.body.prepend(field);
  const painter = createPixelGlyphPainter(document);
  const portraitPainter = createHorrorPortraits(document, painter);
  const durations = { glimpse: 1.05, reflection: 1.45, rush: 0.9 };
  let event = null;
  let lastFrame = -1;
  let disposed = false;

  function sizeField() {
    const aspect = Math.max(0.25, document.documentElement.clientWidth / Math.max(1, window.innerHeight));
    field.height = Math.max(1, Math.round(Math.min(270, 640 / aspect)));
    field.width = Math.max(1, Math.round(field.height * aspect));
    if (background) background.imageSmoothingEnabled = false;
  }
  sizeField();

  const ease = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };

  function face(x, y, width, height, alpha, reflected = false) {
    const portrait = portraitPainter.portraits[event.identity];
    if (!portrait.ink) return;
    background.save();
    background.globalAlpha = alpha;
    if (reflected) {
      background.translate(0, y * 2 + height);
      background.scale(1, -1);
    }
    // Clip to the original head contour, so no rectangular portrait background
    // covers the ordinary forest around the brief apparition.
    const points = [[70, 30], [122, 25], [146, 63], [139, 152], [118, 215], [87, 231], [57, 178], [45, 79]];
    background.beginPath();
    points.forEach(([px, py], index) => {
      const dx = x + (px - 42) / 108 * width, dy = y + (py - 20) / 216 * height;
      if (index === 0) background.moveTo(dx, dy);
      else background.lineTo(dx, dy);
    });
    background.closePath();
    background.clip();
    background.drawImage(portrait.canvas, 42, 20, 108, 216, x, y, width, height);
    background.restore();
  }

  function glimpse(seconds) {
    const alpha = 0.56 * ease(seconds / 0.13) * (1 - ease((seconds - 0.67) / 0.38));
    const width = Math.min(40, field.width * 0.21, field.height * 0.15);
    const x = field.width * (event.side > 0 ? 0.88 : 0.12) - width / 2;
    const y = field.height * 0.27;
    background.globalAlpha = alpha;
    background.fillStyle = '#030105';
    background.beginPath();
    background.moveTo(x + width * 0.3, y + width * 1.6);
    background.lineTo(x - width * 0.2, y + width * 2.1);
    background.lineTo(x, y + width * 4.4);
    background.lineTo(x + width * 1.03, y + width * 4.2);
    background.lineTo(x + width * 1.2, y + width * 2.15);
    background.lineTo(x + width * 0.7, y + width * 1.6);
    background.closePath(); background.fill();
    background.globalAlpha = 1;
    face(x, y, width, width * 2, alpha);
    // The strip is transparent: a real birch in the underlying painting remains
    // between the viewer and part of the face instead of a synthetic bright bar.
    background.clearRect(x + width * 0.59, y - 4, width * 0.18, width * 4.6);
  }

  function reflection(seconds) {
    const alpha = 0.29 * ease(seconds / 0.22) * (1 - ease((seconds - 0.85) / 0.6));
    const width = Math.min(58, field.width * 0.26, field.height * 0.18);
    const x = field.width * (event.side > 0 ? 0.78 : 0.22) - width / 2;
    const y = field.height * 0.64;
    face(x, y, width, width * 2.05, alpha, true);
    // Narrow dark water gaps break the reflection without moving the forest.
    for (let row = 0; row < width * 2.05; row += 7) background.clearRect(x - 1, y + row, width + 2, 2);
  }

  function rush(seconds) {
    const approach = ease(seconds / 0.16);
    const alpha = 0.84 * ease(seconds / 0.05) * (1 - ease((seconds - 0.51) / 0.39));
    const nearWidth = Math.min(field.width * 0.44, field.height * 0.69);
    const width = nearWidth * (0.21 + approach * 0.79);
    const center = field.width * (event.side > 0 ? 0.89 : 0.11);
    const y = field.height * (0.25 - approach * 0.11);
    face(center - width / 2, y, width, width * 2, alpha);
  }

  function stop() {
    event = null;
    lastFrame = -1;
    if (background) {
      background.clearRect(0, 0, field.width, field.height);
      background.globalAlpha = 1;
    }
    field.dataset.active = 'false';
    field.hidden = true;
  }

  function update(seconds) {
    if (!event || disposed || !background) return false;
    if (!Number.isFinite(seconds)) { stop(); return false; }
    seconds = Math.max(0, seconds);
    if (seconds >= durations[event.kind]) { stop(); return false; }
    const frame = Math.floor((seconds + 1e-8) * 24);
    if (frame === lastFrame) return true;
    lastFrame = frame;
    background.clearRect(0, 0, field.width, field.height);
    // Brief appearances use the shared fixed gaze; their arrival is the motion.
    portraitPainter.draw(0, true);
    if (event.kind === 'glimpse') glimpse(seconds);
    else if (event.kind === 'reflection') reflection(seconds);
    else rush(seconds);
    return true;
  }

  const resized = () => { sizeField(); lastFrame = -1; };
  window.addEventListener('resize', resized);
  return {
    show(kind, { identity = 0, side = 1 } = {}) {
      if (disposed || !background || !Object.hasOwn(durations, kind)) return false;
      stop();
      event = { kind, identity: Number.isFinite(identity) ? ((Math.trunc(identity) % 3) + 3) % 3 : 0, side: side < 0 ? -1 : 1 };
      field.dataset.kind = kind;
      field.dataset.active = 'true';
      field.hidden = false;
      sizeField();
      update(0);
      return true;
    },
    update,
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      window.removeEventListener('resize', resized);
      portraitPainter.dispose();
      painter.dispose();
      field.remove();
      field.width = field.height = 0;
    },
    get active() { return !!event && !disposed; },
  };
}
