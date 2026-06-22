# 3D Museum Gallery — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design), pending implementation plan
**Topic:** Replace the gallery grid (on capable devices) with a first-person walkable, infinitely-extending, photorealistic 3D museum.

## Goal

Clicking "画廊 / Gallery" on a capable desktop browser drops the visitor into a
first-person, free-roam (WASD + mouse) 3D museum that extends forever forward,
with the site's gallery images hung as framed artworks. The rendering must read
as **photorealistic**, not a throwaway Three.js demo: PBR materials, per-artwork
spotlights with independent shadow maps, soft shadows, subtle frame glare, a
polished reflective floor, image-based lighting, and ACES filmic tone mapping.
Lighting and shadow quality are treated as first-class as layout.

Mobile / touch / unsupported devices fall back to the existing grid + lightbox —
no behavior change there.

## Non-Goals

- No build step, bundler, or package manager (site is static, served as-is).
- No mobile 3D experience (mobile keeps the current grid).
- No backend, no per-image captions/metadata (images are numbered files only).
- No day/night theme switching inside the museum — it is a fixed dramatic dark hall.
- No multiplayer, no audio (out of scope for v1).

## Architecture

### Files

| File | Change | Role |
|------|--------|------|
| `museum.html` | **new** | Standalone full-screen page (self-contained like `mc-calc.html`). Loads Three.js via importmap, mounts the canvas + loading gate + HUD. |
| `js/museum.js` | **new** | All museum logic (scene, renderer, chunk streaming, controls, focus interaction). ES module. |
| `css/museum.css` | **new** (or inline in `museum.html`) | Loading gate, HUD, crosshair, exit button styling. |
| `js/main.js` | **edit** | Gallery nav entry: capability gate → navigate to `museum.html` (desktop) or render existing grid (mobile/fallback). |
| `CLAUDE.md` | **edit** | Document `museum.html` alongside the `mc-calc.html` note. |

### Dependency loading

Three.js core + addons load from **jsDelivr CDN** via an ES-module `<script type="importmap">`, pinned to a fixed version (target `three@0.16x`). No vendoring.

Addons used (all from `three/examples/jsm/`):
- `PointerLockControls` — first-person WASD + mouse look.
- `Reflector` — true planar floor reflections.
- `RoomEnvironment` + `PMREMGenerator` — IBL environment map for PBR reflections.
- `EffectComposer`, `RenderPass`, `OutputPass` — post pipeline.
- `UnrealBloomPass` — very subtle bloom on light fixtures only.
- `SSAOPass` (or `GTAOPass`) — contact AO in corners / behind frames.

### Integration with main.js

The "gallery" nav click is intercepted with a capability check:

```
isMuseumCapable() =
  has WebGL2 context
  && 'requestPointerLock' in Element.prototype
  && not a coarse/touch primary pointer (matchMedia('(pointer: fine)'))
  && viewport width >= ~900px
```

- **Capable** → `location.href = 'museum.html'`.
- **Not capable** → existing `renderGallery()` grid (unchanged).

The capability gate fires **only on an explicit nav click**, not on hash restore.
`renderGallery()` remains the content rendered for the `#gallery` hash, so:
- pressing browser-back from the museum lands on the grid (no auto-relaunch loop),
- the museum's exit button navigates to `index.html` (home), also avoiding a relaunch loop.

### Data

`museum.js` fetches the same `./images/gallery/index.json` (auto-generated list of
filenames) and builds artwork URLs with `encodeURIComponent` per filename (handles
`[10].png`-style names exactly as `loadGallery()` does today). It does **not** edit
`index.json` (Action-owned).

## Spatial model — infinite corridor via chunk streaming

- The museum is one **straight corridor** extending along `-Z` (forward), fixed
  width and ceiling height, dark modern-minimalist finish.
- A **chunk** is a fixed-length corridor segment carrying a small fixed number of
  artworks per side (e.g. 2 per wall → 4 per chunk; exact count tuned for spacing).
- A **pool of N chunks** (enough to fill view distance ahead + a buffer behind) is
  created once and **recycled**: as the player crosses into a new chunk, the
  rearmost chunk is repositioned to the front and its artworks are re-textured with
  the next images from the gallery list, cycling through all images endlessly.
- Recycling reuses geometry/materials/lights (no per-frame allocation); only the
  artwork **textures** are swapped (loaded lazily, with the previous texture
  disposed to bound memory).
- Result: bounded draw calls + bounded VRAM, but the visitor can never reach an end.

### Movement & collision

- `PointerLockControls` for look; WASD (+ optional shift-to-run) for movement on a
  fixed-height floor plane (no flying, no vertical look-walking).
- Player X is clamped to keep them inside the corridor walls; player Z is free
  forward, clamped at the origin so they cannot walk into the void behind the start.
- Simple analytic clamping (corridor is an axis-aligned box) — no physics engine.

## Rendering pipeline (the core deliverable)

