// Scheduling only. Resolution, antialiasing, materials, lighting and reflection
// quality remain owned by the renderer and are never changed here.
const FRAME_RATES = [60, 90, 120];

export function createMuseumFrameScheduler({ fps = 60 } = {}) {
  let frameRate = FRAME_RATES.includes(fps) ? fps : 60;
  let nextFrameAt = null;
  let dirty = true;

  return {
    get fps() { return frameRate; },
    requestFrame() { dirty = true; },
    setFrameRate(value) {
      if (!FRAME_RATES.includes(value) || value === frameRate) return false;
      frameRate = value;
      nextFrameAt = null;
      dirty = true;
      return true;
    },
    shouldRender({ now, active = true, visible = true, force = false }) {
      if (!Number.isFinite(now)) return false;
      if (!visible) {
        // Resuming starts a fresh presentation interval, without catching up
        // frames missed while the browser tab was hidden.
        nextFrameAt = null;
        dirty = true;
        return false;
      }
      if (!active && !dirty && !force) return false;
      if (!dirty && !force && nextFrameAt !== null && now + 0.25 < nextFrameAt) return false;
      const interval = 1000 / frameRate;
      if (nextFrameAt === null || dirty || force || now - nextFrameAt > interval * 2) {
        nextFrameAt = now + interval;
      } else {
        // Preserve the cadence when requestAnimationFrame arrives just after a
        // deadline. Never build a queue of frames or render a catch-up burst.
        nextFrameAt += interval * Math.max(1, Math.floor((now - nextFrameAt) / interval) + 1);
      }
      dirty = false;
      return true;
    },
  };
}
