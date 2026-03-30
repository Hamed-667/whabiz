(function () {
  var BUTTON_ID = 'pwaInstallBtn';
  var MODAL_ID = 'pwaInstallModal';
  var deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIos() {
    var ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function isSafari() {
    var ua = window.navigator.userAgent;
    return /Safari/i.test(ua) && !/Chrome|CriOS|EdgiOS|FxiOS|OPiOS|Android/i.test(ua);
  }

  function ensureButton() {
    var button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'pwa-install-btn is-hidden';
    button.setAttribute('aria-live', 'polite');
    button.textContent = 'Installer WhaBiz';
    button.addEventListener('click', onInstallClick);
    document.body.appendChild(button);
    return button;
  }

  function ensureModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'pwa-install-modal is-hidden';
    modal.innerHTML = [
      '<div class="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">',
      '<h3 id="pwaInstallTitle">Installer WhaBiz sur iPhone</h3>',
      '<p>Sur iPhone, l installation se fait depuis Safari. Une fois ajoutee a l ecran d accueil, l application s ouvre comme une vraie app web.</p>',
      '<ol>',
      '<li>Ouvre cette page dans Safari.</li>',
      '<li>Touche Partager.</li>',
      '<li>Choisis Ajouter a l ecran d accueil.</li>',
      '<li>Valide, puis ouvre WhaBiz depuis son icone.</li>',
      '</ol>',
      '<div class="pwa-install-actions">',
      '<button type="button" class="pwa-install-close">Fermer</button>',
      '</div>',
      '</div>'
    ].join('');

    modal.addEventListener('click', function (event) {
      if (event.target === modal) hideModal();
    });
    modal.querySelector('.pwa-install-close').addEventListener('click', hideModal);
    document.body.appendChild(modal);
    return modal;
  }

  function showButton(label) {
    var button = ensureButton();
    button.textContent = label;
    button.classList.remove('is-hidden');
  }

  function hideButton() {
    var button = ensureButton();
    button.classList.add('is-hidden');
  }

  function showModal() {
    ensureModal().classList.remove('is-hidden');
  }

  function hideModal() {
    ensureModal().classList.add('is-hidden');
  }

  function updateInstallUi() {
    if (isStandalone()) {
      hideButton();
      hideModal();
      return;
    }
    if (deferredPrompt) {
      showButton('Installer WhaBiz');
      return;
    }
    if (isIos() && isSafari()) {
      showButton('Ajouter a l ecran');
      return;
    }
    hideButton();
  }

  async function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (_) {
      }
      deferredPrompt = null;
      updateInstallUi();
      return;
    }

    if (isIos() && isSafari()) {
      showModal();
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function (error) {
        console.warn('[pwa] service worker registration failed:', error && error.message ? error.message : error);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureButton();
    ensureModal();
    updateInstallUi();
  });

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallUi();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    updateInstallUi();
  });

  registerServiceWorker();
})();
