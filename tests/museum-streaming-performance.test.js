const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const museum = fs.readFileSync(path.join(root, 'js', 'museum.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'museum.html'), 'utf8');

test('museum spreads GPU texture uploads across frames with a soft budget', () => {
  assert.match(museum, /processTextureUploadQueue\(frameStartedAt\)/);
  assert.match(museum, /TEXTURE_UPLOAD_MIN_INTERVAL_MS/);
  assert.match(museum, /TEXTURE_UPLOAD_FRAME_BUDGET_MS/);
  assert.match(museum, /TEXTURE_UPLOAD_MAX_WAIT_MS/);
  assert.match(museum, /textureUploadQueue\.push/);
  assert.match(museum, /updateTextureStreaming\(true\)/);
});

test('streamed artwork is attached and evicted incrementally', () => {
  assert.match(museum, /loadTextureIndices\(missing, null, \(imageIndex\) =>/);
  assert.match(museum, /refreshArtworkSlots\(new Set\(\[imageIndex\]\)\)/);
  assert.match(museum, /function evictDistantTextures\(maxRemove = 1\)/);
});

test('recycled chunks reuse artwork, frame, and lamp-arm geometries', () => {
  assert.match(museum, /const artworkGeometryCache = new Map\(\)/);
  assert.match(museum, /const pictureFrameGeometryCache = new Map\(\)/);
  assert.match(museum, /const rodGeometryCache = new Map\(\)/);
  assert.doesNotMatch(museum, /pic\.geometry\.dispose\(\)/);
  assert.doesNotMatch(museum, /rod\.geometry\.dispose\(\)/);
});

test('entry prewarms audio without lowering visual quality', () => {
  assert.match(museum, /museumTrack\.preload = 'auto'/);
  assert.match(museum, /connectMuseumTrack\(\)/);
  assert.match(museum, /url\.split\('\?'\)\[0\]/);
  assert.match(museum, /renderer\.setPixelRatio\(Math\.min\(window\.devicePixelRatio, 2\)\)/);
  assert.match(html, /js\/museum\.js\?v=museum-frame-budget-20260816/);
});
