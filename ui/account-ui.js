// Auth + account views for the CORE platform, rendered inside the existing shell.
import { api, session, loadSession, badgeHtml } from './api.js';
import { escapeHtml } from './core-data.js';
import { footer, sidebar, topbar } from './shell.js';

const wrap = (inner, recent = [], view = 'home') =>
  `<div class="app-shell">${sidebar(view, recent)}<main class="content-shell">${topbar()}
   <section class="main-card section-card auth-card">${inner}</section>${footer()}</main></div>`;

const errBox = '<p class="form-error hidden" id="formError"></p>';
const showErr = (msg) => {
  const el = document.getElementById('formError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
};

// ── Login ─────────────────────────────────────────────────────────────────
export function loginView(recent) {
  return wrap(`
    <div class="auth-inner">
      <p class="kicker">Core Wiki</p><h1 class="section-page-title">Sign in</h1>
      <form class="auth-form" id="loginForm">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
        ${errBox}
        <button class="compose-submit is-wide" type="submit">Sign in</button>
      </form>
      <p class="auth-alt"><button class="link-btn" data-view="register" type="button">Create an account</button> · <button class="link-btn" data-view="forgot" type="button">Forgot password?</button></p>
    </div>`, recent);
}

export function wireLogin(goView, renderRoute) {
  document.getElementById('loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.target;
    try {
      await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      await loadSession();
      const next = sessionStorage.getItem('coreNext');
      sessionStorage.removeItem('coreNext');
      if (next) { history.pushState({}, '', next); renderRoute(); } else goView('home');
    } catch (err) { showErr(err.message); }
  });
}

// ── Register ──────────────────────────────────────────────────────────────
export function registerView(recent, joinContext = null) {
  return wrap(`
    <div class="auth-inner">
      ${joinContext ? `<div class="join-banner">${badgeHtml(joinContext.core.verification_status)}<p>You've been invited to join <strong>${escapeHtml(joinContext.core.name)}</strong> on CORE${joinContext.welcome_message ? ` — “${escapeHtml(joinContext.welcome_message)}”` : ''}.</p></div>` : ''}
      <p class="kicker">Core Wiki</p><h1 class="section-page-title">Create your account</h1>
      <p class="section-description">CORE is the home of internet-aesthetic communities. An account lets you join communities, post, and take part.</p>
      <form class="auth-form" id="registerForm">
        <label>Email<input name="email" type="email" required autocomplete="email"></label>
        <label>Username<input name="username" pattern="[A-Za-z0-9_]{3,24}" title="3–24 letters, numbers or underscores" required autocomplete="username"></label>
        <label>Display name (optional)<input name="display_name" maxlength="60"></label>
        <label>Password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        <label class="auth-consent"><input type="checkbox" name="accept_terms" required>
          <span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
        ${errBox}
        <button class="compose-submit is-wide" type="submit">Create account</button>
      </form>
      <p class="auth-alt">Already have an account? <button class="link-btn" data-view="login" type="button">Sign in</button></p>
    </div>`, recent);
}

export function wireRegister(goView) {
  document.getElementById('registerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.target;
    try {
      const out = await api('/auth/register', {
        method: 'POST',
        body: {
          email: f.email.value, username: f.username.value, display_name: f.display_name.value,
          password: f.password.value, accept_terms: f.accept_terms.checked,
          join_code: sessionStorage.getItem('coreJoinCode') || undefined,
        },
      });
      await loadSession();
      goView('checkEmail');
    } catch (err) { showErr(err.message); }
  });
}

export function checkEmailView(recent) {
  return wrap(`
    <div class="auth-inner">
      <p class="kicker">Core Wiki</p><h1 class="section-page-title">Check your email 📬</h1>
      <p class="section-description">We sent a verification link to <strong>${escapeHtml(session.user?.email || 'your inbox')}</strong>. Open it to finish setting up your account — then you can join communities and post.</p>
      <p class="auth-alt"><button class="link-btn" id="resendBtn" type="button">Resend the email</button></p>
    </div>`, recent);
}

export function wireCheckEmail() {
  document.getElementById('resendBtn')?.addEventListener('click', async (event) => {
    try { const out = await api('/auth/resend-verification', { method: 'POST' }); event.target.textContent = out.message; }
    catch (err) { event.target.textContent = err.message; }
  });
}

// ── Email verification landing ────────────────────────────────────────────
export function verifyView(recent) {
  return wrap(`<div class="auth-inner"><p class="kicker">Core Wiki</p>
    <h1 class="section-page-title" id="verifyTitle">Verifying…</h1>
    <p class="section-description" id="verifyCopy">One moment.</p>
    <div id="verifyActions"></div></div>`, recent);
}

export async function wireVerify(goView, navigateCore) {
  const token = new URL(location.href).searchParams.get('token');
  const title = document.getElementById('verifyTitle');
  const copy = document.getElementById('verifyCopy');
  const actions = document.getElementById('verifyActions');
  try {
    const out = await api('/auth/verify-email', { method: 'POST', body: { token } });
    await loadSession();
    title.textContent = 'You\'re in ✓';
    if (out.joined_core) {
      copy.innerHTML = `Your email is verified and you've joined <strong>${escapeHtml(out.joined_core.name)}</strong>.`;
      actions.innerHTML = `<button class="compose-submit" id="goCore" type="button">Open ${escapeHtml(out.joined_core.name)}</button>`;
      document.getElementById('goCore').addEventListener('click', () => navigateCore(out.joined_core.name));
    } else {
      copy.textContent = 'Your email is verified. Find a community and make yourself at home.';
      actions.innerHTML = '<button class="compose-submit" data-view="cores" type="button">Browse cores</button>';
    }
  } catch (err) {
    title.textContent = 'Link problem';
    copy.textContent = err.message;
  }
}

