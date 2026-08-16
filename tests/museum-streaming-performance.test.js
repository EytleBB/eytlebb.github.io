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

test('the entrance preloads the complete initially reachable texture range', () => {
  assert.match(museum, /const INITIAL_TEXTURE_START = 0/);
  assert.match(museum, /const INITIAL_TEXTURE_COUNT = 48/);
  assert.match(museum, /const HOMEPAGE_TEXTURE_INSERTION_INDEX = 16/);
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

test('hidden chunks are retargeted one artwork per frame before recycling', () => {
  assert.match(museum, /const CHUNK_RETARGET_PREPARE_DISTANCE = 88/);
  assert.match(museum, /function reserveChunkRetarget\(chunk\)/);
  assert.match(museum, /function processChunkRetargetQueue\(frameStartedAt\)/);
  assert.match(museum, /setArtTexture\(chunk\.slots\[plan\.cursor\], plan\.indices\[plan\.cursor\]\)/);
  assert.match(museum, /prepareHiddenRearChunk\(playerZ\)/);
  assert.doesNotMatch(museum, /function retargetChunk\(chunk\)/);
});

test('gallery images decode off the main thread and release bitmap memory', () => {
  assert.match(museum, /await createImageBitmap\(source\.blob/);
  assert.match(museum, /texture\.userData\.imageBitmap = bitmap/);
  assert.match(museum, /imageBitmap\?\.close\?\.\(\)/);
  assert.match(museum, /disposeGalleryTexture\(texture\)/);
});

test('picture light positions avoid redundant scene-graph walks without changing the pool', () => {
  assert.match(museum, /worldLightPosition\.copy\(fixture\.lightLocalPosition\)\.add\(fixture\.parent\.position\)/);
  assert.doesNotMatch(museum, /fixture\.parent\.localToWorld/);
  assert.match(museum, /while \(pictureSpotPool\.length < MAX_REAL_SPOT_LIGHTS\)/);
});

test('entry prewarms audio without lowering visual quality', () => {
  assert.match(museum, /museumTrack\.preload = 'auto'/);
  assert.match(museum, /connectMuseumTrack\(\)/);
  assert.match(museum, /url\.split\('\?'\)\[0\]/);
  assert.match(museum, /renderer\.setPixelRatio\(Math\.min\(window\.devicePixelRatio, 2\)\)/);
  assert.match(html, /js\/museum\.js\?v=museum-stutter-fix-20260816/);
});
