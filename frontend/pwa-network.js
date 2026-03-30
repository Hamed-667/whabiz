(function () {
  var BANNER_ID = 'pwaNetworkBanner';
  var hideTimer = null;

  function ensureBanner() {
    var existing = document.getElementById(BANNER_ID);
    if (existing) return existing;
    if (!document.body) return null;

    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'pwa-network-banner';
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML = [
      '<strong class="pwa-network-title"></strong>',
      '<span class="pwa-network-text"></span>'
    ].join('');

    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(kind, title, text, durationMs) {
    var banner = ensureBanner();
    if (!banner) return;

    banner.classList.remove('is-online', 'is-offline');
    banner.classList.add(kind === 'online' ? 'is-online' : 'is-offline', 'is-visible');
    banner.querySelector('.pwa-network-title').textContent = title;
    banner.querySelector('.pwa-network-text').textContent = text;

    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (durationMs > 0) {
      hideTimer = window.setTimeout(function () {
        banner.classList.remove('is-visible');
      }, durationMs);
    }
  }

  function handleOffline() {
    showBanner('offline', 'Mode hors ligne', 'Certaines pages deja ouvertes restent utilisables, mais les nouvelles donnees ne peuvent pas se charger.', 0);
  }

  function handleOnline() {
    showBanner('online', 'Connexion retablie', 'WhaBiz peut de nouveau synchroniser les donnees et charger les pages en direct.', 2600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBanner, { once: true });
  } else {
    ensureBanner();
  }

  window.addEventListener('offline', handleOffline);
  window.addEventListener('online', handleOnline);

  if (!navigator.onLine) {
    handleOffline();
  }
})();
