/** One world-space layout for the ceiling projector, its shaft and its floor pool. */
export const LIGHTING_LAYOUT = Object.freeze({
  stationSpacing: 14,
  stationOffset: 0,
  sourceX: 0,
  lensY: 5.96,
  floorY: 0.006,
  apertureRadius: 0.085,
  poolRadius: 1.65,
});

// The emitter is fully exposed on the hall-facing side of the bronze channel.
// A small separation prevents the housing from cutting jagged slivers out of it.
export const RIB_LIGHT_CHANNEL = Object.freeze({
  housingInset: 0.224,
  housingThickness: 0.023,
  emitterInset: 0.248,
  emitterThickness: 0.008,
});

/** Keep the transparent volume off opaque surfaces, with a cone-shaped proxy. */
export function projectorVolumeBounds() {
  const { floorY, lensY, apertureRadius, poolRadius } = LIGHTING_LAYOUT;
  const bottomY = floorY + 0.03;
  const topY = lensY - 0.02;
  const radialSegments = 32;
  // Circumscribe the analytic cone so polygon edges cannot cut into its glow.
  const coverage = 1 / Math.cos(Math.PI / radialSegments);
  const radiusAt = y => apertureRadius + (poolRadius - apertureRadius)
    * (lensY - y) / (lensY - floorY);
  return {
    bottomY, topY, radialSegments,
    bottomRadius: radiusAt(bottomY) * coverage,
    topRadius: radiusAt(topY) * coverage,
  };
}

/** Local Z positions owned by (originZ - length, originZ], without seam duplicates. */
export function projectorStationsInChunk(originZ, length) {
  const { stationSpacing, stationOffset } = LIGHTING_LAYOUT;
  const last = stationOffset + Math.floor((originZ - stationOffset) / stationSpacing) * stationSpacing;
  const stations = [];
  for (let worldZ = last; worldZ > originZ - length; worldZ -= stationSpacing) {
    stations.push(worldZ - originZ);
  }
  return stations;
}