// ── Forgot / reset password ───────────────────────────────────────────────
export function forgotView(recent) {
  return wrap(`<div class="auth-inner"><p class="kicker">Core Wiki</p><h1 class="section-page-title">Reset password</h1>
    <form class="auth-form" id="forgotForm">
      <label>Email<input name="email" type="email" required></label>${errBox}
      <button class="compose-submit is-wide" type="submit">Send reset link</button></form>
    <p class="auth-alt" id="forgotDone"></p></div>`, recent);
}
export function wireForgot() {
  document.getElementById('forgotForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const out = await api('/auth/forgot-password', { method: 'POST', body: { email: event.target.email.value } });
      document.getElementById('forgotDone').textContent = out.message;
    } catch (err) { showErr(err.message); }
  });
}

export function resetView(recent) {
  return wrap(`<div class="auth-inner"><p class="kicker">Core Wiki</p><h1 class="section-page-title">Choose a new password</h1>
    <form class="auth-form" id="resetForm">
      <label>New password<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>${errBox}
      <button class="compose-submit is-wide" type="submit">Update password</button></form></div>`, recent);
}
export function wireReset(goView) {
  document.getElementById('resetForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = new URL(location.href).searchParams.get('token');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: event.target.password.value } });
      goView('login');
    } catch (err) { showErr(err.message); }
  });
}

// ── Account settings (incl. Advanced → Digital Wallet) ───────────────────
export function accountView(recent) {
  return wrap(`<div class="auth-inner is-wide">
    <p class="kicker">Core Wiki</p><h1 class="section-page-title">Account settings</h1>
    <div id="accountBody"><p class="feed-empty">Loading…</p></div></div>`, recent, 'home');
}

