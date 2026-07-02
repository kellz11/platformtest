// CORE administrative console. Access is enforced by the backend on every call;
// this UI additionally gates itself on the admin role.
import { api, loadSession, session, timeAgo } from '/ui/api.js';
import { escapeHtml } from '/ui/core-data.js';

const main = document.getElementById('main');
const esc = escapeHtml;
const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const pill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;

const sections = {
  async dashboard() {
    const a = await api('/admin/analytics');
    main.innerHTML = `<h1>Dashboard</h1><p class="admin-sub">Platform overview and onboarding analytics.</p>
      <div class="stat-grid">${Object.entries({
        Users: a.totals.users, 'Verified emails': a.totals.verified_users, Cores: a.totals.cores,
        'Verified communities': a.totals.verified_cores, Memberships: a.totals.memberships,
        Posts: a.totals.posts, 'Wallets provisioned': a.totals.wallets,
      }).map(([k, v]) => `<div class="stat-card"><b>${fmt(v)}</b><span>${k}</span></div>`).join('')}</div>
      <h3>Referral funnels</h3>
      <table class="admin"><tr><th>Core</th><th>Label</th><th>Source</th><th>Clicks</th><th>Signups</th><th>Joined</th></tr>
      ${a.referrals.map((r) => `<tr><td>${esc(r.core_name)}</td><td>${esc(r.label || '')}</td><td>${esc(r.source || '')}</td><td>${fmt(r.clicks)}</td><td>${fmt(r.signups)}</td><td>${fmt(r.joins)}</td></tr>`).join('') || '<tr><td colspan="6">No referral links yet.</td></tr>'}</table>`;
  },

  async cores() {
    const { cores } = await api('/cores');
    main.innerHTML = `<h1>Cores</h1><p class="admin-sub">Create and manage core pages. Cores are created only here — there is no public submission.</p>
      <form class="admin-form" id="newCore" style="grid-template-columns:1fr auto;grid-auto-flow:column">
        <input name="name" placeholder="New core name (e.g. Dreamcore)" required>
        <button class="compose-submit" type="submit">Create core</button>
      </form>
      <table class="admin"><tr><th>Name</th><th>Status</th><th>Members</th><th></th></tr>
      ${cores.map((c) => `<tr><td><a href="/core/${esc(c.slug)}" target="_blank">${esc(c.name)}</a></td>
        <td>${pill(c.verification_status)}</td><td>${fmt(c.member_count)}</td>
        <td><button class="link-btn" data-edit="${esc(c.slug)}">Manage</button></td></tr>`).join('')}</table>`;
    main.querySelector('#newCore').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const out = await api('/admin/cores', { method: 'POST', body: { name: e.target.name.value } }); editCore(out.slug); }
      catch (err) { alert(err.message); }
    });
    main.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) editCore(b.dataset.edit); };
  },

  async verification() {
    const { requests } = await api('/admin/verification-requests?status=pending');
    main.innerHTML = `<h1>Verification queue</h1><p class="admin-sub">Review evidence from invited community representatives. Evidence is confidential.</p>
      ${requests.length ? '' : '<p>No pending requests.</p>'}
      <div id="vlist">${requests.map((r) => `
        <div class="stat-card" style="margin-bottom:14px">
          <b style="font-size:16px">${esc(r.core_name)}</b>
          <span>@${esc(r.username)} · ${esc(r.email)} · ${timeAgo(r.created_at)}</span>
          <div class="admin-actions" style="margin-top:10px">
            <button class="manager-btn" data-view-req="${r.id}">View evidence</button>
            <button class="manager-btn" data-approve="${r.id}">Approve</button>
            <button class="manager-btn" data-reject="${r.id}">Reject</button>
          </div>
          <div id="ev-${r.id}"></div>
        </div>`).join('')}</div>`;
    main.onclick = async (e) => {
      const view = e.target.closest('[data-view-req]');
      if (view) {
        const d = await api(`/admin/verification-requests/${view.dataset.viewReq}`);
        document.getElementById(`ev-${view.dataset.viewReq}`).innerHTML =
          d.evidence.map((ev) => `<p class="panel-copy" style="margin-top:10px"><b>${esc(ev.platform)}</b>
          ${ev.community_url ? ` · <a href="${esc(ev.community_url)}" target="_blank" rel="noopener noreferrer">${esc(ev.community_url)}</a>` : ''}
          ${ev.approx_size ? ` · ~${fmt(ev.approx_size)} members` : ''}<br>${esc(ev.evidence_text || '')}
          ${ev.evidence_url ? `<br><a href="${esc(ev.evidence_url)}" target="_blank" rel="noopener noreferrer">${esc(ev.evidence_url)}</a>` : ''}</p>`).join('');
        return;
      }
      const approve = e.target.closest('[data-approve]');
      const reject = e.target.closest('[data-reject]');
      if (approve || reject) {
        const id = (approve || reject).dataset.approve || (approve || reject).dataset.reject;
        const notes = prompt('Review notes (internal):') || '';
        try { await api(`/admin/verification-requests/${id}/review`, { method: 'POST', body: { approve: !!approve, notes } }); sections.verification(); }
        catch (err) { alert(err.message); }
      }
    };
  },

  async reports() {
    const { reports } = await api('/admin/reports');
    main.innerHTML = `<h1>Open reports</h1><p class="admin-sub">All communities. Community moderators also see their own queue on each core page.</p>
      <table class="admin"><tr><th>Core</th><th>Target</th><th>Reason</th><th>Reporter</th><th>When</th></tr>
      ${reports.map((r) => `<tr><td>${esc(r.core_name)}</td><td>${esc(r.target_type)} <span class="mono">${esc(r.target_id)}</span></td>
      <td>${esc(r.reason)}</td><td>@${esc(r.reporter)}</td><td>${timeAgo(r.created_at)}</td></tr>`).join('') || '<tr><td colspan="5">No open reports.</td></tr>'}</table>`;
  },

  async users(query = '') {
    const { users } = await api(`/admin/users?q=${encodeURIComponent(query)}`);
    main.innerHTML = `<h1>Users</h1><p class="admin-sub">Search, review abuse signals, suspend.</p>
      <form class="admin-form" id="uSearch" style="grid-template-columns:1fr auto;grid-auto-flow:column">
        <input name="q" placeholder="Search email or username" value="${esc(query)}"><button class="compose-submit">Search</button></form>
      <table class="admin"><tr><th>User</th><th>Email</th><th>Status</th><th>Signals</th><th>Joined</th><th></th></tr>
      ${users.map((u) => `<tr><td>@${esc(u.username)}${u.role === 'admin' ? ' <span class="pill official">admin</span>' : ''}</td>
      <td>${esc(u.email)}${u.email_verified_at ? ' ✓' : ''}</td><td>${esc(u.status)}</td>
      <td>${u.abuse_signals ? `⚠ ${u.abuse_signals}` : '—'}</td><td>${timeAgo(u.created_at)}</td>
      <td>${u.role !== 'admin' ? `<button class="link-btn" data-suspend="${u.id}" data-un="${u.status === 'suspended' ? '1' : ''}">${u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>` : ''}</td></tr>`).join('')}</table>`;
    main.querySelector('#uSearch').addEventListener('submit', (e) => { e.preventDefault(); sections.users(e.target.q.value); });
    main.onclick = async (e) => {
      const b = e.target.closest('[data-suspend]');
      if (!b) return;
      const reason = b.dataset.un ? '' : (prompt('Reason for suspension:') || '');
      try { await api(`/admin/users/${b.dataset.suspend}/suspend`, { method: 'POST', body: { reason, unsuspend: !!b.dataset.un } }); sections.users(); }
      catch (err) { alert(err.message); }
    };
  },

  async distributions() {
    main.innerHTML = `<h1>Distributions</h1>
      <p class="admin-sub">Build reviewed eligibility lists of <b>public</b> wallet addresses for future reward distributions. Private keys are never accessible here. Flagged, suspended, and unverified accounts are excluded automatically.</p>
      <form class="admin-form" id="batchForm">
        <input name="label" placeholder="Batch label (e.g. Early adopters wave 1)" required>
        <input name="created_before" placeholder="Only accounts created before (YYYY-MM-DD, optional)">
        <input name="core_slugs" placeholder="Limit to communities (comma-separated slugs, optional)">
        <input name="min_posts" type="number" min="0" placeholder="Minimum posts (optional)">
        <label class="auth-consent"><input type="checkbox" name="representatives_only"><span>Verified community representatives only</span></label>
        <button class="compose-submit" type="submit">Create eligibility batch</button>
      </form>
      <div id="batchOut"></div>
      <h3>Batches</h3>
      <div id="batchList"><p class="admin-sub">Loading…</p></div>`;
    const loadBatches = async () => {
      const { batches } = await api('/admin/distributions');
      document.getElementById('batchList').innerHTML = batches.length ? `<table class="admin">
        <tr><th>Batch</th><th>Status</th><th>Recipients</th><th>Created</th><th>Transaction</th><th></th></tr>
        ${batches.map((b) => `<tr>
          <td><b>${esc(b.label)}</b><br><span class="mono">${esc(b.id)}</span></td>
          <td>${pill(b.status)}</td><td>${fmt(b.recipient_count)}</td><td>${esc(b.created_at)}</td>
          <td class="mono" style="word-break:break-all">${esc(b.tx_signature || '—')}</td>
          <td class="admin-actions">
            <a class="manager-btn" href="/api/admin/distributions/${esc(b.id)}/export" download>Export CSV</a>
            ${b.status !== 'executed' ? `<button class="manager-btn" data-exec="${esc(b.id)}">Record execution</button>` : ''}
          </td></tr>`).join('')}</table>` : '<p class="admin-sub">No batches yet.</p>';
      document.querySelectorAll('#batchList [data-exec]').forEach((b) => b.addEventListener('click', async () => {
        const sig = prompt('Solana transaction signature for this distribution (marks every recipient as sent — a batch can only be executed once):');
        if (!sig) return;
        try { await api(`/admin/distributions/${b.dataset.exec}/record-execution`, { method: 'POST', body: { tx_signature: sig } }); loadBatches(); }
        catch (err) { alert(err.message); }
      }));
    };
    loadBatches();
    main.querySelector('#batchForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const out = await api('/admin/distributions', { method: 'POST', body: {
          label: f.label.value,
          criteria: {
            created_before: f.created_before.value || null,
            core_slugs: f.core_slugs.value.split(',').map((s) => s.trim()).filter(Boolean),
            min_posts: f.min_posts.value || 0,
            representatives_only: f.representatives_only.checked,
          } } });
        document.getElementById('batchOut').innerHTML = `<div class="stat-card"><b>${fmt(out.recipient_count)}</b>
          <span>eligible recipients in batch <span class="mono">${esc(out.batch_id)}</span></span>
          <div class="admin-actions" style="margin-top:10px">
            <a class="manager-btn" href="/api/admin/distributions/${esc(out.batch_id)}/export" download>Export CSV (public addresses)</a>
          </div></div>`;
        loadBatches();
      } catch (err) { alert(err.message); }
    });
  },

  async audit() {
    const { log } = await api('/admin/audit-log');
    main.innerHTML = `<h1>Audit log</h1><p class="admin-sub">Sensitive administrative and security actions.</p>
      <table class="admin"><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr>
      ${log.map((l) => `<tr><td>${esc(l.created_at)}</td><td>${esc(l.actor || 'system')}</td><td class="mono">${esc(l.action)}</td>
      <td class="mono">${esc(l.target_type || '')} ${esc(l.target_id || '')}</td><td class="mono">${esc(l.detail || '')}</td></tr>`).join('')}</table>`;
  },

  async outbox() {
    try {
      const { mail } = await api('/admin/outbox');
      main.innerHTML = `<h1>Dev outbox</h1><p class="admin-sub">Emails the platform would send (development mode). Verification and invitation links appear here.</p>
        ${mail.map((m) => `<div class="stat-card" style="margin-bottom:12px"><b style="font-size:14px">${esc(m.subject)}</b>
        <span>to ${esc(m.to_email)} · ${esc(m.created_at)}</span><pre style="white-space:pre-wrap;font-size:12.5px">${esc(m.body)}</pre></div>`).join('') || '<p>Empty.</p>'}`;
    } catch (err) { main.innerHTML = `<h1>Dev outbox</h1><p>${esc(err.message)}</p>`; }
  },
};

