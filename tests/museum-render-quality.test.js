const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/museum.js'), 'utf8');
const postSource = source.slice(source.indexOf('const bloomComposer ='), source.indexOf('const architecture ='));

// Execute the production render setup and resize/lifecycle callbacks. Model only
// the target sizing and pass contracts used here; browser QA covers GLSL output.
function setup(pixelRatio = 2, touch = false) {
  class Target {
    constructor(width, height, options = {}) {
      Object.assign(this, { width, height, samples: 0, ...options });
      this.texture = { isRenderTargetTexture: true };
    }
    setSize(width, height) { Object.assign(this, { width, height }); }
  }
  class Composer {
    constructor(renderer) {
      this.pixelRatio = renderer.getPixelRatio();
      this.width = 800; this.height = 600; this.passes = [];
      this.renderTarget1 = new Target(800 * this.pixelRatio, 600 * this.pixelRatio);
      this.renderTarget2 = new Target(800 * this.pixelRatio, 600 * this.pixelRatio);
    }
    setPixelRatio(value) { this.pixelRatio = value; this.setSize(this.width, this.height); }
    setSize(width, height) {
      Object.assign(this, { width, height });
      this.renderTarget1.setSize(width * this.pixelRatio, height * this.pixelRatio);
      this.renderTarget2.setSize(width * this.pixelRatio, height * this.pixelRatio);
    }
    addPass(pass) { this.passes.push(pass); }
    render() {}
  }
  class ShaderPass {
    constructor(shader, textureID = 'tDiffuse') {
      this.textureID = textureID;
      this.uniforms = {};
      for (const [key, uniform] of Object.entries(shader.uniforms)) {
        // Three's UniformsUtils cannot clone render-target textures.
        assert.ok(!uniform.value?.isRenderTargetTexture, 'bind target textures after uniform cloning');
        this.uniforms[key] = { ...uniform };
      }
    }
  }
  class RenderPass {}
  class SMAAPass {}
  class OutputPass {}
  class Bloom { constructor() { this.renderTargetsHorizontal = [new Target(200, 150)]; } }
  const listeners = {};
  const screen = {};
  const drawTargets = [];
  const renderer = {
    capabilities: { maxSamples: 4 }, ratio: pixelRatio, target: screen,
    getPixelRatio() { return this.ratio; }, setPixelRatio(value) { this.ratio = value; },
    setSize() {}, getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; },
    clear() {}, render() { drawTargets.push(this.target); if (this.fail) throw new Error('lost context'); },
  };
  const window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: pixelRatio,
    addEventListener(name, handler) { listeners[name] = handler; } };
  const scene = { background: {} };
  const sandbox = {
    TOUCH_MODE: touch, touchControls: null, resizeTouchFocus() {}, museumPixelRatio: (mobile, ratio) => Math.min(ratio, mobile ? 1.25 : 2),
    renderer, window, scene, camera: { layers: { set() {} }, updateProjectionMatrix() {} },
    THREE: { WebGLRenderTarget: Target, Vector2: class {}, Color: class {}, HalfFloatType: 'half' },
    EffectComposer: Composer, ShaderPass, RenderPass, UnrealBloomPass: Bloom, SMAAPass, OutputPass,
    architecture: { resize() {} }, requestSceneFrame() {},
  };
  vm.runInNewContext(postSource + '\nthis.post = {sceneTarget, finalComposer, bloomComposer, bloomMixPass, bloom, renderGalleryFrame};', sandbox);
  return { ...sandbox.post, renderer, window, scene, listeners, drawTargets, screen, SMAAPass, OutputPass };
}