export async function wireAccount(goView) {
  const body = document.getElementById('accountBody');
  try {
    const s = await api('/account/settings');
    body.innerHTML = `
      <form class="auth-form" id="profileForm">
        <label>Email<input value="${escapeHtml(s.email)}" disabled></label>
        <label>Username<input value="@${escapeHtml(s.username)}" disabled></label>
        ${s.email_verified ? '' : '<p class="form-error">Your email isn\'t verified yet — check your inbox. <button class="link-btn" id="resendBtn" type="button">Resend</button></p>'}
        <label>Display name<input name="display_name" maxlength="60" value="${escapeHtml(s.profile.display_name || '')}"></label>
        <label>Bio<textarea name="bio" maxlength="500" rows="3">${escapeHtml(s.profile.bio || '')}</textarea></label>
        <label class="auth-consent"><input type="checkbox" name="is_private" ${s.profile.is_private ? 'checked' : ''}><span>Private profile (hide followed communities and posts from your public profile)</span></label>
        ${errBox}
        <button class="compose-submit" type="submit">Save changes</button>
        <span class="post-meta hidden" id="savedNote">Saved ✓</span>
      </form>
      <details class="advanced-block" id="advancedBlock">
        <summary>Advanced</summary>
        <div class="advanced-inner">
          <h4>Digital wallet</h4>
          <div id="walletBody"><button class="link-btn" id="loadWallet" type="button">Show wallet details</button></div>
          <h4 style="margin-top:22px">Sign out</h4>
          <button class="manager-btn" id="logoutBtn" type="button">Sign out of this device</button>
        </div>
      </details>`;

    document.getElementById('profileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = event.target;
      try {
        await api('/account/settings', { method: 'PATCH', body: { display_name: f.display_name.value, bio: f.bio.value, is_private: f.is_private.checked } });
        document.getElementById('savedNote').classList.remove('hidden');
        setTimeout(() => document.getElementById('savedNote')?.classList.add('hidden'), 2000);
      } catch (err) { showErr(err.message); }
    });

    document.getElementById('resendBtn')?.addEventListener('click', async (event) => {
      try { const out = await api('/auth/resend-verification', { method: 'POST' }); event.target.textContent = out.message; }
      catch (err) { event.target.textContent = err.message; }
    });

    document.getElementById('loadWallet')?.addEventListener('click', async () => {
      const walletBody = document.getElementById('walletBody');
      try {
        const w = await api('/account/wallet');
        walletBody.innerHTML = w.wallet ? `
          <p class="panel-copy">${escapeHtml(w.explanation)}</p>
          <div class="wallet-row"><code class="wallet-address">${escapeHtml(w.wallet.public_address)}</code>
          <button class="link-btn" id="copyWallet" type="button">Copy</button></div>
          <p class="post-meta">Status: ${escapeHtml(w.wallet.status)} · Created ${escapeHtml(w.wallet.created_at)}</p>`
          : '<p class="panel-copy">Your wallet will be provisioned shortly after email verification. Nothing is required from you.</p>';
        document.getElementById('copyWallet')?.addEventListener('click', (event) => {
          navigator.clipboard?.writeText(w.wallet.public_address).then(() => { event.target.textContent = 'Copied!'; });
        });
      } catch (err) { walletBody.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`; }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      const { logout } = await import('./api.js');
      await logout();
      goView('home');
    });
  } catch (err) {
    body.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
}

// ── Verification invitation claim ─────────────────────────────────────────
export function claimView(recent) {
  return wrap(`<div class="auth-inner is-wide"><p class="kicker">Core Wiki</p>
    <h1 class="section-page-title">Claim your community</h1>
    <div id="claimBody"><p class="feed-empty">Checking your invitation…</p></div></div>`, recent);
}

export async function wireClaim(goView, navigateCore) {
  const body = document.getElementById('claimBody');
  const code = new URL(location.href).searchParams.get('code');
  try {
    const { invitation } = await api(`/verification/invitations/${encodeURIComponent(code || '')}`);
    if (!session.user) {
      sessionStorage.setItem('coreNext', location.pathname + location.search);
      body.innerHTML = `<p class="section-description">CORE has invited you to represent <strong>${escapeHtml(invitation.core_name)}</strong>. Sign in or create an account to continue — then come back to this link.</p>
        <p><button class="compose-submit" data-view="register" type="button">Create account</button> <button class="manager-btn" data-view="login" type="button">Sign in</button></p>`;
      return;
    }
    body.innerHTML = `
      <p class="section-description">You've been invited to verify as a representative of <strong>${escapeHtml(invitation.core_name)}</strong>. Tell us about the community you run and include evidence a CORE administrator can check — for example a link to a post made from the community's official account containing this invitation, or moderator confirmation.</p>
      <form class="auth-form" id="claimForm">
        <label>Platform
          <select name="platform" required><option value="">Choose…</option>${['facebook', 'tumblr', 'reddit', 'discord', 'tiktok', 'instagram', 'x', 'website', 'other'].map((p) => `<option>${p}</option>`).join('')}</select></label>
        <label>Community URL<input name="community_url" type="url" placeholder="https://…"></label>
        <label>Approximate community size<input name="approx_size" type="number" min="0" placeholder="e.g. 250000"></label>
        <label>Evidence<textarea name="evidence_text" rows="4" maxlength="5000" placeholder="Describe how CORE can confirm you run this community…" required></textarea></label>
        <label>Evidence link (optional)<input name="evidence_url" type="url" placeholder="Link to a proof post"></label>
        ${errBox}
        <button class="compose-submit is-wide" type="submit">Submit for review</button>
      </form>
      <p class="post-meta">Your evidence is only visible to CORE administrators and is never displayed publicly.</p>`;
    document.getElementById('claimForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = event.target;
      try {
        const out = await api(`/verification/invitations/${encodeURIComponent(code)}/claim`, {
          method: 'POST',
          body: {
            platform: f.platform.value, community_url: f.community_url.value,
            approx_size: f.approx_size.value, evidence_text: f.evidence_text.value, evidence_url: f.evidence_url.value,
          },
        });
        body.innerHTML = `<p class="section-description">✓ ${escapeHtml(out.message)}</p><p class="post-meta">You'll get an email and a notification when it's reviewed.</p>`;
      } catch (err) { showErr(err.message); }
    });
  } catch (err) {
    body.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
}

// ── /join/<code> landing ──────────────────────────────────────────────────
export function joinView(recent) {
  return wrap(`<div class="auth-inner is-wide" id="joinBody"><p class="feed-empty">Loading invitation…</p></div>`, recent);
}

export async function wireJoin(goView, navigateCore) {
  const body = document.getElementById('joinBody');
  const code = window.__CORE_ROUTE__?.code || new URL(location.href).searchParams.get('join');
  try {
    const { link } = await api(`/referrals/join/${encodeURIComponent(code || '')}`);
    sessionStorage.setItem('coreJoinCode', link.code);
    const c = link.core;
    body.innerHTML = `
      <p class="kicker">You're invited</p>
      <h1 class="section-page-title">${escapeHtml(c.name)}</h1>
      <div class="community-meta-row">${badgeHtml(c.verification_status)}<span class="community-members">${new Intl.NumberFormat().format(c.member_count)} members on CORE</span></div>
      ${link.welcome_message ? `<blockquote class="join-welcome">“${escapeHtml(link.welcome_message)}”</blockquote>` : ''}
      ${c.definition ? `<p class="section-description">${escapeHtml(c.definition)}</p>` : ''}
      <div class="join-what"><strong>What is CORE?</strong> CORE is the index and home of internet-aesthetic communities — a permanent place where communities like ${escapeHtml(c.name)} keep their archive, their people, and their conversations. Free, no app required.</div>
      <p style="margin-top:18px">
        ${session.user
          ? `<button class="compose-submit" id="joinNow" type="button">Join ${escapeHtml(c.name)}</button>`
          : `<button class="compose-submit" data-view="register" type="button">Create account & join</button>
             <button class="manager-btn" data-view="login" type="button">I already have an account</button>`}
      </p>
      <p class="post-meta"><button class="link-btn" id="peekCore" type="button">Take a look at the community first →</button></p>`;
    document.getElementById('joinNow')?.addEventListener('click', async () => {
      try { await api(`/community/${c.slug}/join`, { method: 'POST' }); navigateCore(c.name); }
      catch (err) { alert(err.message); }
    });
    document.getElementById('peekCore')?.addEventListener('click', () => navigateCore(c.name));
  } catch (err) {
    body.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
}
