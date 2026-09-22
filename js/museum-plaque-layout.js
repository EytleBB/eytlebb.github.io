// Consistent exhibition label height; x on the artwork plane points to its right.
export const PLAQUE_WIDTH = 0.52;
export const PLAQUE_HEIGHT = 0.35;
export const PLAQUE_HEIGHT_FROM_FLOOR = 1.37;
export const PLAQUE_FOCUS_DISTANCE = 0.64;

export function plaquePlacement(side, artworkWidth, frameBorder, localZ, halfWidth = 3) {
  const offset = artworkWidth / 2 + frameBorder + 0.16 + PLAQUE_WIDTH / 2;
  return {
    x: side * (halfWidth - 0.061),
    y: PLAQUE_HEIGHT_FROM_FLOOR,
    z: localZ + side * offset,
    rotationY: -side * Math.PI / 2,
  };
}
