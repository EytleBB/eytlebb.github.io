(() => {
  'use strict';
  const API = '/api/museum/v1/admin';
  const $ = id => document.getElementById(id);
  const state = {csrf: '', role: '', artworks: [], selected: null, detail: null, preview: {}, auditOffset: 0};
  const node = (tag, cls, value) => {
    const item = document.createElement(tag);
    if (cls) item.className = cls;
    if (value !== undefined) item.textContent = String(value);
    return item;
  };
  const notice = (message, error = false) => {
    $('notice').textContent = message || '';
    $('notice').classList.toggle('error', error);
  };
  const button = (label, handler, cls = '') => {
    const item = node('button', cls, label);
    item.type = 'button';
    item.addEventListener('click', handler);
    return item;
  };
  const report = error => notice(error.message || '操作失败，请重试。', true);

  async function request(path, method = 'GET', payload) {
    const options = {method, credentials: 'same-origin', headers: {'Accept': 'application/json'}};
    if (method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      if (state.csrf) options.headers['X-CSRF-Token'] = state.csrf;
      options.body = JSON.stringify(payload || {});
    }
    const response = await fetch(API + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/login') showLogin();
      throw new Error(data.error?.message || `请求失败（${response.status}）`);
    }
    return data;
  }

  function showLogin() {
    state.csrf = '';
    $('identity').textContent = '';
    $('logout').hidden = true;
    $('app-view').hidden = true;
    $('login-view').hidden = false;
  }

  async function showApp(session) {
    state.csrf = session.csrf;
    state.role = session.role;
    $('identity').textContent = `${session.username} · ${session.role === 'owner' ? '所有者' : '管理员'}`;
    $('logout').hidden = false;
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    $('users-tab').hidden = session.role !== 'owner';
    const current = document.querySelector('.tabs .active')?.dataset.tab || 'artworks';
    switchTab(current === 'users' && session.role !== 'owner' ? 'artworks' : current);
    await loadArtworks();
  }

  function switchTab(tab) {
    for (const name of ['artworks', 'audit', 'users']) {
      $(`${name}-view`).hidden = name !== tab;
      document.querySelector(`[data-tab="${name}"]`).classList.toggle('active', name === tab);
    }
    if (tab === 'audit') loadAudit(false).catch(report);
    if (tab === 'users') loadUsers().catch(report);
  }

  async function loadArtworks() {
    const result = await request('/artworks');
    state.artworks = result.artworks;
    renderArtworks();
    if (state.selected) await selectArtwork(state.selected);
    if (!Object.keys(state.preview).length) {
      fetch('/images/gallery-preview/index.json', {credentials: 'same-origin'})
        .then(response => response.ok ? response.json() : {})
        .then(data => { state.preview = data.items || {}; if (state.detail) renderDetail(); })
        .catch(() => {});
    }
  }

  function renderArtworks() {
    const target = $('artwork-list');
    target.replaceChildren();
    const search = $('artwork-search').value.trim().toLowerCase();
    let found = 0;
    for (const artwork of state.artworks) {
      if (search && !`${artwork.id} ${artwork.title || ''}`.toLowerCase().includes(search)) continue;
      found++;
      const item = button('', () => selectArtwork(artwork.id).catch(report), 'artwork-button');
      item.classList.toggle('active', state.selected === artwork.id);
      item.append(node('strong', '', artwork.id), node('small', '', artwork.title || '暂无名字'), node('small', '', `${artwork.namesCount} 个名字 · ${artwork.commentsCount} 条评论`));
      target.append(item);
    }
    if (!found) target.append(node('p', 'empty', '没有匹配的画作。'));
  }

  async function selectArtwork(id) {
    state.selected = id;
    renderArtworks();
    state.detail = await request(`/artworks/${encodeURIComponent(id)}`);
    renderDetail();
  }

  async function moreDetail(offset) {
    const result = await request(`/artworks/${encodeURIComponent(state.selected)}?offset=${offset}`);
    state.detail.names.push(...result.names);
    state.detail.comments.push(...result.comments);
    state.detail.nextNamesOffset = result.nextNamesOffset;
    state.detail.nextCommentsOffset = result.nextCommentsOffset;
    renderDetail();
  }

  function renderDetail() {
    const data = state.detail;
    if (!data) return;
    const target = $('detail-panel');
    target.replaceChildren();
    const head = node('div', 'detail-head');
    const image = node('img');
    const preview = state.preview[state.selected]?.preview;
    image.src = preview ? `/images/gallery-preview/${encodeURIComponent(preview)}` : `/images/gallery/${encodeURIComponent(state.selected)}`;
    image.alt = `画作 ${state.selected}`;
    const info = node('div');
    info.append(node('h2', '', state.selected), node('p', 'title', data.artwork.title || '暂无获选名字'), node('p', '', `${data.artwork.namesCount} 个公开名字 · ${data.artwork.commentsCount} 条公开评论`));
    if (data.selectedNameId !== null) info.append(node('p', '', '当前为管理员手动定名；下次访客投票后恢复自动排名。'));
    const refresh = button('刷新画作', () => loadArtworks().catch(report), 'secondary');
    info.append(refresh);
    if (data.selectedNameId !== null) info.append(button('恢复按票数选名', () => mutate(`/artworks/${encodeURIComponent(state.selected)}/title`, {action: 'auto'}, '已恢复自动选名。'), 'secondary'));
    head.append(image, info);
    target.append(head);
    const grid = node('div', 'content-grid');
    const names = node('section', 'content-section');
    names.append(node('h3', '', `名字（${data.names.length} 已加载）`));
    if (!data.names.length) names.append(node('p', 'empty', '这幅画还没有名字。'));
    data.names.forEach(entry => names.append(renderEntry('name', entry)));
    const comments = node('section', 'content-section');
    comments.append(node('h3', '', `评论（${data.comments.length} 已加载）`));
    if (!data.comments.length) comments.append(node('p', 'empty', '这幅画还没有评论。'));
    data.comments.forEach(entry => comments.append(renderEntry('comment', entry)));
    grid.append(names, comments);
    target.append(grid);
    const offset = data.nextNamesOffset ?? data.nextCommentsOffset;
    if (offset !== null) target.append(button('加载更多内容', () => moreDetail(offset).catch(report), 'secondary'));
  }

  function renderEntry(kind, entry) {
    const row = node('article', `entry${entry.hidden ? ' hidden-entry' : ''}`);
    const header = node('div', 'entry-header');
    header.append(node('strong', '', `#${entry.id}`));
    if (entry.hidden) header.append(node('span', 'badge warn', '已隐藏'));
    if (kind === 'name') {
      header.append(node('span', 'badge', `${entry.votes} 票`));
      if (entry.votesAdjusted) header.append(node('span', 'badge warn', `已调票 · 访客真实票 ${entry.realVotes}`));
      if (entry.id === state.detail.selectedNameId) header.append(node('span', 'badge', '手动定名'));
    }
    row.append(header, node('p', '', entry.text), node('small', '', new Date(entry.createdAt).toLocaleString('zh-CN')));
    const actions = node('div', 'actions');
    actions.append(button('编辑', async () => {
      const text = await editValue('编辑' + (kind === 'name' ? '名字' : '评论'), entry.text, kind === 'name' ? 40 : 280);
      if (text !== null && text !== entry.text) mutate(`/entries/${kind}/${entry.id}`, {action: 'edit', text}, '内容已更新。');
    }, 'secondary'));
    actions.append(button(entry.hidden ? '恢复' : '隐藏', () => mutate(`/entries/${kind}/${entry.id}`, {action: entry.hidden ? 'restore' : 'hide'}, entry.hidden ? '内容已恢复。' : '内容已隐藏。'), 'secondary'));
    if (kind === 'name') {
      actions.append(button('设为获选名', () => mutate(`/entries/name/${entry.id}`, {action: 'title'}, '已手动定名。'), 'secondary'));
      actions.append(button('设置票数', async () => {
        const value = await editValue('设置展示票数', String(entry.votes), 10, 'number');
        if (value !== null && /^\d+$/.test(value)) mutate(`/entries/name/${entry.id}`, {action: 'votes', votes: Number(value)}, '展示票数已更新。');
      }, 'secondary'));
    }
    actions.append(button('永久删除', () => {
      if (confirm(`永久删除画作 ${state.selected} 的${kind === 'name' ? '名字' : '评论'} #${entry.id}？此操作不能在后台撤销，只能通过备份恢复。`))
        mutate(`/entries/${kind}/${entry.id}`, {action: 'delete'}, '内容已永久删除。');
    }, 'danger'));
    row.append(actions);
    return row;
  }

  async function mutate(path, payload, success) {
    try {
      await request(path, 'POST', payload);
      notice(success);
      await loadArtworks();
    } catch (error) { report(error); }
  }

  function editValue(title, value, limit, type = 'text') {
    return new Promise(resolve => {
      const dialog = $('edit-dialog');
      $('edit-heading').textContent = title;
      const label = $('edit-label');
      label.textContent = type === 'number' ? '展示票数' : '内容';
      const input = node(type === 'text' && limit > 40 ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = type;
      input.maxLength = limit;
      input.required = true;
      if (type === 'number') { input.min = '0'; input.max = '1000000000'; }
      input.value = value;
      label.append(input);
      const form = $('edit-form');
      const cancel = $('edit-cancel');
      let result = null;
      const onSubmit = event => { event.preventDefault(); result = input.value; dialog.close(); };
      const onCancel = () => dialog.close();
      const onClose = () => {
        form.removeEventListener('submit', onSubmit);
        cancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('close', onClose);
        resolve(result);
      };
      form.addEventListener('submit', onSubmit);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
      input.focus();
    });
  }

  async function loadAudit(more) {
    const offset = more ? state.auditOffset : 0;
    const data = await request(`/audit?offset=${offset}`);
    const target = $('audit-list');
    if (!more) target.replaceChildren();
    for (const entry of data.entries) {
      const row = node('div', 'log-row');
      row.append(node('time', '', new Date(entry.createdAt).toLocaleString('zh-CN')),
        node('p', '', `${entry.actor} · ${entry.action} · ${entry.artwork || ''} ${entry.kind || ''} ${entry.targetId || ''}`));
      if (Object.keys(entry.details).length) row.append(node('code', '', JSON.stringify(entry.details)));
      target.append(row);
    }
    state.auditOffset = data.nextOffset;
    $('audit-more').hidden = data.nextOffset === null;
  }

  async function loadUsers() {
    const data = await request('/users');
    const target = $('user-list');
    target.replaceChildren();
    for (const user of data.users) {
      const row = node('div', 'user-row');
      row.append(node('strong', '', `${user.username} · ${user.role === 'owner' ? '所有者' : '管理员'} · ${user.active ? '启用' : '停用'}`));
      if (user.role === 'admin') {
        row.append(button(user.active ? '停用' : '启用', async () => {
          if (!confirm(`${user.active ? '停用' : '启用'}账号 ${user.username}？`)) return;
          try { await request(`/users/${user.id}`, 'POST', {action: user.active ? 'disable' : 'enable'}); notice('账号状态已更新。'); await loadUsers(); }
          catch (error) { report(error); }
        }, 'secondary'));
        const form = node('form');
        const label = node('label', '', '重置密码');
        const input = node('input'); input.type = 'password'; input.minLength = 12; input.required = true; input.autocomplete = 'new-password';
        label.append(input); form.append(label, node('button', '', '重置'));
        form.addEventListener('submit', async event => {
          event.preventDefault();
          try { await request(`/users/${user.id}`, 'POST', {action: 'password', password: input.value}); input.value = ''; notice('密码已重置，旧会话已失效。'); }
          catch (error) { report(error); }
        });
        row.append(form);
      }
      target.append(row);
    }
  }

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button'); submit.disabled = true;
    try {
      const session = await request('/login', 'POST', {username: form.elements.username.value, password: form.elements.password.value});
      form.elements.password.value = '';
      notice('登录成功。');
      await showApp(session);
    } catch (error) { report(error); }
    finally { submit.disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    try { await request('/logout', 'POST', {}); } catch (error) { report(error); }
    showLogin(); notice('已退出登录。');
  });
  document.querySelectorAll('.tabs button').forEach(item => item.addEventListener('click', () => switchTab(item.dataset.tab)));
  $('artwork-search').addEventListener('input', renderArtworks);
  $('audit-refresh').addEventListener('click', () => loadAudit(false).catch(report));
  $('audit-more').addEventListener('click', () => loadAudit(true).catch(report));
  $('create-user').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request('/users', 'POST', {username: form.elements.username.value, password: form.elements.password.value});
      form.reset(); notice('管理员账号已创建。'); await loadUsers();
    } catch (error) { report(error); }
  });
  request('/session').then(showApp).catch(() => showLogin());
})();
