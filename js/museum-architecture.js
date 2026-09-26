import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_LAYOUT, RIB_LIGHT_CHANNEL, projectorStationsInChunk } from './museum-lighting-layout.js?v=lighting-20260922-r6';

/* Nocturne: all surfaces and architectural profiles are generated locally.
   Shared, merged geometry keeps the endless hall's cost independent of distance. */
export function createMuseumArchitecture({ scene, renderer, camera, halfWidth, ceilingY, springY, chunkLength }) {
  const width = halfWidth * 2;
  const materials = {};
  let reflection, floorGroup, matteFloor;
  let reflectionsEnabled = true;
  let blackout = false, normalEmitters = null;
  const chunkMeshes = new Map();
  const luminous = new Set();

  function stone(color, roughness, glow = 0) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06,
      emissive: color, emissiveIntensity: glow });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vStoneWorld;
varying vec3 vStoneLocal;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vStoneWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vStoneLocal = position;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vStoneWorld;
varying vec3 vStoneLocal;
float stoneHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float stoneNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x), mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x), f.y),
    mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
float cloud = stoneNoise(vStoneWorld * 2.4);
vec3 mineralFootprint = fwidth(vStoneWorld * 27.0);
float mineralVisibility = 1.0 - smoothstep(0.4, 1.2,
  max(max(mineralFootprint.x, mineralFootprint.y), mineralFootprint.z));
