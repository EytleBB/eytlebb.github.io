// Request within the visitor's click gesture; a refusal must never block entry.
export function createMuseumFullscreen({ document, T, onChange = () => {} }) {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const enabled = () => root.requestFullscreen ? document.fullscreenEnabled : document.webkitFullscreenEnabled;
  let pending = false;
  let message = '';
  const active = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  function state() {
    return {
      active: active(), pending, message,
      label: active() ? T('退出全屏', 'Exit fullscreen', '전체 화면 종료') : T('全屏', 'Fullscreen', '전체 화면'),
    };
  }
  function notify() { onChange(state()); }
  function changed() { message = ''; notify(); }
  function failed() {
    message = T('未能切换全屏，请点全屏按钮重试。',
      'Fullscreen could not switch. Tap the fullscreen button to retry.',
      '전체 화면을 전환하지 못했습니다. 전체 화면 버튼을 눌러 다시 시도하세요.');
    pending = false;
    notify();
  }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('webkitfullscreenchange', changed);
  document.addEventListener('fullscreenerror', failed);
  document.addEventListener('webkitfullscreenerror', failed);

  async function change(enter) {
    if (pending || enter === active()) return;
    const method = enter ? request : exit;
    if (!method || (enter && enabled() === false)) {
      message = T('此浏览器不支持网页全屏，仍可继续参观。',
        'This browser does not support page fullscreen. You can keep visiting.',
        '이 브라우저는 웹 페이지 전체 화면을 지원하지 않습니다. 관람은 계속할 수 있습니다.');
      notify();
      return;
    }
    pending = true;
    message = '';
    notify();
    try {
      // Prefix implementations may return void instead of a Promise.
      if (enter) await (root.requestFullscreen ? method.call(root, { navigationUI: 'hide' }) : method.call(root));
      else await method.call(document);
    } catch {
      failed();
    } finally {
      if (pending) { pending = false; notify(); }
    }
  }
  return { state, enter: () => change(true), toggle: () => change(!active()) };
}
