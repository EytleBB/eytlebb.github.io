import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_LAYOUT, RIB_LIGHT_CHANNEL, projectorStationsInChunk } from './museum-lighting-layout.js?v=lighting-20260922-r6';

/* Nocturne: all surfaces and architectural profiles are generated locally.
   Shared, merged geometry keeps the endless hall's cost independent of distance. */
export function createMuseumArchitecture({ scene, renderer, camera, halfWidth, ceilingY, springY, chunkLength }) {
  const width = halfWidth * 2;
  const materials = {};
  let reflection;
  const chunkMeshes = new Map();
  const luminous = new Set();

  function stone(color, roughness, glow = 0) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06,
      emissive: color, emissiveIntensity: glow });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vStoneWorld;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vStoneWorld = (modelMatrix * vec4(position, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vStoneWorld;
float stoneHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float stoneNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x), mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x), f.y),
    mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}`).replace('#include <color_fragment>', `#include <color_fragment>
float cloud = stoneNoise(vStoneWorld * 2.4);
float mineral = stoneNoise(vStoneWorld * 27.0);
// Fade grains smaller than a pixel to their mean instead of sampling white noise.
vec3 grainFootprint = fwidth(vStoneWorld * 460.0);
float grainVisibility = 1.0-smoothstep(0.5,1.5,max(max(grainFootprint.x,grainFootprint.y),grainFootprint.z));
float grain = mix(0.5,stoneHash(floor(vStoneWorld * 460.0)),grainVisibility);
diffuseColor.rgb *= 0.88 + cloud * 0.13 + mineral * 0.055 + grain * 0.025;
float footShade = smoothstep(0.02, 0.72, vStoneWorld.y);
diffuseColor.rgb *= mix(0.48, 1.0, footShade);
`);
    };
    material.customProgramCacheKey = () => 'nocturne-mineral-v2';
    return material;
  }
  materials.wall = stone(0x142d32, 0.86, 0.018);
  materials.panel = stone(0x1f3a3c, 0.82, 0.024);
  materials.ivory = stone(0xb5b3a6, 0.66, 0.035);
  materials.dark = stone(0x101c20, 0.72);
  materials.ceiling = stone(0x182b30, 0.78, 0.035);
  materials.bronze = new THREE.MeshPhysicalMaterial({ color: 0xb8a078, metalness: 0.88,
    roughness: 0.3, anisotropy: 0.45, anisotropyRotation: Math.PI / 2, envMapIntensity: 1.2 });
  materials.frame = new THREE.MeshPhysicalMaterial({ color: 0xb5a58b, metalness: 0.82,
    roughness: 0.27, clearcoat: 0.18, envMapIntensity: 1.35 });
  materials.light = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.58, 0.91) });
  materials.coolLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.47, 0.72, 0.78) });
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
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 64 }).translate(0, 0, z - depth / 2);
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
      add(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), material);
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
        // Visitor-selected titles are drawn on these bronze supports by museum-plaques.
        box(0.028, 0.13, 0.74, side * (halfWidth - 0.025), 0.61, z, materials.bronze);
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
    // Downward-facing ceiling lamps share world stations with their soft floor pools.
    const lighting = LIGHTING_LAYOUT;
    for (const z of projectorStationsInChunk(originZ, chunkLength)) {
      const x = lighting.sourceX;
      const lensY = lighting.lensY;
      const canopyY = ceilingY - 0.025;
      add(new THREE.CylinderGeometry(0.19, 0.19, 0.045, 32).translate(x, canopyY, z), materials.dark);
      const stemBottom = lensY + 0.37;
      const stemHeight = canopyY - stemBottom;
      add(new THREE.CylinderGeometry(0.018, 0.018, stemHeight, 12)
        .translate(x, stemBottom + stemHeight / 2, z), materials.bronze);
      add(new THREE.CylinderGeometry(0.115, 0.15, 0.29, 32)
        .translate(x, lensY + 0.205, z), materials.bronze);
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.065, 32, 1, true)
        .translate(x, lensY + 0.03, z), materials.dark);
      add(new THREE.TorusGeometry(0.112, 0.012, 8, 32).rotateX(Math.PI / 2)
        .translate(x, lensY - 0.003, z), materials.bronze);
      // Finite luminous aperture, facing down towards its own circular pool.
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
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vReflection; varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vReflection = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      uniform float stationSpacing, stationOffset, sourceX, poolRadius, lightHeight;
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
        vec3 reflected = texture2D(tDiffuse, uv, 0.35).rgb;
        vec3 view = normalize(cameraPosition - vWorld);
        float fresnel = 0.26 + 0.4 * pow(1.0-max(view.y,0.0),3.0);
        vec3 base = vec3(0.016,0.025,0.028) * (0.95 + rough*0.08);
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
        result += vec3(1.0,0.86,0.68)*0.035*softPool*pow(incidence,3.0);
        float distanceFade = smoothstep(32.0,95.0,distance(cameraPosition,vWorld));
        result = mix(result,vec3(0.007,0.014,0.019),distanceFade);
        gl_FragColor = vec4(result,1.0);
      }`,
  };

  function makeFloor(length) {
    const group = new THREE.Group();
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
    resize();
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
    if (!reflection) return;
    // Give enlarged floor details enough samples, while bounding the secondary
    // view instead of allocating another native 4K/HiDPI scene.
    const ratio = Math.min(renderer.getPixelRatio(), 1536 / Math.max(window.innerWidth, window.innerHeight));
    const w = Math.max(320, Math.round(window.innerWidth * ratio));
    const h = Math.max(240, Math.round(window.innerHeight * ratio));
    reflection.getRenderTarget().setSize(w, h);
  }
  return { materials, attachChunk, makeFloor, makeRearWall, resize };
}
