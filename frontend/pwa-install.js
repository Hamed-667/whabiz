(function () {
  var BUTTON_ID = 'pwaInstallBtn';
  var MODAL_ID = 'pwaInstallModal';
  var deferredPrompt = null;
  var modalContent = {
    title: 'Installer WhaBiz',
    description: '',
    steps: []
  };

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isAndroid() {
    return /android/i.test(window.navigator.userAgent || '');
  }

  function isIos() {
    var ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function isChromiumMobile() {
    var ua = window.navigator.userAgent;
    return isAndroid() && /Chrome|CriOS|EdgA|SamsungBrowser/i.test(ua);
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
      '<h3 id="pwaInstallTitle"></h3>',
      '<p id="pwaInstallDescription"></p>',
      '<ol id="pwaInstallSteps"></ol>',
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
    var modal = ensureModal();
    modal.querySelector('#pwaInstallTitle').textContent = modalContent.title;
    modal.querySelector('#pwaInstallDescription').textContent = modalContent.description;
    modal.querySelector('#pwaInstallSteps').innerHTML = modalContent.steps
      .map(function (step) {
        return '<li>' + step + '</li>';
      })
      .join('');
    modal.classList.remove('is-hidden');
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
    if (isAndroid() && isChromiumMobile()) {
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

    if (isAndroid() && isChromiumMobile()) {
      modalContent = {
        title: 'Installer WhaBiz sur Android',
        description: 'Sur Android, Chrome peut parfois ne pas afficher le prompt tout de suite. L installation reste possible depuis le menu du navigateur.',
        steps: [
          'Ouvre cette page dans Chrome ou Samsung Internet.',
          'Touche le menu du navigateur en haut a droite.',
          'Choisis Installer l application ou Ajouter a l ecran d accueil.',
          'Valide puis ouvre WhaBiz depuis son icone.'
        ]
      };
      showModal();
      return;
    }

    if (isIos() && isSafari()) {
      modalContent = {
        title: 'Installer WhaBiz sur iPhone',
        description: 'Sur iPhone, l installation se fait depuis Safari. Une fois ajoutee a l ecran d accueil, l application s ouvre comme une vraie app web.',
        steps: [
          'Ouvre cette page dans Safari.',
          'Touche Partager.',
          'Choisis Ajouter a l ecran d accueil.',
          'Valide, puis ouvre WhaBiz depuis son icone.'
        ]
      };
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
