import { LIGHTING_LAYOUT, projectorVolumeBounds } from './museum-lighting-layout.js?v=lighting-20260922-r6';

/**
 * Two draws add the air illuminated by the actual ceiling projectors and dust.
 * Sources stay on the architecture's world lattice, including in reflections.
 */
export function createMuseumAtmosphere({ THREE, scene, renderer, camera, width = 6, ceilingY = 6.7 }) {
  const layout = LIGHTING_LAYOUT;
  const volume = projectorVolumeBounds();
  const root = new THREE.Group();
  root.name = 'Museum atmosphere';
  scene.add(root);
  const resources = [];
  const own = resource => { resources.push(resource); return resource; };
  const shared = {
    uTime: { value: 0 },
    uEyeZ: { value: camera.position.z },
    uStationSpacing: { value: layout.stationSpacing },
    uStationOffset: { value: layout.stationOffset },
    uSourceX: { value: layout.sourceX },
    uLensY: { value: layout.lensY },
    uFloorY: { value: layout.floorY },
    uApertureRadius: { value: layout.apertureRadius },
    uPoolRadius: { value: layout.poolRadius },
    uVolumeBottomY: { value: volume.bottomY },
    uVolumeTopY: { value: volume.topY },
  };
  const lightingUniforms = `
    uniform float uStationSpacing;
    uniform float uStationOffset;
    uniform float uSourceX;
    uniform float uLensY;
    uniform float uFloorY;
    uniform float uApertureRadius;
    uniform float uPoolRadius;
    uniform float uVolumeBottomY;
    uniform float uVolumeTopY;
  `;

  // A circumscribed frustum covers the analytic beam without rectangular caps.
  // Its bottom is clear of the reflective floor: a coplanar proxy cap made whole
  // patches of the light fail the depth test as the camera moved. All 13 proxies
  // still share one draw call, including when viewed from inside a beam.
  const beamCount = 13;
  const proxy = new THREE.CylinderGeometry(volume.topRadius, volume.bottomRadius,
    volume.topY - volume.bottomY, volume.radialSegments, 1, false);
  proxy.translate(layout.sourceX, (volume.topY + volume.bottomY) / 2, 0);
  const shaftPositions = [], shaftSlots = [], shaftIndices = [];
  for (let shaft = 0; shaft < beamCount; shaft++) {
    shaftPositions.push(...proxy.attributes.position.array);
    shaftSlots.push(...Array(proxy.attributes.position.count).fill(shaft));
    for (const index of proxy.index.array) {
      shaftIndices.push(index + shaft * proxy.attributes.position.count);
    }
  }
  proxy.dispose();
  const shaftGeometry = own(new THREE.BufferGeometry());
  shaftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shaftPositions, 3));
  shaftGeometry.setAttribute('aSlot', new THREE.Float32BufferAttribute(shaftSlots, 1));
  shaftGeometry.setIndex(shaftIndices);
  const shaftMaterial = own(new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: `
      uniform float uEyeZ;
      ${lightingUniforms}
      attribute float aSlot;
      varying vec3 vWorld;
      varying float vSourceZ;
      void main() {
        float station = floor((uEyeZ - uStationOffset) / uStationSpacing) + 6.0 - aSlot;
        vSourceZ = station * uStationSpacing + uStationOffset;
        vWorld = position + vec3(0.0, 0.0, vSourceZ);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: `
      ${lightingUniforms}
      varying vec3 vWorld;
      varying float vSourceZ;
      // Clip the camera ray to the finite, downward-opening cone. The aperture
      // has a real radius; the beam cannot taper to a point above its lamp.
      bool intersectBeam(vec3 origin, vec3 direction, inout float entry, inout float exit) {
        float height = uLensY - uFloorY;
        float top = uVolumeTopY - uLensY;
        float bottom = uVolumeBottomY - uLensY;
        if (abs(direction.y) > 0.00001) {
          float y0 = (top - origin.y) / direction.y;
          float y1 = (bottom - origin.y) / direction.y;
          entry = max(entry, min(y0, y1));
          exit = min(exit, max(y0, y1));
        } else if (origin.y > top || origin.y < bottom) {
          return false;
        }
        float slope = (uPoolRadius - uApertureRadius) / height;
        float radiusAtEye = uApertureRadius - slope * origin.y;
        float axialSlope = slope * direction.y;
        float a = dot(direction.xz, direction.xz) - axialSlope * axialSlope;
        float b = 2.0 * (dot(origin.xz, direction.xz) + radiusAtEye * slope * direction.y);
        float c = dot(origin.xz, origin.xz) - radiusAtEye * radiusAtEye;
        if (abs(a) < 0.00001) {
          if (abs(b) < 0.00001) return c <= 0.0 && exit > entry;
          float edge = -c / b;
          if (b > 0.0) exit = min(exit, edge);
          else entry = max(entry, edge);
        } else {
          float discriminant = b * b - 4.0 * a * c;
          if (discriminant < 0.0) return a < 0.0 && exit > entry;
          float delta = sqrt(max(discriminant, 0.0));
          float t0 = (-b - delta) / (2.0 * a);
          float t1 = (-b + delta) / (2.0 * a);
          float nearSide = min(t0, t1), farSide = max(t0, t1);
          if (a > 0.0) {
            entry = max(entry, nearSide);
            exit = min(exit, farSide);
          } else if (entry < nearSide) {
            exit = min(exit, nearSide);
          } else {
            entry = max(entry, farSide);
          }
        }
        return exit > entry;
      }
      void main() {
        vec3 origin = cameraPosition - vec3(uSourceX, uLensY, vSourceZ);
        vec3 direction = normalize(vWorld - cameraPosition);
        float entry = 0.0, exit = length(vWorld - cameraPosition);
        if (!intersectBeam(origin, direction, entry, exit)) discard;
        float stride = (exit - entry) / 6.0;
        float integrated = 0.0;
        for (int i = 0; i < 6; i++) {
          vec3 samplePoint = origin + direction * (entry + (float(i) + 0.5) * stride);
          float along = clamp(-samplePoint.y / (uLensY - uFloorY), 0.0, 1.0);
          float radius = mix(uApertureRadius, uPoolRadius, along);
          float normalizedRadius = length(samplePoint.xz) / radius;
          float density = exp(-3.5 * normalizedRadius * normalizedRadius)
            * (1.0 - smoothstep(0.8, 1.0, normalizedRadius));
          float sourceFalloff = 0.34 / max(radius, 0.12);
          vec3 worldSample = samplePoint + vec3(uSourceX, uLensY, vSourceZ);
          // Fade to zero before either proxy cap, rather than exposing a clipped
          // luminous surface. No camera/time-dependent noise in the ray samples.
          float capFade = smoothstep(uVolumeBottomY, uVolumeBottomY + 0.12, worldSample.y)
            * (1.0 - smoothstep(uVolumeTopY - 0.06, uVolumeTopY, worldSample.y));
          float fogFade = 1.0 - smoothstep(50.0, 77.0, distance(cameraPosition, worldSample));
          integrated += density * sourceFalloff * capFade * fogFade * stride;
        }
        float alpha = 1.0 - exp(-integrated * 0.045);
        gl_FragColor = vec4(1.0, 0.82, 0.57, min(alpha, 0.13));
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
  }));
  const shafts = new THREE.Mesh(shaftGeometry, shaftMaterial);
  shafts.name = 'Ceiling projector light volumes';
  shafts.frustumCulled = false;
  shafts.renderOrder = 4;
  root.add(shafts);

  let seed = 0x19370418;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const dustCount = 360;
  const dustStations = 12;
  const dustSpan = layout.stationSpacing * dustStations;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const y = 0.20 + random() * (Math.min(ceilingY, layout.lensY) - 0.4);
    if (i % 3 === 0) {
      // A few particles cross each beam; the rest remain almost invisible in
      // ambient air. Positions wrap by a whole number of fixture spacings.
      const along = (layout.lensY - y) / (layout.lensY - layout.floorY);
      const radius = (layout.apertureRadius + (layout.poolRadius - layout.apertureRadius) * along)
        * Math.sqrt(random()) * 0.95;
      const angle = random() * Math.PI * 2;
      const station = Math.floor(random() * dustStations) - dustStations / 2;
      dustPositions[i * 3] = layout.sourceX + Math.cos(angle) * radius;
      dustPositions[i * 3 + 2] = station * layout.stationSpacing + layout.stationOffset + Math.sin(angle) * radius;
    } else {
      dustPositions[i * 3] = (random() - 0.5) * (width - 0.7);
      dustPositions[i * 3 + 2] = (random() - 0.5) * dustSpan;
    }
    dustPositions[i * 3 + 1] = y;
    dustSeeds[i] = random();
  }
  const dustGeometry = own(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('aSeed', new THREE.BufferAttribute(dustSeeds, 1));
  const dustUniforms = { ...shared, uPixelScale: { value: renderer.domElement.height }, uDustSpan: { value: dustSpan } };
  const dustMaterial = own(new THREE.ShaderMaterial({
    uniforms: dustUniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uEyeZ;
      uniform float uPixelScale;
      uniform float uDustSpan;
      ${lightingUniforms}
      attribute float aSeed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.z += floor((uEyeZ + uDustSpan * 0.5 - p.z) / uDustSpan) * uDustSpan;
        p.x += sin(uTime * 0.083 + aSeed * 91.0) * 0.045;
        p.y += sin(uTime * 0.057 + aSeed * 47.0) * 0.065;
        float fade = 1.0 - smoothstep(50.0, 77.0, distance(cameraPosition, p));
        float sourceZ = floor((p.z - uStationOffset) / uStationSpacing + 0.5) * uStationSpacing + uStationOffset;
        float along = clamp((uLensY - p.y) / (uLensY - uFloorY), 0.0, 1.0);
        float radius = mix(uApertureRadius, uPoolRadius, along);
        float normalizedRadius = length(vec2(p.x - uSourceX, p.z - sourceZ)) / radius;
        float lit = exp(-3.5 * normalizedRadius * normalizedRadius)
          * (1.0 - smoothstep(0.8, 1.0, normalizedRadius))
          * step(uFloorY, p.y) * step(p.y, uLensY);
        vec4 viewPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float physicalSize = mix(0.007, 0.019, aSeed * aSeed);
        float projectedSize = physicalSize * uPixelScale / max(0.5, -viewPosition.z);
        gl_PointSize = clamp(projectedSize, 0.7, 2.4);
        // Subpixel particles lose energy instead of turning into a starfield.
        vAlpha = fade * (0.012 + lit * 0.25) * min(1.0, projectedSize * projectedSize)
          * smoothstep(0.7, 2.5, -viewPosition.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float softDisc = exp(-r * r * 3.5) * (1.0 - smoothstep(0.55, 1.0, r));
        gl_FragColor = vec4(1.0, 0.82, 0.57, softDisc * vAlpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.name = 'Projector-illuminated suspended dust';
  dust.frustumCulled = false;
  dust.renderOrder = 5;
  root.add(dust);

  function update(dt = 0) {
    if (!root.visible) return;
    shared.uTime.value += Math.min(Math.max(dt, 0), 0.1);
    shared.uEyeZ.value = camera.position.z;
    dustUniforms.uPixelScale.value = renderer.domElement.height
      / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  }
  update();

  return {
    group: root,
    update,
    dispose() {
      scene.remove(root);
      resources.forEach(resource => resource.dispose());
      root.clear();
    },
  };
}
