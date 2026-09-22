// Consistent exhibition label height; x on the artwork plane points to its right.
export const PLAQUE_WIDTH = 0.38;
export const PLAQUE_HEIGHT = 0.24;
export const PLAQUE_HEIGHT_FROM_FLOOR = 1.37;
export const PLAQUE_FOCUS_DISTANCE = 0.48;
export const WALL_PANEL_HALF_WIDTH = 2.09; // Includes the outer shadow reveal.

export function plaquePlacement(side, artworkWidth, frameBorder, localZ, halfWidth = 3) {
  const outerEdge = Math.max(WALL_PANEL_HALF_WIDTH, artworkWidth / 2 + frameBorder);
  const offset = outerEdge + 0.12 + PLAQUE_WIDTH / 2;
  return {
    x: side * (halfWidth - 0.018),
    y: PLAQUE_HEIGHT_FROM_FLOOR,
    z: localZ + side * offset,
    rotationY: -side * Math.PI / 2,
  };
}
