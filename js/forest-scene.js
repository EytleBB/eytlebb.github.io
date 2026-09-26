/*
 * A living photograph: one WebGL2 pass gently refracts the lake while the
 * forest stays still. The CSS artwork is always the independent fallback.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('forest-scene');
  if (!canvas) return;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 760px)');
  const textures = new Map();
  const frameInterval = 1000 / 30;
  let gl = null;
  let program = null;
  let uniforms = null;
  let failed = false;
  let frameId = 0;
  let lastPaint = 0;
  let sceneTime = 0;
  let activeTexture = null;
  let requestedSource = '';
  let hero = null;
  let heroVisible = false;
  let scrollFrame = 0;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let maxBufferSize = 4096;

  const vertexSource = `#version 300 es
    out vec2 vUv;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      // Image coordinates use a top-left origin, just like CSS backgrounds.
      vUv = vec2(p.x, 1.0 - p.y);
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;
    uniform sampler2D uImage;
    uniform vec2 uCoverScale;
    uniform vec2 uCoverOffset;
    uniform float uTime;
    uniform float uDay;
    in vec2 vUv;
    out vec4 fragColor;

    void main() {
      vec2 uv = vUv * uCoverScale + uCoverOffset;

      // Mask in SOURCE image coordinates, so portrait and ultrawide crops
      // cannot move the water deformation onto the standing birch trees.
      float depth = smoothstep(0.67, 1.0, uv.y);
      float leftBank = 0.25 + 0.13 * exp(-pow((uv.y - 0.82) / 0.10, 2.0));
      float rightBank = mix(0.79, 1.03, smoothstep(0.67, 0.86, uv.y));
      float water = smoothstep(0.67, 0.72, uv.y)
        * smoothstep(leftBank, leftBank + 0.04, uv.x)
        * (1.0 - smoothstep(rightBank - 0.04, rightBank, uv.x));
      vec2 stone = (uv - vec2(0.792, 0.885)) / vec2(0.069, 0.040);
      water *= smoothstep(0.80, 1.35, length(stone));

      float wave = sin(uv.y * 177.0 + sin(uv.x * 9.0 + uTime * 0.13)
        * 1.6 - uTime * 0.64);
      float fineWave = sin(uv.y * 331.0 + uv.x * 19.0 - uTime * 0.83);
      vec2 refraction = vec2(
        wave * 0.00070 + fineWave * 0.00024,
        wave * 0.00012 + fineWave * 0.00007
      ) * water * (0.28 + depth * 0.72);
      vec3 color = texture(uImage, clamp(uv + refraction, 0.001, 0.999)).rgb;

      // A barely perceptible breath through the existing photographed mist.
      // No procedural noise or animated geometry touches the tree silhouettes.
      vec2 mistPosition = (uv - vec2(0.64, 0.46)) / vec2(0.26, 0.23);
      float mist = exp(-dot(mistPosition, mistPosition) * 2.0)
        * sin(uTime * 0.17 + uv.x * 5.0) * 0.0021;
      color += mist * mix(vec3(0.66, 0.78, 0.94), vec3(1.0, 0.92, 0.77), uDay);
      fragColor = vec4(color, 1.0);
    }
  `;

  function hideScene() {
    canvas.classList.remove('ready');
    canvas.hidden = true;
    if (frameId) cancelAnimationFrame(frameId);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    frameId = 0;
    scrollFrame = 0;
    lastPaint = 0;
  }

  function fail() {
    failed = true;
    hideScene();
    for (const entry of textures.values()) {
      if (entry.texture && gl && !gl.isContextLost()) gl.deleteTexture(entry.texture);
    }
    textures.clear();
    if (program && gl && !gl.isContextLost()) gl.deleteProgram(program);
    program = null;
    activeTexture = null;
  }

  function initialize() {
    if (gl || failed) return Boolean(gl && !failed);
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: true
      });
      if (!gl) throw new Error('WebGL2 unavailable');

      const vertex = gl.createShader(gl.VERTEX_SHADER);
      const fragment = gl.createShader(gl.FRAGMENT_SHADER);
      if (!vertex || !fragment) throw new Error('Shader allocation failed');
      gl.shaderSource(vertex, vertexSource);
      gl.shaderSource(fragment, fragmentSource);
      gl.compileShader(vertex);
      gl.compileShader(fragment);
      program = gl.createProgram();
      if (!program) throw new Error('Program allocation failed');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Scene shader could not link');
      }
      gl.useProgram(program);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      uniforms = {
        scale: gl.getUniformLocation(program, 'uCoverScale'),
        offset: gl.getUniformLocation(program, 'uCoverOffset'),
        time: gl.getUniformLocation(program, 'uTime'),
        day: gl.getUniformLocation(program, 'uDay')
      };
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
      const dimensions = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      maxBufferSize = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), dimensions[0], dimensions[1]);
      resize();
      return true;
    } catch (_) {
      fail();
      return false;
    }
  }

  function canAnimate() {
    return !root.classList.contains('site-horror') && !failed && !document.hidden && !reducedMotion.matches && heroVisible
      && (root.dataset.section || 'about') === 'about';
  }

  function sourceForTheme() {
    const theme = root.dataset.theme === 'day' ? 'day' : 'night';
    return `images/forest-${theme}${mobile.matches ? '-mobile' : ''}.webp`;
  }

  function setCover() {
    if (!gl || !activeTexture) return;
    const imageAspect = activeTexture.width / activeTexture.height;
    const viewportAspect = viewportWidth / viewportHeight;
    const sx = Math.min(1, viewportAspect / imageAspect);
    const sy = Math.min(1, imageAspect / viewportAspect);
    gl.uniform2f(uniforms.scale, sx, sy);
    gl.uniform2f(uniforms.offset, (1 - sx) * (mobile.matches ? 0.62 : 0.5), (1 - sy) * 0.5);
  }

  function activate(entry) {
    activeTexture = entry;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.uniform1f(uniforms.day, root.dataset.theme === 'day' ? 1 : 0);
    setCover();
    if (canAnimate() && !frameId) frameId = requestAnimationFrame(paint);
  }

  function requestTexture() {
    const source = sourceForTheme();
    if (requestedSource === source) return;
    requestedSource = source;
    activeTexture = null;
    hideScene();
    const existing = textures.get(source);
    if (existing) {
      if (existing.texture) activate(existing);
      return;
    }

    const entry = { texture: null, width: 0, height: 0 };
    textures.set(source, entry);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (failed) return;
      try {
        const texture = gl.createTexture();
        if (!texture) throw new Error('Texture allocation failed');
        entry.texture = texture;
        entry.width = image.naturalWidth;
        entry.height = image.naturalHeight;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, entry.width, entry.height);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
        // Check allocation once; never synchronize GPU error queries per frame.
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture upload failed');
        if (requestedSource === source) activate(entry);
        else if (activeTexture) gl.bindTexture(gl.TEXTURE_2D, activeTexture.texture);
      } catch (_) {
        fail();
      }
    };
    image.onerror = fail;
    image.src = source;
  }

  function paint(now) {
    frameId = 0;
    if (!canAnimate() || !activeTexture) {
      hideScene();
      return;
    }
    if (!lastPaint || now - lastPaint >= frameInterval - 1) {
      if (lastPaint) sceneTime += Math.min(now - lastPaint, 80) / 1000;
      lastPaint = now;
      gl.uniform1f(uniforms.time, sceneTime);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.hidden = false;
      canvas.classList.add('ready');
    }
    frameId = requestAnimationFrame(paint);
  }

  function resize() {
    // Read layout only on resize, never from the animation loop.
    viewportWidth = Math.max(1, root.clientWidth);
    viewportHeight = Math.max(1, window.innerHeight);
    if (!gl || failed) return;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      mobile.matches ? 1 : 1.5,
      Math.sqrt(3200000 / (viewportWidth * viewportHeight)),
      maxBufferSize / Math.max(viewportWidth, viewportHeight)
    );
    canvas.width = Math.max(1, Math.round(viewportWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(viewportHeight * pixelRatio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    setCover();
  }

  function synchronize() {
    if (!canAnimate()) {
      hideScene();
      return;
    }
    if (!initialize()) return;
    requestTexture();
    if (activeTexture && !frameId) frameId = requestAnimationFrame(paint);
  }

  const heroObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target === hero) heroVisible = entry.isIntersecting;
    }
    synchronize();
  }, { threshold: 0 }) : null;

  function trackHero() {
    const next = document.querySelector('.hero');
    if (next === hero) return;
    if (heroObserver && hero) heroObserver.unobserve(hero);
    hero = next;
    if (hero) {
      const bounds = hero.getBoundingClientRect();
      heroVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
      if (heroObserver) heroObserver.observe(hero);
    } else {
      heroVisible = false;
    }
    synchronize();
  }

  canvas.hidden = true;
  // A lost context returns directly to the CSS artwork. Avoid repeatedly
  // recreating a context on a device whose GPU is already under pressure.
  canvas.addEventListener('webglcontextlost', fail, false);
  new MutationObserver(synchronize).observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-section']
  });
  const stage = document.getElementById('stage');
  if (stage) new MutationObserver(trackHero).observe(stage, { childList: true });
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('pageshow', synchronize);
  window.addEventListener('eytle:horror', synchronize);
  window.addEventListener('pagehide', hideScene);
  window.addEventListener('resize', () => {
    resize();
    synchronize();
  }, { passive: true });
  window.addEventListener('scroll', () => {
    // IntersectionObserver handles current browsers without scroll layout reads.
    if (root.classList.contains('site-horror') || heroObserver || scrollFrame || !hero) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const bounds = hero.getBoundingClientRect();
      heroVisible = bounds.bottom > 0 && bounds.top < window.innerHeight;
      synchronize();
    });
  }, { passive: true });
  reducedMotion.addEventListener('change', synchronize);
  mobile.addEventListener('change', () => {
    resize();
    synchronize();
  });
  trackHero();
})();
