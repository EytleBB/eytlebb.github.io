/* Public exhibition labels. Shared data is always read from the museum service. */
const API = '/api/museum/v1';
const COPY = {
  zh: {
    eyebrow:'THE VISITORS’ LABEL', collection:'图画展览会 · 共同命名', close:'收起铭牌', untitled:'未定名',
    chosen:'由来访者共同选出的名字', unchosen:'一个名字，等待与你相遇。', inventory:'馆藏编号', namesTab:'为画取名', commentsTab:'访客留言',
    namesIntro:'你会如何称呼这幅画？', commentsIntro:'把此刻的感受留在这里。',
    namesRule:'每位访客每幅画可支持一个名字。再次点击可取消，票数最高的名字将显示在画作下方。',
    commentsRule:'留言公开展示。请留下与作品有关的感受，勿填写联系方式或其他私人信息。',
    namePlaceholder:'给这幅画起一个名字…', commentPlaceholder:'这幅画让你想到了什么？', nameLabel:'你为作品取的名字', commentLabel:'你的留言',
    nameSubmit:'提交名字', commentSubmit:'留下感受', moreNames:'展开更多名字', moreComments:'阅读更多留言', anonymous:'一位来访者',
    winner:'当前展签', yourVote:'已支持', vote:'支持这个名字', undoVote:'取消支持', loading:'正在读取铭牌…', refreshing:'正在刷新…',
    emptyNames:'还没有人给这幅画取名。', emptyNamesSub:'第一个名字，也许就来自你的目光。', emptyComments:'这里还没有留言。', emptyCommentsSub:'你可以留下第一段观展感受。',
    retry:'重新连接', offline:'铭牌暂时无法连接。名字与留言需要连接展馆服务后才能读取和保存。',
    readOnly:'现在可以阅读铭牌，暂时无法提交。请重新连接后再试。', loadingMore:'正在读取…', loadFailed:'这页暂时无法读取，请重试。',
    checking:'正在进行防滥用验证…', saving:'正在保存…', savedName:'名字已收录。你也可以支持自己喜欢的名字。', savedComment:'你的感受已留在这幅画旁。',
    savedRefresh:'已保存，暂时无法刷新铭牌。请重新连接。', uncertain:'尚无法确认是否保存成功。请先重新连接铭牌，查看内容是否已收录。', savedVote:'支持已更新。', invalid:'请填写内容，并保持在字数限制内。',
    genericError:'暂时无法完成，请稍后重试。输入的内容仍保留在这里。', tooFast:'操作稍频繁，请稍候再试。',
    challengeFailed:'验证未完成，请重试。', expired:'验证已过期，请重新提交。', sessionExpired:'连接已过期，请重新连接后再试。',
    duplicate:'这个名字已经有人提出了。可以在列表里支持它。', duplicateComment:'这段感受已收录，无需重复提交。', limit:'这幅作品的提交次数已达上限，请稍后再来。',
    absent:'暂时找不到这幅作品的铭牌。', nameGone:'这个名字已不可用，请刷新铭牌。',
    proofUnavailable:'当前浏览器无法完成防滥用验证，仍可阅读铭牌。', footer:'匿名参与 · 名字与留言由所有来访者共享',
    nameCount:n=>`${n} 个名字`, commentCount:n=>`${n} 则留言`, votes:n=>`${n} 票`, date:()=>'zh-CN', count:(n,max)=>`${n} / ${max}`,
  },
  en: {
    eyebrow:'THE VISITORS’ LABEL', collection:'Pictures at an Exhibition · A shared title', close:'Close label', untitled:'Untitled',
    chosen:'A title chosen by the visitors', unchosen:'A name waiting to be discovered.', inventory:'Collection no.', namesTab:'Name this work', commentsTab:'Visitor notes',
    namesIntro:'What would you call this work?', commentsIntro:'Leave a thought from your visit.',
    namesRule:'Support one title per artwork. Select it again to withdraw your vote. The most supported title appears beneath the work.',
    commentsRule:'Notes are public. Share a thought about the work; leave out contact details and other private information.',
    namePlaceholder:'A name for this work…', commentPlaceholder:'What does this work bring to mind?', nameLabel:'Your title for this work', commentLabel:'Your note',
    nameSubmit:'Submit a title', commentSubmit:'Leave a note', moreNames:'See more titles', moreComments:'Read more notes', anonymous:'A visitor',
    winner:'On the label', yourVote:'Supported', vote:'Support this title', undoVote:'Withdraw your vote', loading:'Reading the label…', refreshing:'Refreshing…',
    emptyNames:'This work has no proposed titles yet.', emptyNamesSub:'Its first name might begin with your way of seeing.', emptyComments:'No notes have been left here yet.', emptyCommentsSub:'Leave the first thought beside this work.',
    retry:'Reconnect', offline:'The label is temporarily offline. Titles and notes can only be read and saved when the museum service is connected.',
    readOnly:'The label can be read, but submissions are currently unavailable. Reconnect to try again.', loadingMore:'Reading…', loadFailed:'This page could not be read. Please try again.',
    checking:'Completing the abuse-prevention check…', saving:'Saving…', savedName:'Your title is on the list. You can also support a title you like.', savedComment:'Your thought has been left beside this work.',
    savedRefresh:'Saved, but the label could not be refreshed. Please reconnect.', uncertain:'The save could not be confirmed. Reconnect and check whether your contribution is on the label before submitting again.', savedVote:'Your support has been updated.', invalid:'Please enter some text within the character limit.',
    genericError:'This could not be completed. Please try again later; your text is still here.', tooFast:'A little too frequent. Please wait before trying again.',
    challengeFailed:'The check did not finish. Please try again.', expired:'The check has expired. Please submit again.', sessionExpired:'Your connection has expired. Please reconnect and try again.',
    duplicate:'Someone has already proposed this title. You can support it in the list.', duplicateComment:'This note is already on the label. There is no need to submit it again.', limit:'The submission limit for this work has been reached. Please return later.',
    absent:'This artwork’s label could not be found.', nameGone:'This title is no longer available. Please refresh the label.',
    proofUnavailable:'This browser cannot complete the abuse-prevention check. The label is still available to read.', footer:'Anonymous participation · Shared with every visitor',
    nameCount:n=>`${n} ${n===1?'title':'titles'}`, commentCount:n=>`${n} ${n===1?'note':'notes'}`, votes:n=>`${n} ${n===1?'vote':'votes'}`, date:()=>'en-GB', count:(n,max)=>`${n} / ${max}`,
  },
  ko: {
    eyebrow:'THE VISITORS’ LABEL', collection:'전람회의 그림 · 함께 짓는 제목', close:'명패 닫기', untitled:'아직 제목 없음',
    chosen:'관람객이 함께 고른 제목', unchosen:'당신의 시선에서 시작될 이름.', inventory:'소장 번호', namesTab:'제목 붙이기', commentsTab:'관람객의 감상',
    namesIntro:'이 작품을 어떻게 부르고 싶나요?', commentsIntro:'지금의 감상을 이곳에 남겨 주세요.',
    namesRule:'작품마다 하나의 제목을 응원할 수 있습니다. 다시 누르면 취소됩니다. 가장 많은 표를 얻은 제목이 작품 아래에 표시됩니다.',
    commentsRule:'감상은 공개됩니다. 작품에 관한 생각을 나누되 연락처나 개인 정보는 남기지 마세요.',
    namePlaceholder:'이 작품에 어울리는 제목…', commentPlaceholder:'이 작품을 보며 무엇이 떠올랐나요?', nameLabel:'작품에 붙일 제목', commentLabel:'나의 감상',
    nameSubmit:'제목 제안하기', commentSubmit:'감상 남기기', moreNames:'다른 제목 더 보기', moreComments:'감상 더 읽기', anonymous:'어느 관람객',
    winner:'현재 작품 제목', yourVote:'응원함', vote:'이 제목 응원하기', undoVote:'응원 취소하기', loading:'명패를 읽는 중…', refreshing:'새로 읽는 중…',
    emptyNames:'아직 제안된 제목이 없습니다.', emptyNamesSub:'첫 번째 제목은 당신의 시선에서 시작될지도 몰라요.', emptyComments:'아직 감상이 없습니다.', emptyCommentsSub:'이 작품 곁에 첫 감상을 남겨 주세요.',
    retry:'다시 연결', offline:'명패에 연결할 수 없습니다. 제목과 감상을 읽고 저장하려면 전시장 서비스에 연결되어야 합니다.',
    readOnly:'명패는 읽을 수 있지만 지금은 글을 남길 수 없습니다. 다시 연결해 주세요.', loadingMore:'읽는 중…', loadFailed:'이 페이지를 읽지 못했습니다. 다시 시도해 주세요.',
    checking:'도배 방지 확인 중…', saving:'저장 중…', savedName:'제목이 등록되었습니다. 마음에 드는 제목을 응원해 주세요.', savedComment:'작품 곁에 감상을 남겼습니다.',
    savedRefresh:'저장되었지만 명패를 새로 읽지 못했습니다. 다시 연결해 주세요.', uncertain:'저장 여부를 확인하지 못했습니다. 다시 연결한 뒤 글이 등록되었는지 확인해 주세요.', savedVote:'응원이 반영되었습니다.', invalid:'글자 수 제한 안에서 내용을 입력해 주세요.',
    genericError:'처리하지 못했습니다. 잠시 후 다시 시도해 주세요. 입력한 내용은 남아 있습니다.', tooFast:'너무 자주 요청하고 있습니다. 잠시 기다려 주세요.',
    challengeFailed:'확인을 마치지 못했습니다. 다시 시도해 주세요.', expired:'확인 시간이 만료되었습니다. 다시 제출해 주세요.', sessionExpired:'연결이 만료되었습니다. 다시 연결해 주세요.',
    duplicate:'이미 제안된 제목입니다. 목록에서 이 제목을 응원할 수 있습니다.', duplicateComment:'이미 등록된 감상입니다. 다시 제출하지 않아도 됩니다.', limit:'이 작품의 제출 한도에 도달했습니다. 나중에 다시 방문해 주세요.',
    absent:'이 작품의 명패를 찾을 수 없습니다.', nameGone:'이 제목은 더 이상 사용할 수 없습니다. 명패를 새로 읽어 주세요.',
    proofUnavailable:'이 브라우저에서는 도배 방지 확인을 완료할 수 없습니다. 명패는 계속 읽을 수 있습니다.', footer:'익명 참여 · 모든 관람객과 함께 나누는 명패',
    nameCount:n=>`제목 ${n}개`, commentCount:n=>`감상 ${n}개`, votes:n=>`${n}표`, date:()=>'ko-KR', count:(n,max)=>`${n} / ${max}`,
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
  dialog.setAttribute('aria-describedby','museum-guestbook-provenance');
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
    const mark = element('div','guestbook-mark',copy.eyebrow);
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
    const provenance = element('p','guestbook-provenance',copy.unchosen);
    provenance.id = 'museum-guestbook-provenance';
    const counts = element('p','guestbook-counts');
    const collection = element('p','guestbook-collection',copy.collection);
    cover.append(mark,number,imageFrame,title,provenance,counts,collection);
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
      const intro = element('h3','guestbook-intro',isName?copy.namesIntro:copy.commentsIntro);
      const rule = element('p','guestbook-rule',isName?copy.namesRule:copy.commentsRule);
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
      panel.append(intro,rule,list,listState,more,form);
      panels[kind] = {panel,list,listState,more,form,input,counter,submit};
    }
    const status = element('p','guestbook-status');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    status.setAttribute('aria-atomic','true');
    const footer = element('p','guestbook-footer',copy.footer);
    content.append(tabs,connection,panels.names.panel,panels.comments.panel,status,footer);
    sheet.append(cover,content,close);
    refs = {title,provenance,counts,nameTab,commentTab,connection,connectionText,reconnect,status,close,...panels};
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
    refs.provenance.textContent = hasTitle?`${copy.chosen} · ${copy.votes(nonnegative(summary.titleVotes))}`:copy.unchosen;
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
        if (entry.votes>0 && entry.text===state.summary?.title) body.append(element('span','guestbook-winning',copy.winner));
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
      const sub = kind==='names'?copy.emptyNamesSub:copy.emptyCommentsSub;
      target.listState.append(element('span','guestbook-empty-title',empty),element('span','guestbook-empty-sub',sub));
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