float rawMineral = stoneNoise(vStoneWorld * 27.0);
float mineral = mix(0.5, rawMineral, mineralVisibility);
// Fade grains smaller than a pixel to their mean instead of sampling white noise.
vec3 grainFootprint = fwidth(vStoneWorld * 460.0);
float grainVisibility = 1.0-smoothstep(0.5,1.5,max(max(grainFootprint.x,grainFootprint.y),grainFootprint.z));
float grain = mix(0.5,stoneHash(floor(vStoneWorld * 460.0)),grainVisibility);
diffuseColor.rgb *= 0.84 + cloud * 0.20 + mineral * 0.065 + grain * 0.025;
float footShade = smoothstep(0.02, 0.72, vStoneWorld.y);
diffuseColor.rgb *= mix(0.42, 1.0, footShade);
// Contact shading belongs to the wall/vault behind each rib, not its front face.
float ribDistance = abs(mod(vStoneLocal.z + 3.5, 7.0) - 3.5);
float shellRadius = length(vec2(vStoneWorld.x, max(0.0, vStoneWorld.y - ${springY.toFixed(4)})));
float shellContact = smoothstep(${(halfWidth - 0.05).toFixed(4)}, ${halfWidth.toFixed(4)}, shellRadius);
float ribOcclusion = exp(-max(ribDistance - 0.155, 0.0) * 8.0) * shellContact;
diffuseColor.rgb *= 1.0 - ribOcclusion * 0.34;
`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.92 + cloud * 0.10 + mineral * 0.10), 0.2, 1.0);
`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// Sub-millimetre mineral relief uses derivatives of the same band-limited stone.
// A world-space height field keeps the relief stable across chunks and mirrors.
// Apply footprint attenuation after differentiating: derivatives of fwidth
// would be undefined higher-order derivatives on some mobile GPUs.
float reliefDx = dFdx(cloud) * 0.0014 + dFdx(rawMineral) * 0.0007 * mineralVisibility;
float reliefDy = dFdy(cloud) * 0.0014 + dFdy(rawMineral) * 0.0007 * mineralVisibility;
vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
vec3 reliefX = cross(dpdy, normal), reliefY = cross(normal, dpdx);
float determinant = dot(dpdx, reliefX);
vec3 reliefGradient = sign(determinant) * (reliefDx * reliefX + reliefDy * reliefY);
normal = normalize(max(abs(determinant), 0.00000001) * normal - reliefGradient);
`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
// Low-energy indirect spill from the existing rib and skirting light channels.
// Analytic architectural bounce avoids adding lights/shadow maps per hall bay.
float channelReach = smoothstep(${(halfWidth - 0.52).toFixed(4)}, ${(halfWidth - 0.22).toFixed(4)}, shellRadius);
float ribBounce = exp(-ribDistance * 4.2) * channelReach;
float footBounce = exp(-abs(vStoneWorld.y - 0.21) * 8.0)
  * smoothstep(${(halfWidth - 0.7).toFixed(4)}, ${halfWidth.toFixed(4)}, abs(vStoneWorld.x));
reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.69, 0.38)
  * (ribBounce * 0.22 + footBounce * 0.14);
`);
    };
    material.customProgramCacheKey = () => `nocturne-mineral-relief-v3:${halfWidth}:${springY}`;
    return material;
  }
  materials.wall = stone(0x142d32, 0.86, 0.008);
  materials.panel = stone(0x203b3d, 0.82, 0.012);
  materials.ivory = stone(0x96978b, 0.68, 0.006);
  materials.dark = stone(0x101c20, 0.72);
  materials.ceiling = stone(0x14272d, 0.82, 0.009);
  materials.bronze = new THREE.MeshPhysicalMaterial({ color: 0xb8a078, metalness: 0.88,
    roughness: 0.3, anisotropy: 0.45, anisotropyRotation: Math.PI / 2, envMapIntensity: 1.2 });
  materials.frame = new THREE.MeshPhysicalMaterial({ color: 0xb5a58b, metalness: 0.82,
    roughness: 0.27, clearcoat: 0.18, envMapIntensity: 1.35 });
  // One shared satin housing material: fixture detail remains merged per chunk.
  materials.projector = new THREE.MeshPhysicalMaterial({ color: 0x252a29,
    metalness: 0.82, roughness: 0.34, clearcoat: 0.12, envMapIntensity: 1.25 });
  materials.light = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 1.35, 0.75) });
  materials.coolLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.28, 0.43, 0.48) });
  luminous.add(materials.light); luminous.add(materials.coolLight);

  // A centered light channel follows the pier and the arch intrados.
  // Its Z center is the same as the stone rib, with symmetric bronze edging.
  function archGeometry(radius, thickness, depth, centerY, z) {
    const shape = new THREE.Shape();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const a = i / steps * Math.PI;
      const x = Math.cos(a) * radius, y = centerY + Math.sin(a) * radius;
      if (!i) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = i / steps * Math.PI;
      shape.lineTo(Math.cos(a) * (radius - thickness), centerY + Math.sin(a) * (radius - thickness));
    }
    shape.closePath();
    // Only the stone rib has a 10 mm bevel; the precision light channel stays crisp.
    const bevel = thickness > 0.2 ? 0.01 : 0;
    return new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2,
      bevelEnabled: bevel > 0, bevelSegments: 2, bevelSize: bevel,
      bevelThickness: bevel, steps: 1, curveSegments: 64 }).translate(0, 0, z - depth / 2 + bevel);
  }
  function shellGeometry() {
    const points = [], normals = [], uv = [], indices = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i <= 64; i++) {
      const a = i / 64 * Math.PI;
      points.push(Math.cos(a) * halfWidth, springY + Math.sin(a) * (ceilingY - springY), -j * chunkLength);
      normals.push(-Math.cos(a), -Math.sin(a), 0); uv.push(i / 64, j);
    }
    for (let i = 0; i < 64; i++) indices.push(i, i + 1, i + 66, i, i + 66, i + 65);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices);
    return geo;
  }
  function makeChunkMeshes(originZ) {
    const buckets = new Map();
    function add(geometry, material) {
      if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(geometry);
    }
    function box(sx, sy, sz, x, y, z, material) {
      if (material === materials.ivory) {
        const b = 0.01, shape = new THREE.Shape();
        const hw = sx / 2 - b, hh = sy / 2 - b;
        shape.moveTo(-hw, -hh); shape.lineTo(hw, -hh);
        shape.lineTo(hw, hh); shape.lineTo(-hw, hh); shape.closePath();
        add(new THREE.ExtrudeGeometry(shape, { depth: sz - b * 2, bevelEnabled: true,
          bevelSize: b, bevelThickness: b, bevelSegments: 2, steps: 1 })
          .translate(x, y, z - sz / 2 + b), material);
      } else {
        add(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), material);
      }
    }
    add(shellGeometry(), materials.ceiling);
    for (const side of [-1, 1]) {
      box(0.16, springY, chunkLength, side * (halfWidth + 0.08), springY / 2, -chunkLength / 2, materials.wall);
      // End rails and their emitters before each pier/plinth, including the
      // next chunk's boundary pier. The 25 cm reveal clears the 22.5 cm plinth.
      const bayLength = chunkLength / 2;
      const railLength = bayLength - 0.5;
      for (const z of [-bayLength / 2, -bayLength * 1.5]) {
        box(0.08, 0.19, railLength, side * (halfWidth - 0.028), 0.095, z, materials.dark);
        box(0.012, 0.018, railLength, side * (halfWidth - 0.073), 0.21, z, materials.light);
        box(0.12, 0.16, railLength, side * (halfWidth - 0.04), springY - 0.065, z, materials.bronze);
        box(0.018, 0.028, railLength, side * (halfWidth - 0.103), springY + 0.03, z, materials.coolLight);
      }
      for (const z of [-3.5, -10.5]) {
        // The shadow reveal surrounds a wall panel behind each original artwork.
        box(0.025, 2.84, 4.18, side * (halfWidth + 0.006), 1.78, z, materials.dark);
        box(0.023, 2.76, 4.10, side * (halfWidth - 0.008), 1.78, z, materials.panel);
        box(0.027, 0.011, 4.10, side * (halfWidth - 0.012), 3.165, z, materials.bronze);
        // Detachable title plates (including their bronze body) belong to museum-plaques.
      }
    }
    for (const z of [0, -7]) {
      const channel = RIB_LIGHT_CHANNEL;
      add(archGeometry(halfWidth, 0.23, 0.31, springY, z), materials.ivory);
      add(archGeometry(halfWidth - channel.housingInset, channel.housingThickness, 0.068, springY, z), materials.bronze);
      add(archGeometry(halfWidth - channel.emitterInset, channel.emitterThickness, 0.024, springY, z), materials.light);
      for (const side of [-1, 1]) {
        box(0.23, springY, 0.31, side * (halfWidth - 0.115), springY / 2, z, materials.ivory);
        box(channel.housingThickness, springY - 0.25, 0.068,
          side * (halfWidth - channel.housingInset - channel.housingThickness / 2), (springY + 0.25) / 2, z, materials.bronze);
        box(channel.emitterThickness, springY - 0.27, 0.024,
          side * (halfWidth - channel.emitterInset - channel.emitterThickness / 2), (springY + 0.27) / 2, z, materials.light);
        box(0.32, 0.22, 0.45, side * (halfWidth - 0.155), 0.11, z, materials.dark);
        // Fine flutes in the pier catch the grazing light.
        for (const dz of [-0.10, 0.10]) box(0.017, springY - 0.42, 0.013,
          side * (halfWidth - 0.237), springY / 2, z + dz, materials.bronze);
      }
      // Dark bronze coffers make the ceiling read as real architecture.
      for (const fraction of [-0.76, -0.47, 0, 0.47, 0.76]) {
        const x = halfWidth * fraction;
        const y = springY + Math.sqrt(1 - fraction * fraction) * (ceilingY - springY) - 0.022;
        box(0.035, 0.035, 6.5, x, y, z - 3.5, materials.bronze);
      }
      for (const side of [-1, 1]) {
        const x = side * 1.3;
        const y = springY + Math.sqrt(1 - (x / halfWidth) ** 2) * (ceilingY - springY) - 0.04;
        box(0.20, 0.025, 3.8, x, y, z - 3.5, materials.dark);
        box(0.10, 0.027, 3.65, x, y - 0.017, z - 3.5, materials.coolLight);
      }
    }
    // A recessed optical cartridge and stepped cooling body make the downlights
    // read as real fittings. Every part joins shared material buckets, so adding
    // machining detail does not create a draw call for each repeated fixture.
    const lighting = LIGHTING_LAYOUT;
    const housingProfile = [
      [0.103, 0.058], [0.103, -0.025], [0.142, -0.025],
      [0.158, -0.008], [0.162, 0.026], [0.148, 0.216],
      [0.123, 0.292], [0.095, 0.321], [0, 0.321],
    ].map(([radius, y]) => new THREE.Vector2(radius, y));
    for (const z of projectorStationsInChunk(originZ, chunkLength)) {
      const x = lighting.sourceX;
      const lensY = lighting.lensY;
      const canopyY = ceilingY - 0.025;
      // Thin champagne reveal between the ceiling canopy and its dark cover.
      add(new THREE.CylinderGeometry(0.185, 0.185, 0.035, 32)
        .translate(x, canopyY, z), materials.projector);
      add(new THREE.CylinderGeometry(0.152, 0.159, 0.026, 32)
        .translate(x, canopyY - 0.029, z), materials.bronze);
      const stemBottom = lensY + 0.345;
      const stemTop = canopyY - 0.04;
      add(new THREE.CylinderGeometry(0.017, 0.017, stemTop - stemBottom, 12)
        .translate(x, (stemBottom + stemTop) / 2, z), materials.projector);
      add(new THREE.CylinderGeometry(0.044, 0.047, 0.065, 24)
        .translate(x, lensY + 0.332, z), materials.bronze);
      add(new THREE.LatheGeometry(housingProfile, 40)
        .translate(x, lensY, z), materials.projector);
      // Three restrained ribs catch highlights without a noisy serrated outline.
      for (const [y, radius] of [[0.208, 0.151], [0.236, 0.143], [0.264, 0.133]]) {
        add(new THREE.CylinderGeometry(radius, radius, 0.009, 32)
          .translate(x, lensY + y, z), materials.projector);
      }
      add(new THREE.TorusGeometry(0.147, 0.008, 8, 40).rotateX(Math.PI / 2)
        .translate(x, lensY - 0.013, z), materials.bronze);
      // A dark anti-glare throat surrounds the warm lens, 25 mm behind the lip.
      // Keep the actual emitter center and downward normal on the shared layout.
      add(new THREE.CircleGeometry(0.103, 40).rotateX(Math.PI / 2)
        .translate(x, lensY + 0.006, z), materials.projector);
      add(new THREE.TorusGeometry(lighting.apertureRadius + 0.005, 0.003, 6, 40)
        .rotateX(Math.PI / 2).translate(x, lensY + 0.002, z), materials.bronze);
      add(new THREE.CircleGeometry(lighting.apertureRadius, 40).rotateX(Math.PI / 2)
        .translate(x, lensY, z), materials.light);
    }
    const result = [];
    for (const [material, geometries] of buckets) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      geometry.computeBoundingSphere();
      result.push({ geometry, material });
    }
    return result;
  }

  function attachChunk(group) {
    const phase = ((group.position.z - LIGHTING_LAYOUT.stationOffset) % LIGHTING_LAYOUT.stationSpacing
      + LIGHTING_LAYOUT.stationSpacing) % LIGHTING_LAYOUT.stationSpacing;
    if (!chunkMeshes.has(phase)) chunkMeshes.set(phase, makeChunkMeshes(group.position.z));
    for (const {geometry, material} of chunkMeshes.get(phase)) {
      const mesh = new THREE.Mesh(geometry, material);
      if (luminous.has(material)) mesh.layers.enable(1);
      group.add(mesh);
    }
  }

  const floorShader = {
    name: 'NocturneObsidian',
    uniforms: { color: {value: null}, tDiffuse: {value: null}, textureMatrix: {value: null},
      stationSpacing: {value: LIGHTING_LAYOUT.stationSpacing},
      stationOffset: {value: LIGHTING_LAYOUT.stationOffset},
      sourceX: {value: LIGHTING_LAYOUT.sourceX},
      poolRadius: {value: LIGHTING_LAYOUT.poolRadius},
      lightHeight: {value: LIGHTING_LAYOUT.lensY - LIGHTING_LAYOUT.floorY},
      poolStrength: {value: 1},
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflection; varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vReflection = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform float stationSpacing, stationOffset, sourceX, poolRadius, lightHeight, poolStrength;
      varying vec4 vReflection; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      // Box-filter thin inlays/seams: subpixel lines lose coverage instead of
      // becoming a screen-wide pattern of equally dark one-pixel stair steps.
      float line(float v, float w) {
        float footprint = max(fwidth(v),0.00001);
        return (clamp(v+footprint*0.5,-w,w)-clamp(v-footprint*0.5,-w,w))/footprint;
      }
      void main() {
        vec2 uv = vReflection.xy / vReflection.w;
        vec2 grainFootprint = fwidth(vWorld.xz*210.0);
        float grainVisibility = 1.0-smoothstep(0.5,1.5,max(grainFootprint.x,grainFootprint.y));
        float rough = (hash(floor(vWorld.xz*210.0)) - 0.5) * grainVisibility;
        // Filter minified reflections isotropically; the old diagonal 3-tap blur
        // smeared near detail while leaving stair steps on the opposite diagonal.
        vec3 reflected = texture2D(tDiffuse, uv, 1.05).rgb;
        vec3 view = normalize(cameraPosition - vWorld);
        float fresnel = 0.14 + 0.36 * pow(1.0-max(view.y,0.0),3.0);
        vec3 base = vec3(0.012,0.020,0.023) * (0.95 + rough*0.12);
        vec3 result = mix(base, reflected, fresnel);
        float seamX = line(mod(vWorld.x+0.7,1.4)-0.7,0.003);
        float seamZ = line(mod(vWorld.z+1.75,3.5)-1.75,0.004);
        result *= 1.0 - max(seamX,seamZ)*0.44;
        float edge = line(abs(vWorld.x)-2.61,0.012);
        float inner = line(abs(vWorld.x)-2.54,0.002);
        result = mix(result,vec3(0.28,0.19,0.08),max(edge,inner)*0.48);
        // Diffuse ceiling illumination in world space. No engraved ring, annular
        // gobo, camera-facing decal, or time-dependent radius: just a soft pool
        // beneath each real lamp, smoothly disappearing before the next station.
        vec2 lampOffset = vec2(vWorld.x-sourceX,
          mod(vWorld.z-stationOffset+stationSpacing*0.5,stationSpacing)-stationSpacing*0.5);
        float radialDistance = length(lampOffset);
        float normalizedRadius = radialDistance / poolRadius;
        float softPool = exp(-3.5*normalizedRadius*normalizedRadius)
          * (1.0-smoothstep(0.8,1.0,normalizedRadius));
        float incidence = lightHeight/sqrt(lightHeight*lightHeight+radialDistance*radialDistance);
        result += vec3(1.0,0.82,0.57)*0.072*softPool*pow(incidence,3.0)*poolStrength;
        float distanceFade = smoothstep(32.0,95.0,distance(cameraPosition,vWorld));
        result = mix(result,vec3(0.007,0.014,0.019),distanceFade);
        gl_FragColor = vec4(result,1.0);
      }`,
  };

  function makeFloor(length) {
    const group = new THREE.Group();
    floorGroup = group;
    reflection = new Reflector(new THREE.PlaneGeometry(width, length), {
      clipBias: 0.003, textureWidth: 1, textureHeight: 1,
      multisample: Math.min(4, renderer.capabilities.maxSamples),
      shader: floorShader, color: 0xffffff,
    });
    reflection.name = 'Obsidian planar reflection';
    const reflectedTexture = reflection.getRenderTarget().texture;
    reflectedTexture.generateMipmaps = true;
    reflectedTexture.minFilter = THREE.LinearMipmapLinearFilter;
    // A mirror camera must never clone the player's spatial-audio listener.
    const mirrorCamera = reflection.getReflectionCamera(camera);
    mirrorCamera.clear();
    mirrorCamera.layers.set(0);
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.y = LIGHTING_LAYOUT.floorY;
    reflection.material.toneMapped = false;
    group.add(reflection);
    scene.add(group);
    setReflectionsEnabled(reflectionsEnabled);
    return group;
  }

  function makeRearWall() {
    const group = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, ceilingY), materials.wall);
    wall.position.y = ceilingY / 2; wall.rotation.y = Math.PI; group.add(wall);
    scene.add(group);
    return group;
  }
  function resize() {
    if (!reflection || !reflectionsEnabled) return;
    // Give enlarged floor details enough samples, while bounding the secondary
    // view instead of allocating another native 4K/HiDPI scene.
    const ratio = Math.min(renderer.getPixelRatio(), 1536 / Math.max(window.innerWidth, window.innerHeight));
    const w = Math.max(320, Math.round(window.innerWidth * ratio));
    const h = Math.max(240, Math.round(window.innerHeight * ratio));
    reflection.getRenderTarget().setSize(w, h);
  }
  function setBlackout(value) {
    blackout = Boolean(value);
    if (!normalEmitters) normalEmitters = [materials.light.color.clone(), materials.coolLight.color.clone()];
    for (const [index, material] of [materials.light, materials.coolLight].entries()) {
      if (blackout) material.color.setRGB(0, 0, 0);
      else material.color.copy(normalEmitters[index]);
    }
    syncFloorPools();
  }
  function syncFloorPools() {
    const strength = blackout || !reflectionsEnabled ? 0 : 1;
    floorShader.uniforms.poolStrength.value = strength;
    if (reflection) reflection.material.uniforms.poolStrength.value = strength;
  }
  function setReflectionsEnabled(value) {
    reflectionsEnabled = Boolean(value);
    syncFloorPools();
    if (!reflection) return;
    // Hiding Reflector also prevents its onBeforeRender secondary camera pass.
    reflection.visible = reflectionsEnabled;
    if (reflectionsEnabled) {
      if (matteFloor) {
        matteFloor.removeFromParent();
        matteFloor.material.dispose();
        // The plane geometry is shared with Reflector and remains owned by it.
        matteFloor = null;
      }
      resize();
      return;
    }
    if (!matteFloor) {
      const material = new THREE.MeshLambertMaterial({ color: 0x141318,
        emissive: 0x19151f, reflectivity: 0, fog: true });
      matteFloor = new THREE.Mesh(reflection.geometry, material);
      matteFloor.name = 'Unreflective horror floor';
      matteFloor.position.copy(reflection.position);
      matteFloor.rotation.copy(reflection.rotation);
      floorGroup.add(matteFloor);
    }
  }
  return { materials, attachChunk, makeFloor, makeRearWall, resize, setBlackout, setReflectionsEnabled };
}
