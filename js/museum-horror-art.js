import * as THREE from 'three';
import { createPixelGlyphPainter } from './museum-horror-glyphs.js?v=pixel-20260926';

// One small texture per surface type serves the entire streamed museum.
// This module is inert until the hidden mode creates its first texture set.
const FRAME_SECONDS = 1 / 8;

export function createMuseumHorrorArt({ reducedMotion = false } = {}) {
  const glyphs = createPixelGlyphPainter(document);
  let frame = 0;
  let accumulator = 0;
  let disposed = false;
  let state = 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    return { canvas, ctx, texture };
  }
  const art = surface(256, 256);
  const plaque = surface(256, 160);
  const name = surface(384, 64);
  const halo = art.ctx.createRadialGradient(127, 110, 8, 127, 110, 155);
  halo.addColorStop(0, '#551116');
  halo.addColorStop(.54, '#25070c');
  halo.addColorStop(1, '#080204');

  function path(ctx, points, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawArt() {
    const ctx = art.ctx;
    const drift = reducedMotion ? 0 : Math.sin(frame * .13) * 2;
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 27; row++) {
      ctx.fillStyle = row % 4 === 0 ? '#75252a' : '#491217';
      glyphs.line(ctx, 43, -2, row * 10 - 2, 1, random);
    }
    // Long broken registration bars make the texture feel damaged and encoded.
    for (let i = 0; i < 19; i++) {
      ctx.fillStyle = i % 4 ? '#5b141b' : '#8b2630';
      ctx.fillRect(12 + random() * 234, 14 + random() * 198, 1 + random() * 2, 7 + random() * 48);
    }
    ctx.save();
    ctx.translate(drift, 0);
    // A narrow, stretched figure remains legible even at a distance.
    path(ctx, [40,256, 57,222, 93,200, 106,170, 149,170, 162,203, 199,224, 217,256], '#0a0306', '#59141c');
    path(ctx, [86,76, 94,46, 114,33, 140,36, 160,52, 172,87, 163,145, 150,177, 127,202, 104,176, 90,139], '#631920', '#b63b44');
    path(ctx, [94,72, 109,46, 139,45, 155,67, 161,100, 151,154, 129,183, 111,166, 98,126], '#371015');
    path(ctx, [91,87, 107,78, 121,89, 116,108, 97,106], '#0a0306', '#92303a');
    path(ctx, [134,89, 154,78, 163,88, 157,106, 139,108], '#0a0306', '#92303a');
    const eye = reducedMotion ? 0 : (frame % 19 < 3 ? 2 : 0);
    ctx.fillStyle = '#d26061';
    ctx.fillRect(107 + eye, 92, 2, 3);
    ctx.fillRect(148 + eye, 91, 2, 3);
    path(ctx, [125,95, 115,125, 123,130, 136,123, 131,118], '#13060a', '#78222b');
    path(ctx, [113,141, 124,135, 139,141, 143,159, 134,180, 125,187, 113,169, 108,154], '#080205', '#b13b43');
    ctx.strokeStyle = '#8f303a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(115 + i * 5, 141); ctx.lineTo(117 + i * 4, 147); ctx.stroke();
    }
    ctx.strokeStyle = '#7e252f';
    ctx.beginPath();
    ctx.moveTo(99,110); ctx.lineTo(108,133); ctx.lineTo(104,151);
    ctx.moveTo(153,112); ctx.lineTo(143,130); ctx.lineTo(153,148);
    ctx.moveTo(111,180); ctx.lineTo(103,220); ctx.lineTo(88,256);
    ctx.moveTo(145,181); ctx.lineTo(149,227); ctx.lineTo(161,256);
    ctx.stroke();
    ctx.fillStyle = '#af454b';
    glyphs.line(ctx, 4, 114, 58, 1, random);
    ctx.fillStyle = '#581720';
    glyphs.line(ctx, 6, 92, 220, 2, random);
    ctx.restore();
    // Narrow displaced strips animate without large bright flashes.
    for (let i = 0; i < 3; i++) {
      const y = Math.floor(22 + random() * 211);
      const h = 2 + Math.floor(random() * 4);
      const shift = Math.floor(random() * 17) - 8;
      ctx.drawImage(art.canvas, 0, y, 256, h, shift, y, 256, h);
      ctx.fillStyle = '#180409';
      ctx.fillRect(shift < 0 ? 256 + shift : 0, y, Math.abs(shift), h);
    }
    ctx.fillStyle = '#030104';
    for (let y = 1; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);
    ctx.fillStyle = '#b43d43';
    ctx.fillRect(12, 12, 22, 1); ctx.fillRect(12, 12, 1, 20);
    ctx.fillRect(222, 12, 22, 1); ctx.fillRect(243, 12, 1, 20);
    ctx.fillRect(12, 242, 22, 1); ctx.fillRect(12, 223, 1, 20);
    ctx.fillRect(222, 242, 22, 1); ctx.fillRect(243, 223, 1, 20);
    art.texture.needsUpdate = true;
  }

  function drawPlaque() {
    const ctx = plaque.ctx;
    ctx.fillStyle = '#170609'; ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#622028'; ctx.fillRect(3, 3, 250, 1); ctx.fillRect(3, 156, 250, 1);
    ctx.fillStyle = '#b6454c';
    glyphs.line(ctx, 18, 16, 15, 1, random);
    ctx.fillStyle = '#d06b68';
    glyphs.line(ctx, 18, 16, 46, 2, random);
    glyphs.line(ctx, 18, 16, 72, 2, random);
    ctx.fillStyle = '#7c2932'; ctx.fillRect(16, 109, 223, 1);
    ctx.fillStyle = '#ae464e';
    glyphs.line(ctx, 30, 16, 122, 1, random);
    glyphs.line(ctx, 19, 16, 137, 1, random);
    plaque.texture.needsUpdate = true;
  }

  function drawName() {
    const ctx = name.ctx;
    ctx.fillStyle = '#170609'; ctx.fillRect(0, 0, 384, 64);
    ctx.fillStyle = '#6b232b'; ctx.fillRect(9, 8, 366, 1); ctx.fillRect(9, 55, 366, 1);
    ctx.fillStyle = '#cd5d64';
    glyphs.line(ctx, 29, 18, 25, 2, random);
    name.texture.needsUpdate = true;
  }

  function redraw() {
    state = (0x24cc0ffe + Math.imul(frame, 1973)) >>> 0;
    drawArt(); drawPlaque(); drawName();
  }
  redraw();
  return {
    artTexture: art.texture,
    plaqueTexture: plaque.texture,
    nameTexture: name.texture,
    update(dt) {
      if (disposed || reducedMotion || !Number.isFinite(dt) || dt <= 0) return false;
      accumulator += Math.min(dt, .25);
      if (accumulator + 1e-8 < FRAME_SECONDS) return false;
      accumulator = Math.max(0, accumulator - FRAME_SECONDS * Math.floor((accumulator + 1e-8) / FRAME_SECONDS));
      frame++;
      redraw();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      glyphs.dispose();
      for (const item of [art, plaque, name]) {
        item.texture.dispose();
        item.canvas.width = item.canvas.height = 1;
      }
    },
  };
}