test('the first frame and monitor changes use native pixels without multisampling post buffers', () => {
  const app = setup(2);
  for (const target of [app.sceneTarget, app.finalComposer.renderTarget1, app.finalComposer.renderTarget2]) {
    assert.equal(target.width, 1600); assert.equal(target.height, 1200);
  }
  assert.equal(app.sceneTarget.samples, 4);
  assert.equal(app.finalComposer.renderTarget1.samples, 0);
  assert.equal(app.finalComposer.renderTarget2.samples, 0);
  app.window.innerWidth = 1024; app.window.innerHeight = 768; app.window.devicePixelRatio = 1.25;
  app.listeners.resize();
  for (const target of [app.sceneTarget, app.finalComposer.renderTarget1, app.finalComposer.renderTarget2]) {
    assert.equal(target.width, 1280); assert.equal(target.height, 960);
  }
  assert.equal(app.bloomComposer.renderTarget1.width, 512);
});

test('light cores come only from the full-resolution scene and SMAA precedes output conversion', () => {
  const app = setup();
  assert.equal(app.bloomMixPass.uniforms.baseTexture.value, app.sceneTarget.texture);
  assert.equal(app.bloomMixPass.uniforms.bloomTexture.value, app.bloom.renderTargetsHorizontal[0].texture);
  assert.notEqual(app.bloomMixPass.uniforms.bloomTexture.value, app.bloomComposer.renderTarget2.texture);
  assert.equal(app.bloomMixPass.uniforms[app.bloomMixPass.textureID], undefined,
    'ShaderPass must not replace the explicit scene texture with an empty composer input');
  assert.ok(app.finalComposer.passes[1] instanceof app.SMAAPass);
  assert.ok(app.finalComposer.passes[2] instanceof app.OutputPass);
});

test('scene rendering uses the antialiased target and restores renderer state on failure', () => {
  const app = setup();
  const background = app.scene.background;
  app.renderGalleryFrame();
  assert.equal(app.drawTargets[0], app.sceneTarget);
  assert.equal(app.renderer.target, app.screen);
  assert.equal(app.scene.background, background);
  app.renderer.fail = true;
  assert.throws(() => app.renderGalleryFrame(), /lost context/);
  assert.equal(app.renderer.target, app.screen);
  assert.equal(app.scene.background, background);
});

test('rib emitters clear their metal housing and stay inside the collision margin', async () => {
  const { RIB_LIGHT_CHANNEL: channel } = await import('../js/museum-lighting-layout.js');
  const housingInnerEdge = channel.housingInset + channel.housingThickness;
  assert.ok(channel.emitterInset > housingInnerEdge, 'full emitter width must face the hall');
  assert.ok(channel.emitterInset - housingInnerEdge < 0.003, 'keep a small mounting clearance');
  assert.ok(channel.emitterInset + channel.emitterThickness < 0.4);
});

test('new debris participates in bloom occlusion and removed debris releases its registration', () => {
  const code = fs.readFileSync(path.join(__dirname, '../js/museum-bloom-occlusion.js'), 'utf8')
    .replace("import * as THREE from 'three';", '').replace('export function', 'function');
  class Layers { set(layer) { this.mask = 1 << layer; } test(other) { return Boolean(this.mask & other.mask); } }
  const create = vm.runInNewContext(code + '\ncreateMuseumBloomOcclusion;', {
    THREE: { Layers, MeshBasicMaterial: class { constructor(values) { Object.assign(this, values); } dispose() {} } },
  });
  const layer = new Layers(); layer.set(0);
  const material = { side: 0 };
  const mesh = { isMesh: true, visible: true, layers: layer, material };
  const root = { traverse(fn) { fn(mesh); } };
  const occlusion = create({ traverse() {} });
  occlusion.addObject(root);
  occlusion.render(() => assert.notEqual(mesh.material, material));
  assert.equal(mesh.material, material);
  occlusion.removeObject(root);
  occlusion.render(() => assert.equal(mesh.material, material));
  occlusion.dispose();
});

test('touch render targets omit scene MSAA and keep the capped density after rotation', () => {
  const app = setup(1.25, true);
  assert.equal(app.sceneTarget.samples, 0);
  app.window.innerWidth = 844; app.window.innerHeight = 390; app.window.devicePixelRatio = 3;
  app.listeners.resize();
  assert.equal(app.renderer.getPixelRatio(), 1.25);
  assert.equal(app.sceneTarget.width, 1055);
  assert.equal(app.sceneTarget.height, 488);
});
