// Community panel mounted on each core page: verification badge, join/follow,
// member count, feed (posts, comments, replies, likes), reporting, and the
// manager toolkit (announcements, pins, moderators, invitation links).
import { api, session, badgeHtml, timeAgo } from './api.js';
import { escapeHtml } from './core-data.js';

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const HEART = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

let state = null;

export async function mountCommunity(el, slug, goView) {
  let core;
  try { core = (await api(`/cores/${slug}`)).core; }
  catch { el.innerHTML = ''; return null; } // core not in DB (shouldn't happen post-seed)
  state = { el, core, slug, goView, sort: 'recent' };
  if (!el.dataset.communityWired) {
    el.dataset.communityWired = '1';
    el.addEventListener('click', (event) => {
      const authBtn = event.target.closest('[data-auth]');
      if (authBtn) return state.goView(authBtn.dataset.auth);
      const sortBtn = event.target.closest('[data-feed-sort]');
      if (sortBtn) { state.sort = sortBtn.dataset.feedSort; render(); return; }
      const post = event.target.closest('.feed-post');
      if (post) return handlePostAction(event, post);
      const mgr = event.target.closest('.manager-btn');
      if (mgr) return openManagerPanel(mgr.id);
    });
  }
  render();
  return core;
}

function render() {
  const { core } = state;
  const member = core.viewer?.is_member;
  const role = core.viewer?.role;
  const externals = core.external_communities || [];
  state.el.innerHTML = `
  <section class="community-card" id="communityCard">
    <div class="community-head">
      <div>
        <p class="article-label">Community</p>
        <div class="community-meta-row">
          ${badgeHtml(core.verification_status)}
          <span class="community-members">${fmt(core.member_count)} member${core.member_count === 1 ? '' : 's'} on CORE</span>
        </div>
      </div>
      <button class="community-join${member ? ' is-member' : ''}" id="joinBtn" type="button">${member ? '✓ Joined' : '+ Join community'}</button>
    </div>
    ${externals.length ? `<div class="community-externals">${externals.map((e) =>
      `<a class="community-external" href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer nofollow">
        <span>${escapeHtml(e.label || e.platform)}</span>${e.approx_size ? `<span class="external-size">${fmt(e.approx_size)}</span>` : ''}<span>↗</span></a>`).join('')}</div>` : ''}
    ${role || session.user?.role === 'admin' ? managerBar(role) : ''}
    <div class="community-compose" id="composeWrap"></div>
    <div class="community-sort">
      <button class="sort-btn${state.sort === 'recent' ? ' is-active' : ''}" data-feed-sort="recent" type="button">Recent</button>
      <button class="sort-btn${state.sort === 'popular' ? ' is-active' : ''}" data-feed-sort="popular" type="button">Popular</button>
    </div>
    <div class="community-feed" id="communityFeed"><p class="feed-empty">Loading posts…</p></div>
  </section>`;
  wire();
  renderCompose();
  loadFeed();
}

function managerBar(role) {
  const isManager = role === 'manager' || session.user?.role === 'admin';
  return `<div class="manager-bar">
    <span class="manager-label">${session.user?.role === 'admin' ? 'Admin' : role === 'manager' ? 'Community manager' : 'Moderator'} tools</span>
    ${isManager ? '<button class="manager-btn" id="linksBtn" type="button">Invitation links</button>' : ''}
    ${isManager ? '<button class="manager-btn" id="modsBtn" type="button">Moderators</button>' : ''}
    <button class="manager-btn" id="reportsBtn" type="button">Reports</button>
  </div>
  <div class="manager-panel hidden" id="managerPanel"></div>`;
}

