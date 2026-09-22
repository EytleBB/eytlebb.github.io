/* Public exhibition labels. Shared data is always read from the museum service. */
const API = '/api/museum/v1';
const COPY = {
  zh: {
    close:'关闭', untitled:'NULL', inventory:'编号', namesTab:'取名', commentsTab:'评论',
    commentsRule:'评论公开显示，请勿填写私人信息。',
    namePlaceholder:'输入名字', commentPlaceholder:'输入评论', nameLabel:'名字', commentLabel:'评论',
    nameSubmit:'提交名字', commentSubmit:'提交评论', moreNames:'更多名字', moreComments:'更多评论', anonymous:'访客',
    winner:'当前名称', yourVote:'已点赞', vote:'点赞', undoVote:'取消点赞', loading:'加载中…', refreshing:'刷新中…',
    emptyNames:'暂无名字', emptyComments:'暂无评论',
    retry:'重试', offline:'连接失败，无法读取或提交。', readOnly:'暂时只能查看，无法提交。', loadingMore:'加载中…', loadFailed:'加载失败，请重试。',
    checking:'验证中…', saving:'保存中…', savedName:'名字已提交。', savedComment:'评论已提交。',
    savedRefresh:'已保存，刷新失败，请重试。', uncertain:'无法确认是否保存成功。请先刷新查看，再决定是否重试。', savedVote:'点赞已更新。', invalid:'请输入内容，勿超过字数限制。',
    genericError:'操作失败，输入已保留。', tooFast:'操作频繁，请稍后重试。',
    challengeFailed:'验证失败，请重试。', expired:'验证已过期，请重试。', sessionExpired:'连接已过期，请重试。',
    duplicate:'名字已存在。', duplicateComment:'评论已存在。', limit:'已达提交上限。',
    absent:'未找到画作。', nameGone:'名字已移除，请刷新。', proofUnavailable:'浏览器不支持验证，暂时只能查看。',
    nameCount:n=>`${n} 个名字`, commentCount:n=>`${n} 条评论`, votes:n=>`${n} 票`, date:()=>'zh-CN', count:(n,max)=>`${n} / ${max}`,
  },
  en: {
    close:'Close', untitled:'NULL', inventory:'ID', namesTab:'Names', commentsTab:'Comments',
    commentsRule:'Comments are public. Do not include private information.',
    namePlaceholder:'Enter a name', commentPlaceholder:'Enter a comment', nameLabel:'Name', commentLabel:'Comment',
    nameSubmit:'Submit name', commentSubmit:'Submit comment', moreNames:'More names', moreComments:'More comments', anonymous:'Visitor',
    winner:'Current name', yourVote:'Liked', vote:'Like', undoVote:'Unlike', loading:'Loading…', refreshing:'Refreshing…',
    emptyNames:'No names yet', emptyComments:'No comments yet',
    retry:'Retry', offline:'Connection failed. Reading and submissions unavailable.', readOnly:'Read-only. Submissions unavailable.', loadingMore:'Loading…', loadFailed:'Loading failed. Please retry.',
    checking:'Verifying…', saving:'Saving…', savedName:'Name submitted.', savedComment:'Comment submitted.',
    savedRefresh:'Saved. Refresh failed; please retry.', uncertain:'Save status unknown. Refresh and check before resubmitting.', savedVote:'Vote updated.', invalid:'Enter text within the character limit.',
    genericError:'Request failed. Your input was kept.', tooFast:'Too many requests. Try again later.',
    challengeFailed:'Verification failed. Please retry.', expired:'Verification expired. Please retry.', sessionExpired:'Session expired. Please reconnect.',
    duplicate:'Name already exists.', duplicateComment:'Comment already exists.', limit:'Submission limit reached.',
    absent:'Artwork not found.', nameGone:'Name removed. Please refresh.', proofUnavailable:'Verification unsupported. Read-only.',
    nameCount:n=>`${n} ${n===1?'name':'names'}`, commentCount:n=>`${n} ${n===1?'comment':'comments'}`, votes:n=>`${n} ${n===1?'vote':'votes'}`, date:()=>'en-GB', count:(n,max)=>`${n} / ${max}`,
  },
  ko: {
    close:'닫기', untitled:'NULL', inventory:'번호', namesTab:'이름', commentsTab:'댓글',
    commentsRule:'댓글은 공개됩니다. 개인 정보를 입력하지 마세요.',
    namePlaceholder:'이름 입력', commentPlaceholder:'댓글 입력', nameLabel:'이름', commentLabel:'댓글',
    nameSubmit:'이름 제출', commentSubmit:'댓글 제출', moreNames:'이름 더 보기', moreComments:'댓글 더 보기', anonymous:'방문자',
    winner:'현재 이름', yourVote:'좋아요 선택됨', vote:'좋아요', undoVote:'좋아요 취소', loading:'불러오는 중…', refreshing:'새로 고치는 중…',
    emptyNames:'이름 없음', emptyComments:'댓글 없음',
    retry:'다시 시도', offline:'연결 실패. 읽기와 제출이 불가능합니다.', readOnly:'읽기만 가능합니다. 제출할 수 없습니다.', loadingMore:'불러오는 중…', loadFailed:'불러오기 실패. 다시 시도하세요.',
    checking:'확인 중…', saving:'저장 중…', savedName:'이름이 제출되었습니다.', savedComment:'댓글이 제출되었습니다.',
    savedRefresh:'저장됨. 새로 고침에 실패했습니다.', uncertain:'저장 여부를 확인할 수 없습니다. 새로 고친 뒤 다시 제출하세요.', savedVote:'투표가 반영되었습니다.', invalid:'글자 수 제한 안에서 내용을 입력하세요.',
    genericError:'처리 실패. 입력은 유지됩니다.', tooFast:'요청이 많습니다. 잠시 후 다시 시도하세요.',
    challengeFailed:'확인 실패. 다시 시도하세요.', expired:'확인이 만료되었습니다. 다시 시도하세요.', sessionExpired:'연결이 만료되었습니다. 다시 연결하세요.',
    duplicate:'이미 있는 이름입니다.', duplicateComment:'이미 있는 댓글입니다.', limit:'제출 한도에 도달했습니다.',
    absent:'작품을 찾을 수 없습니다.', nameGone:'삭제된 이름입니다. 새로 고치세요.', proofUnavailable:'확인을 지원하지 않는 브라우저입니다. 읽기만 가능합니다.',
    nameCount:n=>`이름 ${n}개`, commentCount:n=>`댓글 ${n}개`, votes:n=>`${n}표`, date:()=>'ko-KR', count:(n,max)=>`${n} / ${max}`,
  },
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(className, text, action) {
  const node = element('button', className, text);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}
const textLength = text => Array.from(text).length;
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0,Math.trunc(Number(value))) : 0;

