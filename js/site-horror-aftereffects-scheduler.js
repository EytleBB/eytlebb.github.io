// Event choice is independent of page state so an ordinary page can remain
// completely idle until its first quiet interval has elapsed.
const DURATIONS = Object.freeze({ glimpse: 1.05, reflection: 1.45, whisper: 1.2, step: .65, rush: 1.3 });

export function chooseAftereffect(random, { audioReady = false } = {}) {
  const roll = random();
  let kind;
  if (roll < .30) return null;
  if (roll < .60) kind = 'glimpse';
  else if (roll < .72) kind = 'reflection';
  else if (roll < .84) kind = 'whisper';
  else if (roll < .94) kind = 'step';
  else kind = 'rush';

  if (!audioReady) {
    if (kind === 'whisper' || kind === 'step') return null;
    if (kind === 'rush') kind = 'glimpse';
  }
  return { kind, identity: Math.min(2, Math.floor(random() * 3)),
    side: random() < .5 ? -1 : 1, duration: DURATIONS[kind] };
}

export function createAftereffectsScheduler({ random = Math.random, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, canRun, getAudioReady = () => false,
  onEvent, claimEvent = () => true, firstDelay = [30000, 90000], nextDelay = [60000, 240000],
  cooldown = 90000 } = {}) {
  if (typeof canRun !== 'function' || typeof onEvent !== 'function') {
    throw new TypeError('Aftereffects require canRun and onEvent callbacks.');
  }
  let timer = null, active = false, disposed = false, epoch = 0;
  let lastEventAt = -Infinity;
  const isCurrent = token => active && !disposed && token === epoch;

  function eligible() {
    try { return Boolean(canRun()); } catch { return false; }
  }

  function audioReady() {
    try { return Boolean(getAudioReady()); } catch { return false; }
  }

  function schedule(range, token) {
    if (!isCurrent(token)) return;
    const quiet = range[0] + (range[1] - range[0]) * random();
    const delay = Math.max(0, quiet, lastEventAt + cooldown - now());
    const id = setTimer(() => {
      // A timer already queued when pause cleared it must not erase a newer
      // timer or resume an old page session.
      if (!isCurrent(token) || timer !== id) return;
      timer = null;
      void attempt(token);
    }, delay);
    timer = id;
  }

  async function attempt(token) {
    if (!isCurrent(token)) return;
    if (!eligible()) { pause(); return; }
    try {
      const timestamp = now();
      if (timestamp < lastEventAt + cooldown) return;
      const event = chooseAftereffect(random, { audioReady: audioReady() });
      if (!event) return;
      // The page owner can claim a shared browser cooldown asynchronously.
      // Neither a late claim nor a lost claim may replay a paused incident.
      const claimed = await claimEvent(event, timestamp);
      if (!isCurrent(token)) return;
      if (!eligible()) { pause(); return; }
      if (!claimed) return;
      lastEventAt = now();
      await onEvent(event, lastEventAt);
    } catch {
      // Optional coordination or presentation failures keep the normal page
      // usable and consume this attempt rather than starting a retry loop.
    } finally {
      if (isCurrent(token)) {
        if (eligible()) schedule(nextDelay, token);
        else pause();
      }
    }
  }

  function resume() {
    if (disposed || active || !eligible()) return;
    active = true;
    schedule(firstDelay, ++epoch);
  }

  function pause() {
    active = false;
    epoch++;
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function dispose() {
    if (disposed) return;
    pause();
    disposed = true;
  }

  return { resume, pause, dispose, get running() { return active && !disposed; } };
}
