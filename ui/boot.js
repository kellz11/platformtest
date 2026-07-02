(() => {
  const app = document.getElementById('app');

  const showError = (error) => {
    const message = String(error?.message || error || 'The frontend could not be loaded.');
    console.error('CORE frontend bootstrap failed:', error);
    if (!app) return;
    app.innerHTML = `
      <div style="min-height:70vh;display:grid;place-items:center;padding:40px;font-family:Inter,system-ui,sans-serif;color:#111;background:#f6f6f5">
        <div style="max-width:620px;text-align:center">
          <h2 style="margin:0 0 12px">CORE could not finish loading</h2>
          <p style="margin:0 0 18px;color:#666;line-height:1.5">${message.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>
          <button type="button" onclick="location.reload()" style="border:1px solid #ddd;border-radius:999px;background:#fff;padding:11px 17px;font-weight:700;cursor:pointer">Reload</button>
        </div>
      </div>`;
  };

  window.addEventListener('error', (event) => {
    if (event?.error) showError(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => showError(event.reason));

  // Do not leave the entire interface blank if the initial session request stalls.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    let url = '';
    try { url = new URL(input instanceof Request ? input.url : String(input), location.href).pathname; }
    catch { url = String(input); }
    if (url === '/api/auth/me' && !init.signal) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      return nativeFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
    }
    return nativeFetch(input, init);
  };

  import('./app.js?v=36').catch(showError);
})();