export function createMuseumGuestbook({ lang='zh', onClose=()=>{}, onTitleChange=()=>{} } = {}) {
  const dialog = element('dialog','museum-guestbook');
  dialog.setAttribute('aria-labelledby','museum-guestbook-heading');
  const sheet = element('div','guestbook-sheet');
  dialog.append(sheet);
  document.body.append(dialog);
  const requests = new Set();
  let worker = null;
  let cancelProof = null;
  let generation = 0;
  let session = null;
  let previousFocus = null;
  let state = null;
  let refs = null;
  let copy = COPY.zh;
  const alive = token => !!state && dialog.open && token === generation;

  async function request(path, { method='GET', body, signal } = {}) {
    const controller = new AbortController();
    requests.add(controller);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort',onAbort,{once:true});
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const headers = { Accept:'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (method !== 'GET' && session?.csrf) headers['X-CSRF-Token'] = session.csrf;
      const response = await fetch(`${API}${path}`, {
        method, headers, credentials:'same-origin', cache:'no-store',
        signal:controller.signal, ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) throw Object.assign(new Error('Unavailable'),{code:'unavailable'});
      const result = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error('Museum request failed'),{
          code:result?.error?.code || 'unavailable', status:response.status,
          retryAfter:result?.error?.retryAfter || response.headers.get('retry-after'),
        });
      }
      return result;
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
      if (signal) signal.removeEventListener('abort',onAbort);
    }
  }

  function errorText(error,kind) {
    if (error?.code==='duplicate' && kind==='comments') return copy.duplicateComment;
    const codes = {
      rate_limited:'tooFast', service_busy:'tooFast', limit_reached:'limit', duplicate:'duplicate',
      proof_invalid:'challengeFailed', proof_expired:'expired', invalid_challenge:'challengeFailed', expired:'expired',
      csrf_invalid:'sessionExpired', session_required:'sessionExpired', origin_forbidden:'sessionExpired',
      invalid_text:'invalid', artwork_not_found:'absent', name_not_found:'nameGone', proof_unavailable:'proofUnavailable',
    };
    return copy[codes[error?.code] || (error?.status===429?'tooFast':'genericError')];
  }

  function announce(text='', kind='') {
    if (!refs) return;
    refs.status.textContent = text;
    refs.status.dataset.kind = kind;
  }

  function build() {
    sheet.replaceChildren();
    const cover = element('aside','guestbook-cover');
    const close = button('guestbook-close','×',userClose);
    close.setAttribute('aria-label',copy.close);
    const number = element('p','guestbook-inventory',`${copy.inventory} / ${state.id}`);
    const imageFrame = element('div','guestbook-art-frame');
    const image = element('img','guestbook-art');
    image.alt = '';
    // This URL comes from the gallery index, never from submitted visitor text.
    if (state.imageUrl) image.src = state.imageUrl;
    image.addEventListener('error',() => { imageFrame.hidden = true; });
    imageFrame.append(image);
    const title = element('h2','guestbook-art-title',copy.untitled);
    title.id = 'museum-guestbook-heading';
    const counts = element('p','guestbook-counts');
    cover.append(number,imageFrame,title,counts);
    const content = element('section','guestbook-content');
    const tabs = element('div','guestbook-tabs');
    tabs.setAttribute('role','tablist');
    const nameTab = button('guestbook-tab',copy.namesTab,() => selectTab('names'));
    const commentTab = button('guestbook-tab',copy.commentsTab,() => selectTab('comments'));
    [nameTab,commentTab].forEach((tab,index) => {
      const kind = index===0?'names':'comments';
      tab.id = `museum-guestbook-tab-${kind}`;
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-controls',`museum-guestbook-panel-${kind}`);
      tab.addEventListener('keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key==='Home'?'names':event.key==='End'?'comments':kind==='names'?'comments':'names';
        selectTab(target);
        (target==='names'?nameTab:commentTab).focus();
      });
    });
    tabs.append(nameTab,commentTab);
    const connection = element('div','guestbook-connection');
    connection.hidden = true;
    const connectionText = element('p');
    const reconnect = button('guestbook-retry',copy.retry,() => load());
    connection.append(connectionText,reconnect);
    const panels = {};
    for (const kind of ['names','comments']) {
      const isName = kind==='names';
      const panel = element('section','guestbook-panel');
      panel.id = `museum-guestbook-panel-${kind}`;
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-labelledby',`museum-guestbook-tab-${kind}`);
      if (!isName) panel.append(element('p','guestbook-rule',copy.commentsRule));
      const list = element('ol',`guestbook-entries guestbook-${kind}`);
      list.setAttribute('aria-label',isName?copy.namesTab:copy.commentsTab);
      list.tabIndex = 0;
      const listState = element('p','guestbook-list-state',copy.loading);
      const more = button('guestbook-more',isName?copy.moreNames:copy.moreComments,() => loadMore(kind));
      more.hidden = true;
      const form = element('form','guestbook-form');
      const label = element('label','guestbook-sr',isName?copy.nameLabel:copy.commentLabel);
      label.htmlFor = `museum-guestbook-input-${kind}`;
      const input = element(isName?'input':'textarea','guestbook-input');
      input.id = label.htmlFor;
      if (isName) input.type = 'text';
      else input.rows = 3;
      input.placeholder = isName?copy.namePlaceholder:copy.commentPlaceholder;
      input.autocomplete = 'off';
      input.name = isName?'title':'comment';
      input.maxLength = (isName?40:280)*2;
      input.required = true;
      input.setAttribute('aria-describedby',`museum-guestbook-counter-${kind}`);
      const trapWrap = element('div','guestbook-honeypot');
      trapWrap.setAttribute('aria-hidden','true');
      const trap = element('input');
      trap.type = 'text'; trap.name = 'website'; trap.tabIndex = -1; trap.autocomplete = 'off';
      trap.setAttribute('aria-label','Website');
      trapWrap.append(trap);
      const formFoot = element('div','guestbook-form-foot');
      const counter = element('span','guestbook-counter',copy.count(0,isName?40:280));
      counter.id = `museum-guestbook-counter-${kind}`;
      const submit = button('guestbook-submit',isName?copy.nameSubmit:copy.commentSubmit);
      submit.type = 'submit';
      formFoot.append(counter,submit);
      form.append(label,input,trapWrap,formFoot);
      form.addEventListener('submit',event => {
        event.preventDefault();
        write(kind,{text:input.value.trim(),website:trap.value});
      });
      input.addEventListener('input',updateEnabled);
      panel.append(list,listState,more,form);
      panels[kind] = {panel,list,listState,more,form,input,counter,submit};
    }
    const status = element('p','guestbook-status');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.setAttribute('aria-atomic','true');
    content.append(tabs,connection,panels.names.panel,panels.comments.panel,status);
    sheet.append(cover,content,close);
    refs = {title,counts,nameTab,commentTab,connection,connectionText,reconnect,status,close,...panels};
    selectTab('names');
    updateEnabled();
  }

  function selectTab(kind) {
    if (!refs || !state) return;
    state.tab = kind;
    for (const name of ['names','comments']) {
      const tab = name==='names'?refs.nameTab:refs.commentTab;
      tab.setAttribute('aria-selected',String(name===kind));
      tab.tabIndex = name===kind?0:-1;
      refs[name].panel.hidden = name!==kind;
    }
    announce('');
  }

  function updateSummary(summary) {
    if (!summary || !state) return;
    state.summary = summary;
    const hasTitle = typeof summary.title==='string' && summary.title.trim().length>0;
    refs.title.textContent = hasTitle?summary.title:copy.untitled;
    refs.counts.textContent = `${copy.nameCount(nonnegative(summary.namesCount))}  /  ${copy.commentCount(nonnegative(summary.commentsCount))}`;
    try { onTitleChange(summary); } catch (error) { console.error('Museum label callback failed',error); }
  }

  function displayConnection(text='') {
    refs.connection.hidden = !text;
    refs.connectionText.textContent = text;
  }

  function updateEnabled() {
    if (!refs || !state) return;
    const waiting = state.busy || state.loading || state.namesLoading || state.commentsLoading;
    for (const kind of ['names','comments']) {
      const form = refs[kind];
      const max = kind==='names'?40:280;
      const length = textLength(form.input.value);
      form.counter.textContent = copy.count(length,max);
      form.counter.dataset.over = String(length>max);
      form.input.setAttribute('aria-invalid',String(length>max));
      form.input.disabled = state.busy;
      form.submit.disabled = waiting || !state.canWrite || !form.input.value.trim() || length>max;
      form.more.disabled = waiting;
    }
    refs.reconnect.disabled = waiting;
    refs.names.list.querySelectorAll('button').forEach(node => { node.disabled = waiting || !state.canWrite; });
    dialog.setAttribute('aria-busy',String(!!state.loading));
  }

  function renderList(kind) {
    const target = refs[kind];
    const entries = state[kind];
    const focusedVote = document.activeElement?.dataset?.nameId;
    target.list.replaceChildren();
    entries.forEach((entry,index) => {
      const row = element('li','guestbook-entry');
      if (kind==='names') {
        const body = element('div','guestbook-name-copy');
        const number = element('span','guestbook-name-number',String(index+1).padStart(2,'0'));
        const text = element('p','guestbook-name-text',entry.text);
        body.append(number,text);
        if (entry.text===state.summary?.title) body.append(element('span','guestbook-winning',copy.winner));
        const vote = button('guestbook-vote','',() => write('votes',{nameId:entry.id,website:''}));
        const icon = element('span','guestbook-vote-icon',entry.voted?'♥':'♡');
        icon.setAttribute('aria-hidden','true');
        vote.append(icon,element('span','guestbook-vote-count',String(nonnegative(entry.votes))));
        vote.dataset.nameId = String(entry.id);
        vote.setAttribute('aria-pressed',String(!!entry.voted));
        vote.setAttribute('aria-label',`${entry.voted?copy.undoVote:copy.vote}: ${entry.text} · ${copy.votes(nonnegative(entry.votes))}`);
        vote.title = entry.voted?copy.yourVote:copy.vote;
        row.append(body,vote);
      } else {
        const byline = element('div','guestbook-note-byline');
        byline.append(element('span','',copy.anonymous));
        const date = new Date(entry.createdAt);
        if (Number.isFinite(date.getTime())) {
          const time = element('time','',new Intl.DateTimeFormat(copy.date(),{month:'short',day:'numeric',year:'numeric'}).format(date));
          time.dateTime = date.toISOString();
          byline.append(time);
        }
        row.append(byline,element('p','guestbook-note-text',entry.text));
      }
      target.list.append(row);
    });
    target.listState.replaceChildren();
    if (!entries.length) {
      const empty = kind==='names'?copy.emptyNames:copy.emptyComments;
      target.listState.append(element('span','guestbook-empty-title',empty));
    }
    target.listState.hidden = entries.length>0;
    target.more.hidden = state[kind==='names'?'nextNamesOffset':'nextCommentsOffset'] === null;
    target.more.textContent = kind==='names'?copy.moreNames:copy.moreComments;
    updateEnabled();
    if (focusedVote) {
      const candidate = Array.from(target.list.querySelectorAll('button')).find(node => node.dataset.nameId===focusedVote);
      if (candidate) candidate.focus({preventScroll:true});
    }
  }

  async function fetchDetail(token) {
    const result = await request(`/artworks/${encodeURIComponent(state.id)}?namesOffset=0&commentsOffset=0`);
    if (!alive(token)) return false;
    state.names = Array.isArray(result.names)?result.names:[];
    state.comments = Array.isArray(result.comments)?result.comments:[];
    state.nextNamesOffset = Number.isInteger(result.nextNamesOffset)?result.nextNamesOffset:null;
    state.nextCommentsOffset = Number.isInteger(result.nextCommentsOffset)?result.nextCommentsOffset:null;
    state.loaded = true;
    updateSummary(result.artwork);
    renderList('names'); renderList('comments');
    return true;
  }

  async function load() {
    if (!state || state.loading || state.busy) return;
    const token = generation;
    state.loading = true;
    state.canWrite = false;
    displayConnection('');
    if (!state.loaded) {
      refs.names.listState.textContent = copy.loading;
      refs.comments.listState.textContent = copy.loading;
    }
    announce(state.loaded?copy.refreshing:'');
    updateEnabled();
    let connected = false;
    try {
      // Establish the HttpOnly visitor cookie before requesting voted flags.
      try {
        const nextSession = await request('/session');
        if (!alive(token)) return;
        session = nextSession;
        connected = typeof session.csrf==='string' && session.csrf.length>0;
      } catch (error) {
        if (!alive(token)) return;
        session = null;
      }
      await fetchDetail(token);
      if (!alive(token)) return;
      state.canWrite = connected && typeof Worker!=='undefined';
      displayConnection(!connected?copy.readOnly:typeof Worker==='undefined'?copy.proofUnavailable:'');
      announce('');
    } catch (error) {
      if (!alive(token)) return;
      displayConnection(error.code==='artwork_not_found'?copy.absent:copy.offline);
      if (!state.loaded) {
        refs.names.listState.textContent = copy.loadFailed;
        refs.comments.listState.textContent = copy.loadFailed;
      }
      announce('');
    } finally {
      if (alive(token)) { state.loading=false; updateEnabled(); }
    }
  }

  async function loadMore(kind) {
    const key = kind==='names'?'nextNamesOffset':'nextCommentsOffset';
    if (!state || state.busy || state.loading || state[`${kind}Loading`] || state[key]===null) return;
    const token = generation;
    state[`${kind}Loading`] = true;
    refs[kind].more.textContent = copy.loadingMore;
    updateEnabled();
    try {
      const offset = state[key];
      const query = `namesOffset=${kind==='names'?offset:0}&commentsOffset=${kind==='comments'?offset:0}`;
      const result = await request(`/artworks/${encodeURIComponent(state.id)}?${query}`);
      if (!alive(token)) return;
      const known = new Set(state[kind].map(entry => entry.id));
      state[kind].push(...(Array.isArray(result[kind])?result[kind]:[]).filter(entry => !known.has(entry.id)));
      state[key] = Number.isInteger(result[key])?result[key]:null;
      updateSummary(result.artwork);
      renderList(kind);
      announce('');
    } catch (error) {
      if (alive(token)) announce(copy.loadFailed,'error');
    } finally {
      if (alive(token)) {
        state[`${kind}Loading`] = false;
        refs[kind].more.textContent = kind==='names'?copy.moreNames:copy.moreComments;
        updateEnabled();
      }
    }
  }

  function solve(challenge) {
    return new Promise((resolve,reject) => {
      let settled = false;
      let timer;
      function finish(error,nonce) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker?.terminate(); worker=null; cancelProof=null;
        if (error) reject(error); else resolve({id:challenge.id,nonce});
      }
      cancelProof = () => finish(new DOMException('Closed','AbortError'));
      try {
        const proofUrl = new URL('./museum-guestbook-proof.js',import.meta.url);
        proofUrl.search = new URL(import.meta.url).search;
        worker = new Worker(proofUrl);
        worker.onmessage = event => {
          if (typeof event.data?.nonce==='string') finish(null,event.data.nonce);
          else finish(Object.assign(new Error('Proof failed'),{code:event.data?.error || 'proof_invalid'}));
        };
        worker.onerror = () => finish(Object.assign(new Error('Worker unavailable'),{code:'proof_unavailable'}));
        timer = setTimeout(() => finish(Object.assign(new Error('Proof expired'),{code:'expired'})),60000);
        worker.postMessage(challenge);
      } catch (error) {
        finish(Object.assign(new Error('Worker unavailable'),{code:'proof_unavailable'}));
      }
    });
  }

  async function write(kind,payload) {
    if (!state || state.busy || state.loading || state.namesLoading || state.commentsLoading || !state.canWrite) return;
    if (kind!=='votes' && (!payload.text || textLength(payload.text)>(kind==='names'?40:280))) {
      announce(copy.invalid,'error'); return;
    }
    const token = generation;
    state.busy = true;
    updateEnabled();
    announce(copy.checking,'pending');
    let saveStarted = false;
    try {
      const challenge = await request('/challenge',{method:'POST',body:{}});
      if (!alive(token)) return;
      const proof = await solve(challenge);
      if (!alive(token)) return;
      announce(copy.saving,'pending');
      saveStarted = true;
      await request(`/artworks/${encodeURIComponent(state.id)}/${kind}`,{method:'POST',body:{...payload,proof}});
      if (!alive(token)) return;
      if (kind!=='votes') refs[kind].input.value = '';
      try {
        await fetchDetail(token);
        if (!alive(token)) return;
        announce(kind==='names'?copy.savedName:kind==='comments'?copy.savedComment:copy.savedVote,'success');
      } catch (error) {
        if (!alive(token)) return;
        announce(copy.savedRefresh,'success');
        displayConnection(copy.savedRefresh);
      }
    } catch (error) {
      if (!alive(token)) return;
      if (['csrf_invalid','session_required','origin_forbidden'].includes(error.code)) {
        state.canWrite = false; session = null; displayConnection(copy.sessionExpired);
      }
      if (error.code==='proof_unavailable') { state.canWrite=false; displayConnection(copy.proofUnavailable); }
      if (saveStarted && !error.status) {
        state.canWrite = false;
        displayConnection(copy.uncertain);
        announce(copy.uncertain,'error');
      } else announce(errorText(error,kind),'error');
    } finally {
      if (alive(token)) { state.busy=false; updateEnabled(); }
    }
  }

  function close() {
    generation++;
    for (const controller of requests) controller.abort();
    requests.clear();
    cancelProof?.();
    worker?.terminate(); worker=null;
    if (dialog.open) dialog.close();
    state=null;
    if (previousFocus?.isConnected && typeof previousFocus.focus==='function') previousFocus.focus({preventScroll:true});
  }
  function userClose() {
    if (!dialog.open) return;
    close();
    onClose();
  }
  dialog.addEventListener('cancel',event => { event.preventDefault(); userClose(); });
  dialog.addEventListener('click',event => {
    event.stopPropagation();
    if (event.target!==dialog) return;
    const bounds = sheet.getBoundingClientRect();
    if (event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom) userClose();
  });
  dialog.addEventListener('keydown',event => {
    event.stopPropagation();
    if (event.key==='Escape') { event.preventDefault(); userClose(); return; }
    if (event.key!=='Tab') return;
    const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]'))
      .filter(node => node.tabIndex>=0 && node.getClientRects().length>0);
    if (!focusable.length) { event.preventDefault(); return; }
    const first=focusable[0],last=focusable[focusable.length-1];
    if (event.shiftKey && (document.activeElement===first || document.activeElement===dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
  });
  // Do not let typing/mouse interactions enter the scene's document handlers.
  for (const type of ['keyup','keypress','mousedown','mouseup','pointerdown','pointerup','wheel']) {
    dialog.addEventListener(type,event => event.stopPropagation());
  }

  return {
    open({id,imageUrl=''}) {
      if (typeof id!=='string' || !id) return;
      if (dialog.open) close();
      generation++;
      previousFocus = document.activeElement;
      const language = typeof lang==='function'?lang():lang;
      copy = COPY[language] || COPY.zh;
      dialog.lang = Object.hasOwn(COPY,language)?language:'zh';
      state = {id,imageUrl,tab:'names',names:[],comments:[],summary:null,nextNamesOffset:null,nextCommentsOffset:null,
        busy:false,loading:false,namesLoading:false,commentsLoading:false,loaded:false,canWrite:false};
      build();
      dialog.showModal();
      refs.close.focus({preventScroll:true});
      load();
    },
    close,
    isOpen:() => dialog.open,
    async refreshTitles(ids) {
      const unique = [...new Set(ids.filter(id => typeof id==='string' && id))];
      const summaries = [];
      for (let i=0; i<unique.length; i+=40) {
        const query = unique.slice(i,i+40).map(id => encodeURIComponent(id)).join(',');
        const result = await request(`/artworks?ids=${query}`);
        if (Array.isArray(result.artworks)) summaries.push(...result.artworks);
      }
      return summaries;
    },
  };
}