async function editCore(slug) {
  const d = await api(`/admin/cores/${slug}`);
  const c = d.core;
  const val = (arr) => esc((arr || []).join(', '));
  main.innerHTML = `<h1>${esc(c.name)} ${pill(c.verification_status)}</h1>
    <p class="admin-sub"><a href="/core/${esc(c.slug)}" target="_blank">/core/${esc(c.slug)}</a> · ${fmt(c.member_count)} members</p>
    <form class="admin-form" id="coreForm">
      <label>Short definition<textarea name="definition" rows="2">${esc(c.definition || '')}</textarea></label>
      <label>Detailed description<textarea name="description" rows="4">${esc(c.description || '')}</textarea></label>
      <label>Origin & history<textarea name="history" rows="3">${esc(c.history || '')}</textarea></label>
      <label>Cultural context<textarea name="cultural_context" rows="3">${esc(c.cultural_context || '')}</textarea></label>
      <label>Visual characteristics (comma-separated)<input name="visual_characteristics" value="${val(c.visual_characteristics)}"></label>
      <label>Themes<input name="themes" value="${val(c.themes)}"></label>
      <label>Keywords<input name="keywords" value="${val(c.keywords)}"></label>
      <label>Aliases<input name="aliases" value="${val(c.aliases)}"></label>
      <label>Tags<input name="tags" value="${val(c.tags)}"></label>
      <button class="compose-submit" type="submit">Save core</button>
    </form>

    <h3>Verification</h3>
    <div class="admin-actions" style="margin:10px 0 22px">
      <button class="manager-btn" id="inviteBtn">Create representative invitation</button>
      ${c.verification_status === 'verified' ? '<button class="manager-btn" id="officialBtn">Promote to Official</button>' : ''}
      ${['verified', 'official', 'pending'].includes(c.verification_status) ? '<button class="manager-btn" id="revokeBtn">Revoke verification</button>' : ''}
      <button class="manager-btn" id="archiveBtn">${d.archived ? 'Unarchive' : 'Archive'} core</button>
    </div>
    <div id="inviteOut"></div>

    <h3>External communities</h3>
    <table class="admin">${(c.external_communities || []).map((e) => `<tr><td>${esc(e.platform)}</td><td><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.url)}</a></td><td>${e.approx_size ? '~' + fmt(e.approx_size) : ''}</td></tr>`).join('')}</table>
    <form class="admin-form" id="extForm" style="grid-template-columns:1fr 2fr 1fr auto;grid-auto-flow:column;max-width:none">
      <select name="platform">${['facebook', 'tumblr', 'reddit', 'discord', 'tiktok', 'instagram', 'x', 'website', 'other'].map((p) => `<option>${p}</option>`).join('')}</select>
      <input name="url" placeholder="https://…" required>
      <input name="approx_size" type="number" placeholder="Size">
      <button class="compose-submit">Add</button>
    </form>

    <h3>Relationships</h3>
    <table class="admin">${(c.relationships || []).map((r) => `<tr><td>${esc(r.kind)}</td><td>${esc(r.name)}</td></tr>`).join('') || '<tr><td>None.</td></tr>'}</table>
    <form class="admin-form" id="relForm" style="grid-template-columns:1fr 1fr auto;grid-auto-flow:column;max-width:none">
      <select name="kind">${['parent', 'child', 'related', 'similar', 'opposing', 'overlapping', 'influenced_by', 'influences'].map((k) => `<option>${k}</option>`).join('')}</select>
      <input name="target_slug" placeholder="target core slug (e.g. weirdcore)" required>
      <button class="compose-submit">Link</button>
    </form>
    <p><button class="link-btn" id="backBtn">← Back to cores</button></p>`;

  const csv = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  main.querySelector('#coreForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/admin/cores/${slug}`, { method: 'PATCH', body: {
        definition: f.definition.value, description: f.description.value, history: f.history.value,
        cultural_context: f.cultural_context.value,
        visual_characteristics: csv(f.visual_characteristics.value), themes: csv(f.themes.value), keywords: csv(f.keywords.value),
      } });
      await api(`/admin/cores/${slug}/aliases`, { method: 'PUT', body: { aliases: csv(f.aliases.value) } });
      await api(`/admin/cores/${slug}/tags`, { method: 'PUT', body: { tags: csv(f.tags.value) } });
      editCore(slug);
    } catch (err) { alert(err.message); }
  });
  main.querySelector('#inviteBtn').addEventListener('click', async () => {
    const email = prompt('Invitee email (optional — leave blank to just get the link):') || '';
    try {
      const out = await api(`/admin/cores/${slug}/verification-invitations`, { method: 'POST', body: { invitee_email: email || undefined } });
      document.getElementById('inviteOut').innerHTML = `<div class="stat-card"><span>Secure invitation link (shown once — share it with the community representative):</span><p class="mono" style="word-break:break-all">${esc(out.url)}</p></div>`;
    } catch (err) { alert(err.message); }
  });
  main.querySelector('#officialBtn')?.addEventListener('click', async () => {
    try { await api(`/admin/cores/${slug}/status`, { method: 'POST', body: { status: 'official' } }); editCore(slug); } catch (err) { alert(err.message); }
  });
  main.querySelector('#revokeBtn')?.addEventListener('click', async () => {
    if (!confirm('Revoke verification and remove all managers for this core?')) return;
    try { await api(`/admin/cores/${slug}/revoke-verification`, { method: 'POST', body: {} }); editCore(slug); } catch (err) { alert(err.message); }
  });
  main.querySelector('#archiveBtn').addEventListener('click', async () => {
    try { await api(`/admin/cores/${slug}`, { method: 'PATCH', body: { archived: !d.archived } }); sections.cores(); } catch (err) { alert(err.message); }
  });
  main.querySelector('#extForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api(`/admin/cores/${slug}/external-communities`, { method: 'POST', body: { platform: f.platform.value, url: f.url.value, approx_size: f.approx_size.value } }); editCore(slug); }
    catch (err) { alert(err.message); }
  });
  main.querySelector('#relForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api(`/admin/cores/${slug}/relationships`, { method: 'POST', body: { kind: f.kind.value, target_slug: f.target_slug.value } }); editCore(slug); }
    catch (err) { alert(err.message); }
  });
  main.querySelector('#backBtn').addEventListener('click', () => sections.cores());
}

const user = await loadSession();
if (!user || user.role !== 'admin') {
  document.getElementById('gateMsg').textContent = user
    ? 'This area is restricted to CORE administrators.'
    : 'Please sign in with an administrator account.';
} else {
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  document.querySelectorAll('[data-section]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-section]').forEach((x) => x.classList.toggle('is-active', x === b));
    sections[b.dataset.section]();
  }));
  sections.dashboard();
}
