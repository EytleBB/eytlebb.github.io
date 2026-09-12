/** One world-space layout for the ceiling projector, its shaft and its floor pool. */
export const LIGHTING_LAYOUT = Object.freeze({
  stationSpacing: 14,
  stationOffset: 0,
  sourceX: 0,
  lensY: 5.96,
  floorY: 0.006,
  apertureRadius: 0.085,
  poolRadius: 0.90,
  ringRadius: 0.66,
});

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
