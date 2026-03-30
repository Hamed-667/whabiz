(function () {
  var OVERLAY_ID = 'pwaLaunchOverlay';
  var MIN_VISIBLE_MS = 420;
  var MAX_VISIBLE_MS = 2200;
  var startedAt = Date.now();
  var finished = false;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isPwaEntry() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('source') === 'pwa';
    } catch (error) {
      return false;
    }
  }

  function hasExternalReferrer() {
    if (!document.referrer) return true;

    try {
      return new URL(document.referrer).origin !== window.location.origin;
    } catch (error) {
      return true;
    }
  }

  function shouldShowLaunchOverlay() {
    if (isPwaEntry()) return true;
    if (!isStandalone()) return false;
    return hasExternalReferrer();
  }

  function getContextLabel() {
    var path = window.location.pathname || '/';
    if (path === '/' || path === '/index.html') return 'Accueil WhaBiz';
    if (path.indexOf('/vendeur') === 0) return 'Espace vendeur';
    if (path.indexOf('/admin') === 0) return 'Espace admin';
    return 'Boutique WhaBiz';
  }

  function ensureOverlay() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) return existing;
    if (!document.body) return null;

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'pwa-launch-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="pwa-launch-card">',
      '<div class="pwa-launch-brand">',
      '<div class="pwa-launch-ring"></div>',
      '<div class="pwa-launch-logo">W</div>',
      '</div>',
      '<p class="pwa-launch-title">WhaBiz</p>',
      '<p class="pwa-launch-subtitle">' + getContextLabel() + '</p>',
      '<div class="pwa-launch-loader"></div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    document.documentElement.classList.add('pwa-launching');
    return overlay;
  }

  function hideOverlay() {
    if (finished) return;
    finished = true;

    var elapsed = Date.now() - startedAt;
    var waitMs = Math.max(0, MIN_VISIBLE_MS - elapsed);

    window.setTimeout(function () {
      var overlay = document.getElementById(OVERLAY_ID);
      document.documentElement.classList.remove('pwa-launching');
      if (!overlay) return;
      overlay.classList.add('is-hiding');
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 320);
    }, waitMs);
  }

  if (!shouldShowLaunchOverlay()) return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureOverlay, { once: true });
  } else {
    ensureOverlay();
  }

  window.addEventListener('load', hideOverlay, { once: true });
  window.setTimeout(hideOverlay, MAX_VISIBLE_MS);
})();
