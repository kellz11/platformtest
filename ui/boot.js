(() => {
  const app = document.getElementById('app');

  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const showError = (error) => {
    const message = String(error?.message || error || 'The frontend could not be loaded.');
    console.error('CORE frontend bootstrap failed:', error);
    if (!app) return;
    app.innerHTML = `
      <div style="min-height:70vh;display:grid;place-items:center;padding:40px;font-family:Inter,system-ui,sans-serif;color:#111;background:#f6f6f5">
        <div style="max-width:680px;text-align:center">
          <h2 style="margin:0 0 12px">CORE could not finish loading</h2>
          <p style="margin:0 0 18px;color:#666;line-height:1.5">${escape(message)}</p>
          <button type="button" id="coreReload" style="border:1px solid #ddd;border-radius:999px;background:#fff;padding:11px 17px;font-weight:700;cursor:pointer">Reload</button>
        </div>
      </div>`;
    document.getElementById('coreReload')?.addEventListener('click', () => location.reload());
  };

  window.addEventListener('error', (event) => {
    if (event?.error) showError(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => showError(event.reason));

  // Prevent the initial session request from holding the whole interface open forever.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let pathname = '';
    try { pathname = new URL(input instanceof Request ? input.url : String(input), location.href).pathname; }
    catch { pathname = String(input); }
    if (pathname === '/api/auth/me' && !init.signal) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      return nativeFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
    }
    return nativeFetch(input, init);
  };

  const script = document.createElement('script');
  script.src = '/ui/app.bundle.js?v=1';
  script.defer = true;
  script.addEventListener('error', () => showError('The bundled frontend could not be loaded. Make sure the latest Render deployment has finished.'));
  document.head.appendChild(script);
})();