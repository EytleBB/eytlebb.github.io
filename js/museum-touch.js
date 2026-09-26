// Pointer Events keep the two thumbs independent, including cancelled gestures.
// Fit portrait views without passing through the opposite wall of the 6 m hall.
export function museumFocusDistance(size = {}, aspect = 1, fov = 74) {
  const halfHeight = Math.tan(fov * Math.PI / 360);
  const fit = Math.max((size.width || 0) / Math.max(aspect, 0.3), size.height || 0) / (2 * halfHeight);
  return Math.max(1.7, Math.min(5, fit * 1.12));
}

export function createMuseumTouchControls({ canvas, T, onMove, onLook, onJump, onCrouch, onZoom, onInspect, onPause, onFullscreen }) {
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.hidden = true;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', T('触屏操作', 'Touch controls', '터치 조작'));
  root.innerHTML = `
    <div class="touch-top-actions">
      <button type="button" class="touch-button" data-touch="fullscreen" aria-pressed="false">${T('全屏', 'Fullscreen', '전체 화면')}</button>
      <button type="button" class="touch-button" data-touch="pause">${T('暂停', 'Pause', '일시정지')}</button>
    </div>
    <p class="touch-fullscreen-status" data-touch="fullscreen-status" role="status" aria-live="polite" hidden></p>
    <div class="touch-movement">
      <span class="touch-caption">${T('移动', 'Move', '이동')}</span>
      <div class="touch-stick" data-touch="stick" role="group" aria-label="${T('拖动摇杆移动', 'Drag the joystick to move', '조이스틱을 드래그하여 이동')}">
        <span class="touch-stick-axis" aria-hidden="true"></span><span class="touch-stick-thumb" aria-hidden="true"></span>
      </div>
    </div>
    <span class="touch-look-hint">${T('滑动画面调整视角', 'Drag the view to look around', '화면을 드래그하여 둘러보기')}</span>
    <div class="touch-actions">
      <button type="button" class="touch-button" data-touch="crouch" aria-pressed="false">${T('蹲下', 'Crouch', '앉기')}</button>
      <button type="button" class="touch-button" data-touch="jump">${T('跳跃', 'Jump', '점프')}</button>
      <button type="button" class="touch-button" data-touch="zoom">${T('放大', 'Zoom', '확대')}</button>
      <button type="button" class="touch-button touch-inspect" data-touch="inspect" disabled>${T('查看', 'View', '보기')}</button>
    </div>`;
  document.body.append(root);
  const button = name => root.querySelector(`[data-touch="${name}"]`);
  const stick = button('stick');
  const thumb = root.querySelector('.touch-stick-thumb');
  const inspect = button('inspect');
  const crouch = button('crouch');
  button('zoom').setAttribute('aria-label', T('按住放大', 'Hold to zoom', '길게 눌러 확대'));
  button('zoom').title = T('按住放大', 'Hold to zoom', '길게 눌러 확대');
  let active = false, focused = false, crouched = false;
  let movePointer = null, lookPointer = null, lookX = 0, lookY = 0;
  const heldButtons = new Map();
  const canRoam = () => active && !focused;
  const capture = (element, event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
  };
  const release = (element, id) => {
    if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  function stopMove() {
    const id = movePointer;
    movePointer = null;
    onMove(0, 0);
    thumb.style.transform = '';
    release(stick, id);
  }
  function stopLook() {
    const id = lookPointer;
    lookPointer = null;
    release(canvas, id);
  }
  function move(event) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y);
    const bound = Math.max(1, length);
    thumb.style.transform = `translate(${x / bound * radius}px, ${y / bound * radius}px)`;
    const amount = Math.max(0, (Math.min(length, 1) - 0.14) / 0.86);
    onMove(length ? x / length * amount : 0, length ? -y / length * amount : 0);
  }
  stick.addEventListener('pointerdown', event => {
    if (!canRoam() || movePointer !== null || event.button !== 0) return;
    movePointer = event.pointerId;
    capture(stick, event);
    move(event);
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === movePointer && canRoam()) { event.preventDefault(); move(event); }
  });
  canvas.addEventListener('pointerdown', event => {
    if (!canRoam() || lookPointer !== null || event.button !== 0) return;
    lookPointer = event.pointerId;
    lookX = event.clientX; lookY = event.clientY;
    capture(canvas, event);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== lookPointer || !canRoam()) return;
    event.preventDefault();
    onLook(event.clientX - lookX, event.clientY - lookY);
    lookX = event.clientX; lookY = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, event => { if (event.pointerId === movePointer) stopMove(); });
    canvas.addEventListener(type, event => { if (event.pointerId === lookPointer) stopLook(); });
  }
  function hold(name, change) {
    const element = button(name);
    element.addEventListener('pointerdown', event => {
      if (!canRoam() || event.button !== 0 || heldButtons.has(name)) return;
      heldButtons.set(name, { element, id: event.pointerId, change });
      capture(element, event);
      element.classList.add('held');
      change(true);
    });
    const end = event => {
      const held = heldButtons.get(name);
      if (!held || held.id !== event.pointerId) return;
      heldButtons.delete(name);
      element.classList.remove('held');
      change(false);
      release(element, held.id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, end);
    // Keep the labelled native buttons usable with a keyboard/switch device too.
    element.addEventListener('keydown', event => {
      if (!canRoam() || !['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      if (!event.repeat) change(true);
    });
    element.addEventListener('keyup', event => {
      if (['Space', 'Enter'].includes(event.code)) { event.preventDefault(); change(false); }
    });
    element.addEventListener('blur', () => change(false));
  }
  hold('jump', onJump);
  hold('zoom', onZoom);
  crouch.addEventListener('click', () => {
    if (!canRoam()) return;
    crouched = !crouched;
    crouch.setAttribute('aria-pressed', String(crouched));
    onCrouch(crouched);
  });
  inspect.addEventListener('click', () => { if (active) onInspect(); });
  button('pause').addEventListener('click', () => { if (active) onPause(); });
  button('fullscreen').addEventListener('click', () => { if (active) onFullscreen(); });

  function reset() {
    stopMove(); stopLook();
    const held = [...heldButtons.values()];
    heldButtons.clear();
    for (const { element, id, change } of held) {
      element.classList.remove('held'); change(false); release(element, id);
    }
    onJump(false); onZoom(false); onCrouch(false);
    crouched = false;
    crouch.setAttribute('aria-pressed', 'false');
  }
  return {
    reset,
    setFullscreen({ active: fullscreen, pending, message, label }) {
      const control = button('fullscreen');
      control.textContent = label;
      control.disabled = pending;
      control.setAttribute('aria-pressed', String(fullscreen));
      const status = button('fullscreen-status');
      status.textContent = message;
      status.hidden = !message;
    },
    update({ playing, focus = false, canInspect = false, plaque = false }) {
      const nextActive = playing && !plaque;
      if (active !== nextActive || focused !== focus) reset();
      active = nextActive; focused = focus;
      root.hidden = !active;
      root.inert = !active;
      root.classList.toggle('touch-focused', focus);
      inspect.disabled = !focus && !canInspect;
      const caption = focus ? T('返回', 'Back', '돌아가기') : T('查看', 'View', '보기');
      if (inspect.textContent !== caption) inspect.textContent = caption;
    },
  };
}
