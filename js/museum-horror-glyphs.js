// Original 5×7 pixel shapes. Equal cells are exchanged in place, as with
// obfuscated game text; no platform font or random Unicode fallback is used.
export const PIXEL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-/<=>?@[]{}';
export const PIXEL_ROWS = [
  '0e11111f111111', '1e11111e11111e', '0e11101010110e', '1e11111111111e',
  '1f10101e10101f', '1f10101e101010', '0e11101711110f', '1111111f111111',
  '0e04040404040e', '0702020212120c', '11121418141211', '1010101010101f',
  '111b1515111111', '11191915131311', '0e11111111110e', '1e11111e101010',
  '0e11111115120d', '1e11111e141211', '0f10100e01011e', '1f040404040404',
  '1111111111110e', '11111111110a04', '11111115151b11', '11110a040a1111',
  '11110a04040404', '1f01020408101f', '0e11131519110e', '040c040404040e',
  '0e11010204081f', '1e01010e01011e', '02060a121f0202', '1f101e0101110e',
  '0610101e11110e', '1f010204080808', '0e11110e11110e', '0e11110f01020c',
  '0a0a1f0a1f0a0a', '19190204081313', '0c12140c15120d', '00150e1f0e1500',
  '0004041f040400', '0000001f000000', '01010204081010', '02040810080402',
  '00001f001f0000', '08040201020408', '0e110102040004', '0e11171517100e',
  '0e08080808080e', '0e02020202020e', '02040408040402', '08040402040408',
].map(rows => Uint8Array.from(rows.match(/../g), value => parseInt(value, 16)));

export function randomPixelGlyph(random = Math.random) {
  return Math.min(PIXEL_ROWS.length - 1, Math.max(0, Math.floor(random() * PIXEL_ROWS.length)));
}

export function scrambleMuseumText(text, random = Math.random) {
  return Array.from(text, character => /\s/u.test(character) ? character : PIXEL_ALPHABET[randomPixelGlyph(random)]).join('');
}

export function drawPixelGlyph(context, index, x, y, scale = 1, verticalScale = scale) {
  const rows = PIXEL_ROWS[index % PIXEL_ROWS.length];
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 5; column++) {
      if (rows[row] & (1 << (4 - column))) context.fillRect(x + column * scale, y + row * verticalScale, scale, verticalScale);
    }
  }
}

// The three scene textures use fixed cells, with integer pixel scale and no
// canvas font rasterization. Each refresh changes shapes, never their advance.
export function drawObfuscatedLine(context, count, x, y, scale = 1, random = Math.random) {
  for (let index = 0; index < count; index++) drawPixelGlyph(context, randomPixelGlyph(random), x + index * 6 * scale, y, scale);
}

// Scene text repeats a small palette. Cache each color once, then issue a
// single small image copy per letter rather than repainting every lit pixel.
export function createPixelGlyphPainter(document) {
  const atlases = new Map();
  return {
    line(context, count, x, y, scale = 1, random = Math.random) {
      const color = context.fillStyle;
      let atlas = atlases.get(color);
      if (!atlas) {
        atlas = document.createElement('canvas');
        atlas.width = PIXEL_ROWS.length * 6;
        atlas.height = 7;
        const ink = atlas.getContext('2d');
        ink.fillStyle = color;
        for (let index = 0; index < PIXEL_ROWS.length; index++) drawPixelGlyph(ink, index, index * 6, 0);
        atlases.set(color, atlas);
      }
      context.imageSmoothingEnabled = false;
      for (let index = 0; index < count; index++) {
        context.drawImage(atlas, randomPixelGlyph(random) * 6, 0, 5, 7, x + index * 6 * scale, y, 5 * scale, 7 * scale);
      }
    },
    dispose() {
      for (const atlas of atlases.values()) atlas.width = atlas.height = 1;
      atlases.clear();
    },
  };
}