1. **Renderer**: `WebGLRenderer({ antialias:true })`, `outputColorSpace = SRGB`,
   `toneMapping = ACESFilmicToneMapping`, tuned `toneMappingExposure`,
   `useLegacyLights = false` (physically based intensities),
   `shadowMap.enabled = true`, `shadowMap.type = PCFSoftShadowMap`.
2. **IBL**: `PMREMGenerator.fromScene(RoomEnvironment)` → `scene.environment`, giving
   all PBR materials subtle, coherent reflections and ambient fill.
3. **Materials (PBR)**:
   - Walls / ceiling: `MeshStandardMaterial`, high roughness, dark albedo, faint
     micro-normal for surface life.
   - Frames: `MeshPhysicalMaterial` with low roughness + clearcoat → **subtle glare**
     where spotlights graze the frame.
   - Artwork "glass": a thin transparent `MeshPhysicalMaterial` pane in front of each
     image, picking up env + spotlight reflection → realistic glazed-frame glare.
   - Artwork image: `MeshStandardMaterial` with the photo as `map`, color space SRGB.
4. **Reflective floor**: `Reflector` plane for true mirror reflections, blended under
   a roughness/tint overlay so it reads as **polished, wet-looking but not a mirror**
   — reflects artworks and spotlight pools.
5. **Per-artwork lighting**: each artwork gets its **own `SpotLight`** mounted as a
   ceiling track light, angled down onto the piece, with `penumbra` for soft edges
   and `castShadow = true` (independent shadow map per light, tuned `mapSize` + bias).
   This is the "independent spotlight rendering" requirement.
6. **Soft shadows**: `PCFSoftShadowMap`, per-light shadow camera framing + bias to
   avoid acne/peter-panning. Plus **SSAO/GTAO** post pass for contact shadows in
   corners and behind frames.
7. **Post pipeline** (`EffectComposer`): `RenderPass` → AO pass → very subtle
   `UnrealBloomPass` (threshold high enough to touch only fixtures) → `OutputPass`
   (handles tone mapping / color space).
8. **Performance guards**: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`;
   shadow-casting limited to nearby chunks' lights; AO/bloom resolution capped;
   light shadow maps sized conservatively. Targets a smooth 60fps on a mid desktop GPU.

## Interaction & UX

- **Entry gate**: on load, a dark overlay shows a texture-load progress indicator and
  control hints (WASD 移动 / 鼠标转视角 / 点击锁定 / 点击画作聚焦 / Esc 退出). A
  "点击进入 / Enter" button satisfies the browser user-gesture requirement and calls
  `controls.lock()`.
- **Pointer lock**: clicking the canvas locks the pointer; a thin crosshair shows in
  the center; `Esc` unlocks (browser default) and re-shows a light HUD.
- **Focus on artwork**: when the crosshair is over an artwork and the visitor clicks,
  the camera **smoothly tweens** to a straight-on close-up framing of that piece
  (raycast to identify the artwork; lerp position + lookAt over ~0.6s). Clicking
  again or `Esc` tweens back to the roam position and re-locks look.
- **Exit**: a persistent corner "✕ 退出 / Exit" button (and a long-press/secondary
  Esc once unlocked) navigates to `index.html`.
- All UI text trilingual where practical, reading `lang` from `localStorage`
  (same key main.js uses) so the museum matches the site language; default zh.

## Loading & error handling

- Fetch `images/gallery/index.json`; if it fails or is empty, show a message in the
  gate ("画廊暂无图片") and offer a "返回" button instead of entering.
- Textures load via `TextureLoader`; the entry gate's progress reflects the initial
  batch (enough to fill the visible chunks). Later chunks texture lazily during roam.
- If WebGL context is lost, show an overlay with a reload/return option.

## Testing / verification

Static site, no test runner. Verification is manual in a desktop browser:
- Museum launches from the Gallery nav on desktop; mobile still shows the grid.
- WASD + mouse roam works; pointer lock + Esc behave; can't clip through walls or
  walk behind the start.
- Walking forward indefinitely keeps showing artworks (chunk recycling) with stable
  framerate and no memory growth (DevTools heap + draw-call count steady).
- Spotlights light each piece individually; floor reflects; frames show subtle glare;
  shadows are soft; tone mapping looks filmic (no blown highlights/crushed blacks).
- Clicking an artwork focuses it; Esc / second click returns to roam.
- Exit returns to `index.html`; browser-back from museum shows the grid (no relaunch loop).
- Filenames with brackets (`[10].png`) load correctly.

## Open risks

- CDN dependency: jsDelivr outage would break the museum (grid fallback unaffected).
  Acceptable for v1; could vendor later if it becomes a problem.
- Mid/low desktop GPUs: post stack (AO + bloom + planar reflection + many shadow
  maps) is heavy. Mitigations above; a quality-down step (drop AO/bloom, lower
  reflection res) can be added if profiling shows it's needed.