function renderCompose() {
  const wrap = state.el.querySelector('#composeWrap');
  if (!wrap) return;
  if (!session.user) {
    wrap.innerHTML = `<div class="compose-signin">Sign in to post in this community. <button class="link-btn" data-auth="login" type="button">Sign in</button> · <button class="link-btn" data-auth="register" type="button">Create account</button></div>`;
    return;
  }
  if (!state.core.viewer?.is_member) {
    wrap.innerHTML = `<div class="compose-signin">Join this community to post.</div>`;
    return;
  }
  const canAnnounce = state.core.viewer?.role === 'manager' || session.user.role === 'admin';
  wrap.innerHTML = `
    <form class="compose-form" id="composeForm">
      <textarea class="compose-input" id="composeBody" rows="2" maxlength="5000" placeholder="Share something with the ${escapeHtml(state.core.name)} community…"></textarea>
      <div class="compose-row">
        <label class="compose-attach">📷 Image<input type="file" id="composeImage" accept="image/jpeg,image/png,image/gif,image/webp" hidden></label>
        <span class="compose-filename" id="composeFilename"></span>
        ${canAnnounce ? '<label class="compose-announce"><input type="checkbox" id="composeAnnounce"> Announcement</label>' : ''}
        <button class="compose-submit" type="submit">Post</button>
      </div>
      <p class="compose-error hidden" id="composeError"></p>
    </form>`;
  const form = wrap.querySelector('#composeForm');
  const fileInput = wrap.querySelector('#composeImage');
  fileInput.addEventListener('change', () => {
    wrap.querySelector('#composeFilename').textContent = fileInput.files[0]?.name || '';
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errEl = wrap.querySelector('#composeError');
    errEl.classList.add('hidden');
    const body = wrap.querySelector('#composeBody').value.trim();
    const file = fileInput.files[0];
    if (!body && !file) return;
    const fd = new FormData();
    fd.set('body', body);
    if (file) fd.set('image', file);
    if (wrap.querySelector('#composeAnnounce')?.checked) fd.set('announcement', '1');
    try {
      await api(`/community/${state.slug}/posts`, { method: 'POST', form: fd });
      form.reset();
      wrap.querySelector('#composeFilename').textContent = '';
      loadFeed();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

async function loadFeed() {
  const feed = state.el.querySelector('#communityFeed');
  try {
    const { posts } = await api(`/community/${state.slug}/posts?sort=${state.sort === 'popular' ? 'popular' : 'recent'}`);
    if (!posts.length) {
      feed.innerHTML = '<p class="feed-empty">No posts yet. Be the first to say hello.</p>';
      return;
    }
    feed.innerHTML = posts.map(postHtml).join('');
  } catch (err) {
    feed.innerHTML = `<p class="feed-empty">${escapeHtml(err.message)}</p>`;
  }
}

function postHtml(p) {
  const canModerate = state.core.viewer?.role || session.user?.role === 'admin';
  const canDelete = p.is_own || canModerate;
  const canPin = state.core.viewer?.role === 'manager' || session.user?.role === 'admin';
  return `<article class="feed-post${p.kind === 'announcement' ? ' is-announcement' : ''}" data-post="${p.id}">
    ${p.pinned ? '<div class="post-pin">📌 Pinned</div>' : ''}
    ${p.kind === 'announcement' ? '<div class="post-pin">📣 Announcement</div>' : ''}
    <header class="post-head">
      <span class="post-avatar">${escapeHtml((p.display_name || p.username || '?')[0].toUpperCase())}</span>
      <div><strong class="post-author">${escapeHtml(p.display_name || p.username)}</strong>
      <span class="post-meta">@${escapeHtml(p.username)} · ${timeAgo(p.created_at)}</span></div>
    </header>
    ${p.body ? `<p class="post-body">${escapeHtml(p.body)}</p>` : ''}
    ${p.image_path ? `<img class="post-image" src="/${escapeHtml(p.image_path)}" alt="" loading="lazy">` : ''}
    <footer class="post-actions">
      <button class="post-action${p.liked_by_viewer ? ' is-liked' : ''}" data-like type="button">${HEART}<span>${fmt(p.like_count)}</span></button>
      <button class="post-action" data-comments type="button">💬 ${fmt(p.comment_count)}</button>
      ${canPin ? `<button class="post-action" data-pin="${p.pinned ? '0' : '1'}" type="button">${p.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
      ${canDelete ? '<button class="post-action" data-delete type="button">Delete</button>' : ''}
      <button class="post-action" data-report type="button">Report</button>
    </footer>
    <div class="post-comments hidden" data-comments-wrap></div>
  </article>`;
}

function wire() {
  const { el } = state;
  el.querySelector('#joinBtn')?.addEventListener('click', async () => {
    if (!session.user) return state.goView('login');
    const member = state.core.viewer?.is_member;
    try {
      const out = await api(`/community/${state.slug}/${member ? 'leave' : 'join'}`, { method: 'POST' });
      state.core.viewer = { ...(state.core.viewer || {}), is_member: !member };
      state.core.member_count = out.member_count;
      render();
    } catch (err) { alert(err.message); }
  });
}

async function handlePostAction(event, postEl) {
  const postId = postEl.dataset.post;
  if (event.target.closest('[data-like]')) {
    if (!session.user) return state.goView('login');
    try {
      const out = await api(`/community/${state.slug}/posts/${postId}/like`, { method: 'POST' });
      const btn = postEl.querySelector('[data-like]');
      btn.classList.toggle('is-liked', out.liked);
      btn.querySelector('span').textContent = fmt(out.like_count);
    } catch (err) { alert(err.message); }
    return;
  }
  if (event.target.closest('[data-delete]')) {
    if (!confirm('Delete this post?')) return;
    try { await api(`/community/${state.slug}/posts/${postId}`, { method: 'DELETE' }); loadFeed(); }
    catch (err) { alert(err.message); }
    return;
  }
  const pinBtn = event.target.closest('[data-pin]');
  if (pinBtn) {
    try { await api(`/community/${state.slug}/posts/${postId}/pin`, { method: 'POST', body: { pinned: pinBtn.dataset.pin === '1' } }); loadFeed(); }
    catch (err) { alert(err.message); }
    return;
  }
  if (event.target.closest('[data-report]')) {
    const reason = prompt('What\'s wrong with this post?');
    if (!reason) return;
    if (!session.user) return state.goView('login');
    try {
      const out = await api(`/community/${state.slug}/report`, { method: 'POST', body: { target_type: 'post', target_id: postId, reason } });
      alert(out.message);
    } catch (err) { alert(err.message); }
    return;
  }
  if (event.target.closest('[data-comments]')) toggleComments(postEl, postId);
}

async function toggleComments(postEl, postId) {
  const wrap = postEl.querySelector('[data-comments-wrap]');
  if (!wrap.classList.contains('hidden')) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '<p class="feed-empty">Loading…</p>';
  await renderComments(wrap, postId);
}

async function renderComments(wrap, postId) {
  try {
    const { comments } = await api(`/community/${state.slug}/posts/${postId}/comments`);
    const byParent = new Map();
    for (const c of comments) {
      const key = c.parent_id || '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const renderThread = (parent, depth) => (byParent.get(parent) || []).map((c) => c.deleted
      ? `<div class="comment is-deleted" style="margin-left:${depth * 20}px"><em>Comment removed.</em></div>${renderThread(c.id, Math.min(depth + 1, 4))}`
      : `<div class="comment" data-comment="${c.id}" style="margin-left:${depth * 20}px">
          <strong>${escapeHtml(c.display_name || c.username)}</strong> <span class="post-meta">${timeAgo(c.created_at)}</span>
          <p>${escapeHtml(c.body)}</p>
          <div class="comment-actions">
            <button class="link-btn${c.liked_by_viewer ? ' is-liked' : ''}" data-clike type="button">♥ ${fmt(c.like_count)}</button>
            <button class="link-btn" data-creply type="button">Reply</button>
            <button class="link-btn" data-cdelete type="button">Delete</button>
          </div>
        </div>${renderThread(c.id, Math.min(depth + 1, 4))}`).join('');
    wrap.innerHTML = `${renderThread('', 0) || '<p class="feed-empty">No comments yet.</p>'}
      ${session.user && state.core.viewer?.is_member ? `<form class="comment-form" data-comment-form>
        <input class="compose-input" name="body" maxlength="2000" placeholder="Add a comment…" autocomplete="off">
        <input type="hidden" name="parent_id" value="">
        <button class="compose-submit" type="submit">Reply</button></form>` : ''}`;

    wrap.onclick = async (event) => {
      const comment = event.target.closest('[data-comment]');
      if (event.target.closest('[data-creply]') && comment) {
        const form = wrap.querySelector('[data-comment-form]');
        if (form) {
          form.querySelector('[name=parent_id]').value = comment.dataset.comment;
          form.querySelector('[name=body]').placeholder = 'Reply to comment…';
          form.querySelector('[name=body]').focus();
        }
        return;
      }
      if (event.target.closest('[data-clike]') && comment) {
        if (!session.user) return state.goView('login');
        try {
          const out = await api(`/community/${state.slug}/comments/${comment.dataset.comment}/like`, { method: 'POST' });
          const btn = comment.querySelector('[data-clike]');
          btn.classList.toggle('is-liked', out.liked);
          btn.innerHTML = `♥ ${fmt(out.like_count)}`;
        } catch (err) { alert(err.message); }
        return;
      }
      if (event.target.closest('[data-cdelete]') && comment) {
        if (!confirm('Delete this comment?')) return;
        try { await api(`/community/${state.slug}/comments/${comment.dataset.comment}`, { method: 'DELETE' }); renderComments(wrap, postId); }
        catch (err) { alert(err.message); }
      }
    };
    wrap.querySelector('[data-comment-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const body = form.body.value.trim();
      if (!body) return;
      try {
        await api(`/community/${state.slug}/posts/${postId}/comments`, {
          method: 'POST', body: { body, parent_id: form.parent_id.value || null },
        });
        renderComments(wrap, postId);
      } catch (err) { alert(err.message); }
    });
  } catch (err) {
    wrap.innerHTML = `<p class="feed-empty">${escapeHtml(err.message)}</p>`;
  }
}

// ── Manager panels ─────────────────────────────────────────────────────────
async function openManagerPanel(which) {
  const panel = state.el.querySelector('#managerPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="feed-empty">Loading…</p>';
  try {
    if (which === 'linksBtn') {
      const { links } = await api(`/referrals/cores/${state.slug}/links`);
      panel.innerHTML = `
        <h4>Invitation links</h4>
        <p class="panel-copy">Share these with your existing community — Facebook, Tumblr, Reddit, Discord, anywhere. Signups are attributed automatically and new members join this community after verifying their email.</p>
        <form class="panel-form" id="newLinkForm">
          <input name="label" placeholder="Label (e.g. Facebook pinned post)" maxlength="120">
          <select name="source"><option value="">Source…</option>${['facebook', 'tumblr', 'reddit', 'discord', 'tiktok', 'instagram', 'x', 'website', 'other'].map((s) => `<option>${s}</option>`).join('')}</select>
          <button class="compose-submit" type="submit">Create link</button>
        </form>
        <div class="link-list">${links.map((l) => `
          <div class="link-row">
            <div><code>${escapeHtml(l.url)}</code><span class="post-meta"> ${escapeHtml(l.label || '')} · ${l.clicks} clicks · ${l.signups} signups · ${l.joins} joined</span></div>
            <div class="link-row-actions">
              <button class="link-btn" data-copy="${escapeHtml(l.url)}" type="button">Copy</button>
              <a class="link-btn" href="/api/referrals/join/${escapeHtml(l.code)}/qr.svg" target="_blank" rel="noopener">QR</a>
            </div>
          </div>`).join('') || '<p class="feed-empty">No links yet.</p>'}</div>`;
      panel.querySelector('#newLinkForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const f = event.target;
        try {
          await api(`/referrals/cores/${state.slug}/links`, { method: 'POST', body: { label: f.label.value, source: f.source.value } });
          openManagerPanel('linksBtn');
        } catch (err) { alert(err.message); }
      });
      panel.onclick = (event) => {
        const copy = event.target.closest('[data-copy]');
        if (copy) navigator.clipboard?.writeText(copy.dataset.copy).then(() => { copy.textContent = 'Copied!'; });
      };
    } else if (which === 'modsBtn') {
      panel.innerHTML = `
        <h4>Community moderators</h4>
        <div class="link-list">${(state.core.moderators || []).map((m) => `
          <div class="link-row"><span>@${escapeHtml(m.username)} — ${escapeHtml(m.role)}</span>
          ${m.role === 'moderator' ? `<button class="link-btn" data-removemod="${escapeHtml(m.username)}" type="button">Remove</button>` : ''}</div>`).join('') || '<p class="feed-empty">No moderators yet.</p>'}</div>
        <form class="panel-form" id="addModForm">
          <input name="username" placeholder="Username to add as moderator" required>
          <button class="compose-submit" type="submit">Add moderator</button>
        </form>`;
      panel.querySelector('#addModForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api(`/community/${state.slug}/moderators`, { method: 'POST', body: { username: event.target.username.value } });
          state.core = (await api(`/cores/${state.slug}`)).core;
          openManagerPanel('modsBtn');
        } catch (err) { alert(err.message); }
      });
      panel.onclick = async (event) => {
        const rm = event.target.closest('[data-removemod]');
        if (!rm) return;
        try {
          await api(`/community/${state.slug}/moderators`, { method: 'POST', body: { username: rm.dataset.removemod, remove: true } });
          state.core = (await api(`/cores/${state.slug}`)).core;
          openManagerPanel('modsBtn');
        } catch (err) { alert(err.message); }
      };
    } else if (which === 'reportsBtn') {
      const { reports } = await api(`/community/${state.slug}/reports`);
      panel.innerHTML = `
        <h4>Reports</h4>
        <div class="link-list">${reports.map((r) => `
          <div class="link-row"><div><strong>${escapeHtml(r.target_type)}</strong> · ${escapeHtml(r.reason)}
            <span class="post-meta">by @${escapeHtml(r.reporter)} · ${timeAgo(r.created_at)} · ${escapeHtml(r.status)}</span></div>
          ${r.status === 'open' ? `<div class="link-row-actions">
            <button class="link-btn" data-resolve="${r.id}" type="button">Resolve</button>
            <button class="link-btn" data-dismiss="${r.id}" type="button">Dismiss</button></div>` : ''}</div>`).join('') || '<p class="feed-empty">No reports. 🎉</p>'}</div>`;
      panel.onclick = async (event) => {
        const resolve = event.target.closest('[data-resolve]');
        const dismiss = event.target.closest('[data-dismiss]');
        if (!resolve && !dismiss) return;
        try {
          await api(`/community/${state.slug}/reports/${(resolve || dismiss).dataset.resolve || (resolve || dismiss).dataset.dismiss}/resolve`,
            { method: 'POST', body: { dismiss: !!dismiss } });
          openManagerPanel('reportsBtn');
        } catch (err) { alert(err.message); }
      };
    }
  } catch (err) {
    panel.innerHTML = `<p class="feed-empty">${escapeHtml(err.message)}</p>`;
  }
}
