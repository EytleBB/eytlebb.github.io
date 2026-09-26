// The museum's forward direction is -Z. This module owns only corridor state;
// wall meshes, collision, light levels and the finale remain scene concerns.
export function createHorrorCorridor({
  frontZ,
  rearZ,
  sectionLength = 7,
  wallMargin = .6,
  startZ = rearZ - wallMargin,
}) {
  if (![frontZ, rearZ, sectionLength, startZ, wallMargin].every(Number.isFinite)) {
    throw new TypeError('Horror corridor coordinates must be finite');
  }
  if (sectionLength <= 0 || wallMargin < 0 || wallMargin >= sectionLength) {
    throw new RangeError('Horror corridor section length and wall margin are invalid');
  }
  const finalRearZ = frontZ + 2 * sectionLength;
  if (rearZ < finalRearZ) {
    throw new RangeError('Horror corridor needs at least two sections');
  }

  const sectionAt = z => Math.max(0, Math.floor((z - frontZ) / sectionLength));
  const startSection = sectionAt(startZ);
  const totalSteps = Math.max(1, startSection - 1);
  const sectionCount = z => Math.max(2, Math.ceil((z - frontZ) / sectionLength - 1e-10));
  const state = {
    frontZ,
    rearZ,
    steps: 0,
    progress: 0,
    remainingSections: sectionCount(rearZ),
    finaleReady: rearZ === finalRearZ,
  };

  function advance(playerZ, forwardZ) {
    if (!Number.isFinite(playerZ) || !Number.isFinite(forwardZ)) return state;

    // Reaching a new section darkens the hall even when walking backwards.
    // Returning to an older section never restores light.
    state.steps = Math.max(state.steps, Math.min(totalSteps, startSection - sectionAt(playerZ)));
    state.progress = Math.min(1, state.steps / totalSteps);

    // Keep the wall frozen for a backward or sideways gaze. Turning forward
    // catches it up in one update, including after crossing several sections.
    if (forwardZ < -.15 && !state.finaleReady) {
      const nearestBehind = frontZ + Math.ceil((playerZ + wallMargin - frontZ) / sectionLength) * sectionLength;
      state.rearZ = Math.min(state.rearZ, Math.max(finalRearZ, nearestBehind));
      state.remainingSections = sectionCount(state.rearZ);
      if (state.rearZ === finalRearZ) state.finaleReady = true;
    }
    return state;
  }

  return { state, advance };
}
