(() => {
  function cleanPage() {
    document.querySelectorAll('.core-page-source,.core-gallery-meta p').forEach((node) => node.remove());

    document.querySelectorAll('a,p,span,div').forEach((node) => {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Original Aesthetics Wiki article$/i.test(text)) node.remove();
      if (/^\d+ images? from this article(?:'s|s) Fandom gallery$/i.test(text)) node.remove();
      if (/^\d+ images? from this article(?:'s|s) gallery$/i.test(text)) node.remove();
    });
  }

  const start = () => {
    cleanPage();
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(cleanPage).observe(app, { childList: true, subtree: true });
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', start, { once: true })
    : start();
})();
