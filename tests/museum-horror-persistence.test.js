const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../js/museum.js', `file://${__filename}`), 'utf8');
const bootSource = source.slice(source.indexOf('async function boot() {'), source.indexOf('\nboot().catch('));

async function bootHarness(active) {
  const calls = [];
  const window = active === undefined ? {} : { eytleHorror: { isActive: () => active } };
  const chunks = [];
  let restored = false;
  const context = vm.createContext({
    window, contextLost: false, PERF_STILL: false, PERF_AUTOWALK: false,
    INITIAL_TEXTURE_COUNT: 1, IMAGES: ['test.webp'], entered: false,
    scene: {}, camera: {}, pictureLightFixtures: [], fixtureBatch: null, bloomOcclusion: null,
    enterProg: {}, enterEl: {}, T: zh => zh,
    loadImageList: async () => calls.push('images'), setProgress() {},
    preloadInitialTextures: async progress => { progress(); calls.push('textures'); },
    prewarmMuseumTrack: () => calls.push('music-preload'),
    buildHall: () => { chunks.push({ resident: true }); calls.push('hall'); },
    refreshPlaqueTitles: async () => calls.push('plaques'),
    createMuseumFixtureBatch: () => { calls.push('fixtures'); return {}; },
    createMuseumBloomOcclusion: () => { calls.push('occlusion'); return {}; },
    connectMuseumTrack: () => calls.push('music-connect'),
    reportMuseumTrackFailure: error => { throw error; },
    museumHorror: { restore() {
      assert.ok(chunks.length > 0, 'the finite corridor needs resident chunks');
      assert.ok(context.fixtureBatch && context.bloomOcclusion, 'all scene owners exist before activation');
      restored = true; calls.push('restore');
    } },
    museumSounds: { breakObject() { throw new Error('restoration must never fake a destruction event'); } },
    prewarmScene: async () => {
      assert.equal(restored, active === true, 'shader prewarm sees the restored theme');
      calls.push('prewarm');
    },
    startLoop: () => calls.push('loop'), updateTextureStreaming: () => calls.push('stream'),
    readyToEnter: () => calls.push('ready'), fail: () => { throw new Error('unexpected boot failure'); },
  });
  vm.runInContext(`${bootSource}\nthis.runBoot = boot;`, context);
  await context.runBoot();
  return calls;
}

test('an active site latch restores horror after resident scene owners and before shader prewarm', async () => {
  const calls = await bootHarness(true);
  assert.equal(calls.filter(call => call === 'restore').length, 1);
  assert.ok(calls.indexOf('music-connect') < calls.indexOf('restore'));
  assert.ok(calls.indexOf('restore') < calls.indexOf('prewarm'));
  assert.ok(calls.indexOf('prewarm') < calls.indexOf('loop'));
});

test('ordinary museum startup works with an inactive or unavailable site latch', async () => {
  for (const active of [false, undefined]) {
    const calls = await bootHarness(active);
    assert.equal(calls.includes('restore'), false);
    assert.equal(calls.at(-1), 'ready');
  }
});

test('the museum activation callback latches the website synchronously before corridor setup', () => {
  const start = source.indexOf('  onActivate() {', source.indexOf('museumHorror = createMuseumHorror('));
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  const activationSource = source.slice(open + 1, end - 1);
  const calls = [], chunks = [{ pendingRetarget: {} }];
  const context = vm.createContext({
    window: { eytleHorror: { activate: () => calls.push('latch') } },
    museumSounds: { prepareHorror: () => calls.push('prepare-sound'), breakObject() { throw new Error('restoration cannot fake destruction'); } },
    streamBatchQueue: [1], queuedBatchStarts: new Set([1]), chunkRetargetQueue: [1], chunks,
    museumKnife: { setHorror: value => assert.equal(value, true) },
    scene: {}, camera: {}, architecture: {}, rearWall: {}, ART_SPACING: 7, CHUNK_LEN: 14,
    horrorEnding: null, museumHorror: {}, destruction: {}, floorRig: {},
    bloomOcclusion: { addObject() {} },
    createMuseumHorrorEnding() {
      assert.equal(calls[0], 'latch'); calls.push('corridor');
      return { advance: () => calls.push('advance') };
    },
    enableHorrorMusic: () => calls.push('music'), requestSceneFrame: () => calls.push('frame'),
  });
  vm.runInContext(`this.activate = function() {${activationSource}};`, context);
  context.activate();
  assert.deepEqual(calls, ['latch', 'prepare-sound', 'corridor', 'advance', 'music', 'frame']);
  assert.equal(context.streamBatchQueue.length, 0);
  assert.equal(context.chunkRetargetQueue.length, 0);
  assert.equal(chunks[0].pendingRetarget, null);
});
