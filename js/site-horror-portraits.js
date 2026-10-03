// Shared original pixel portraits. Importing this module allocates no DOM or canvases.
export function createHorrorPortraits(document, painter) {
  const portraits = Array.from({ length: 3 }, (_, identity) => {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 256;
    return { canvas, ink: canvas.getContext('2d', { alpha: false }), identity, pose: '' };
  });
  let disposed = false;

  function drawFace(portrait, seconds, still) {
    const { ink, identity } = portrait;
    if (!ink) return;
    const gaze = still ? 0 : Math.round(Math.sin(seconds * 0.27 + identity * 1.8) * 2);
    const jaw = identity === 1 && !still ? Math.round((Math.sin(seconds * 0.34) + 1) * 2) : 2;
    const blink = !still && (seconds + identity * 4) % 14 > 13.8;
    const pose = `${gaze}:${jaw}:${blink}`;
    if (portrait.pose === pose) return;
    portrait.pose = pose;
    // Each portrait keeps its own grain and scars; movement changes the gaze,
    // not the entire identity. A seeded glyph field also stays still at 2 Hz.
    let seed = 491 + identity * 701;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ink.fillStyle = '#090207';
    ink.fillRect(0, 0, 192, 256);
    ink.fillStyle = '#271019';
    for (let row = 0; row < 13; row++) painter.line(ink, 28, 9, 8 + row * 19, 1, random);
    ink.fillStyle = ['#81494e', '#85464b', '#765052'][identity];
    ink.beginPath();
    ink.moveTo(70, 30); ink.lineTo(122, 25); ink.lineTo(146, 63);
    ink.lineTo(139, 152); ink.lineTo(118, 211 + jaw); ink.lineTo(87, 231);
    ink.lineTo(57, 178); ink.lineTo(45, 79); ink.closePath(); ink.fill();
    ink.fillStyle = '#a16a66';
    ink.fillRect(62, 60, 9, 65); ink.fillRect(128, 62, 6, 69);
    ink.fillRect(75, 39, 36, 5); ink.fillRect(65, 141, 6, 29);
    ink.fillStyle = '#4a222e';
    ink.fillRect(51, 69, 10, 73); ink.fillRect(136, 83, 7, 61);
    ink.fillRect(72, 124, 7, 27); ink.fillRect(118, 116, 6, 32);
    ink.fillRect(85, 113, 6, 32); ink.fillRect(104, 118, 5, 30);
    ink.fillStyle = '#15030b';
    ink.fillRect(55, 83, 36, 29); ink.fillRect(104, 76, 34, 29);
    ink.fillRect(60, 77, 28, 8); ink.fillRect(113, 70, 26, 7);
    ink.fillRect(64, 111, 4, 44); ink.fillRect(78, 109, 3, 25);
    ink.fillRect(114, 105, 3, 43); ink.fillRect(128, 104, 4, 24);
    ink.fillRect(91, 136, 15, 8);
    if (!blink) {
      ink.fillStyle = '#ac7e78';
      ink.fillRect(63, 95, 19, 7); ink.fillRect(111, 88, 18, 7);
      ink.fillStyle = '#0a0207';
      ink.fillRect(69 + gaze, 93, 6, 12); ink.fillRect(117 + gaze, 86, 5, 11);
      ink.fillStyle = '#d6a49a';
      ink.fillRect(71 + gaze, 95, 1, 2); ink.fillRect(119 + gaze, 88, 1, 2);
    }
    ink.fillStyle = '#100209';
    if (identity === 1) {
      ink.beginPath();
      ink.moveTo(85, 142); ink.lineTo(111, 141); ink.lineTo(123, 173);
      ink.lineTo(110, 216 + jaw); ink.lineTo(88, 218 + jaw); ink.lineTo(77, 174);
      ink.closePath(); ink.fill();
      ink.fillStyle = '#74404b';
      ink.fillRect(89, 198 + jaw, 5, 15); ink.fillRect(99, 203 + jaw, 4, 10);
    } else if (identity === 2) {
      const mouthY = 157;
      ink.beginPath();
      ink.moveTo(68, mouthY - 12); ink.lineTo(91, mouthY + 1);
      ink.lineTo(113, mouthY - 1); ink.lineTo(129, mouthY - 17);
      ink.lineTo(120, mouthY + 18); ink.lineTo(87, mouthY + 22);
      ink.closePath(); ink.fill();
    } else {
      ink.fillRect(76, 167, 43, 4);
      for (let stitch = 0; stitch < 6; stitch++) ink.fillRect(80 + stitch * 7, 162 + stitch % 2, 2, 14);
    }
    ink.fillStyle = '#b38b80';
    for (let tooth = 0; identity !== 0 && tooth < 5; tooth++) {
      const x = 85 + tooth * 6;
      const y = identity === 1 ? 144 : 158;
      ink.fillRect(x, y + tooth % 2, 3, identity === 1 ? 8 + tooth % 3 : 4 + tooth % 3);
    }
    // Hairline cracks, torn cheek seams and a jaw disappearing into the dark.
    ink.fillStyle = '#2b0c17';
    for (let scar = 0; scar < 19; scar++) {
      const x = 58 + Math.floor(random() * 77), y = 40 + Math.floor(random() * 171);
      ink.fillRect(x, y, 1 + scar % 2, 3 + scar % 9);
    }
    ink.fillRect(54, 176, 14, 36); ink.fillRect(128, 161, 15, 59);
    ink.fillStyle = '#090207';
    for (let row = 0; row < 256; row += 4) ink.fillRect(0, row, 192, 1);
    ink.fillStyle = '#4f2635';
    painter.line(ink, 23, 26, 239, 1, random);
  }

  return {
    portraits,
    draw(seconds, still = false) {
      if (disposed) return;
      for (const portrait of portraits) drawFace(portrait, seconds, still);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const portrait of portraits) {
        portrait.canvas.width = portrait.canvas.height = 0;
        portrait.ink = null;
        portrait.pose = '';
      }
    },
  };
}
