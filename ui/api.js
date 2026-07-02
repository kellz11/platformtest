// Thin API client + session cache for the CORE platform backend.
export const session = { user: null, loaded: false };

export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, headers: {}, credentials: 'same-origin' };
  if (form) options.body = form;
  else if (body !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, options);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function loadSession() {
  try {
    const data = await api('/auth/me');
    session.user = data.user;
  } catch { session.user = null; }
  session.loaded = true;
  return session.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  session.user = null;
}

export const coreSlug = (name) =>
  String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const timeAgo = (iso) => {
  const t = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};

export const BADGES = {
  pending: { label: 'Community verification pending', cls: 'is-pending' },
  verified: { label: 'Verified community', cls: 'is-verified' },
  official: { label: 'Official CORE community', cls: 'is-official' },
};

export function badgeHtml(status, compact = false) {
  const b = BADGES[status];
  if (!b) return '';
  return `<span class="core-badge ${b.cls}${compact ? ' is-compact' : ''}" title="${b.label}"><span class="core-badge-dot"></span>${compact ? b.label.replace('Community verification pending', 'Verification pending') : b.label}</span>`;
}
