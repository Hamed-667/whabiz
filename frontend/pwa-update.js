(function () {
  var BANNER_ID = 'pwaUpdateBanner';
  var waitingWorker = null;
  var refreshTriggered = false;

  function ensureBanner() {
    var existing = document.getElementById(BANNER_ID);
    if (existing) return existing;
    if (!document.body) return null;

    var banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'pwa-update-banner';
    banner.innerHTML = [
      '<div class="pwa-update-copy">',
      '<strong class="pwa-update-title">Nouvelle version disponible</strong>',
      '<span class="pwa-update-text">Une mise a jour de WhaBiz est prete. Recharge l application pour profiter de la derniere version.</span>',
      '</div>',
      '<div class="pwa-update-actions">',
      '<button type="button" class="pwa-update-btn pwa-update-btn-secondary" data-action="later">Plus tard</button>',
      '<button type="button" class="pwa-update-btn pwa-update-btn-primary" data-action="refresh">Mettre a jour</button>',
      '</div>'
    ].join('');

    banner.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var action = button.getAttribute('data-action');
      if (action === 'later') hideBanner();
      if (action === 'refresh') applyUpdate();
    });

    document.body.appendChild(banner);
    return banner;
  }

  function showBanner(worker) {
    waitingWorker = worker || waitingWorker;
    var banner = ensureBanner();
    if (!banner) return;
    banner.classList.add('is-visible');
  }

  function hideBanner() {
    var banner = ensureBanner();
    if (!banner) return;
    banner.classList.remove('is-visible');
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  function trackInstallingWorker(registration, worker) {
    if (!worker) return;

    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showBanner(registration.waiting || worker);
      }
    });
  }

  function bindRegistration(registration) {
    if (!registration) return;

    if (registration.waiting) {
      showBanner(registration.waiting);
    }

    registration.addEventListener('updatefound', function () {
      trackInstallingWorker(registration, registration.installing);
    });
  }

  function init() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
      var registrationPromise = window.__whabizSwRegistrationPromise || navigator.serviceWorker.getRegistration('/service-worker.js');
      Promise.resolve(registrationPromise).then(bindRegistration).catch(function () {});
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshTriggered) return;
      refreshTriggered = true;
      window.location.reload();
    });

    window.addEventListener('online', function () {
      Promise.resolve(window.__whabizSwRegistrationPromise || navigator.serviceWorker.getRegistration('/service-worker.js'))
        .then(function (registration) {
          if (registration && typeof registration.update === 'function') {
            return registration.update();
          }
          return null;
        })
        .catch(function () {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBanner, { once: true });
  } else {
    ensureBanner();
  }

  init();
})();
