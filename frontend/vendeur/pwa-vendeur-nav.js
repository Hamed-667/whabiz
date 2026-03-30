(function () {
  var currentPath = window.location.pathname || '';
  var rootPages = ['/vendeur/dashboard', '/vendeur/orders', '/vendeur/stats', '/vendeur/themes', '/vendeur/email'];

  if (rootPages.indexOf(currentPath) === -1) return;

  var navItems = [
    {
      href: '/vendeur/dashboard',
      label: 'Accueil',
      icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    {
      href: '/vendeur/orders',
      label: 'Commandes',
      icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 6h13l-1.4 7H8.4L7 6Zm0 0L6.2 3.5H3.5M9 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    },
    {
      href: '/vendeur/stats',
      label: 'Stats',
      icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 19.5h17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    },
    {
      href: '/vendeur/themes',
      label: 'Themes',
      icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5-.4-.9-.9-.9H17a2.5 2.5 0 1 1 0-5h2.6c.5 0 .9-.4.9-.9A8.2 8.2 0 0 0 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.8" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.7" r="1" fill="currentColor"/><circle cx="8.4" cy="15" r="1" fill="currentColor"/></svg>'
    },
    {
      href: '/vendeur/email',
      label: 'Config',
      icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 7 8 5 8-5M5 19h14a1 1 0 0 0 1-1V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    }
  ];

  function buildNav() {
    if (document.querySelector('.wb-mobile-nav')) return;
    if (!document.body) return;

    var nav = document.createElement('nav');
    nav.className = 'wb-mobile-nav';
    nav.setAttribute('aria-label', 'Navigation vendeur');

    nav.innerHTML = navItems.map(function (item) {
      var active = currentPath === item.href;
      return [
        '<a class="wb-mobile-nav__item' + (active ? ' is-active' : '') + '" href="' + item.href + '"' + (active ? ' aria-current="page"' : '') + '>',
        '<span class="wb-mobile-nav__icon">' + item.icon + '</span>',
        '<span class="wb-mobile-nav__label">' + item.label + '</span>',
        '</a>'
      ].join('');
    }).join('');

    document.body.appendChild(nav);
    document.body.classList.add('wb-mobile-nav-ready');
  }

  function createActionItem(original, label, icon, danger) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'wb-header-menu__action' + (danger ? ' wb-header-menu__action--danger' : '');
    item.innerHTML = '<span class="wb-header-menu__action-icon">' + icon + '</span><span>' + label + '</span>';
    item.addEventListener('click', function () {
      var href = original.getAttribute && original.getAttribute('href');
      var target = original.getAttribute && original.getAttribute('target');

      if (original.tagName === 'A' && href && href !== '#') {
        if (target === '_blank') {
          window.open(original.href, '_blank');
        } else {
          window.location.href = original.href;
        }
        return;
      }

      original.click();
    });
    return item;
  }

  function buildHeaderMenu() {
    var actions = document.querySelector('.header-right, .header-actions');
    if (!actions || actions.querySelector('.wb-header-menu')) return;

    var originals = Array.prototype.slice.call(actions.querySelectorAll(':scope > a, :scope > button'));
    if (!originals.length) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'wb-header-menu';
    wrapper.innerHTML = [
      '<button type="button" class="wb-header-menu__toggle" aria-label="Actions boutique" aria-expanded="false">',
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      '</button>',
      '<div class="wb-header-menu__panel" role="menu" aria-label="Actions boutique"></div>'
    ].join('');

    var toggle = wrapper.querySelector('.wb-header-menu__toggle');
    var panel = wrapper.querySelector('.wb-header-menu__panel');

    originals.forEach(function (original) {
      var text = (original.textContent || '').trim();
      var isDanger = /deconnexion|déconnexion/i.test(text);
      var icon = isDanger
        ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>';
      panel.appendChild(createActionItem(original, text, icon, isDanger));
    });

    function closeMenu() {
      wrapper.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = wrapper.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    panel.addEventListener('click', function () {
      closeMenu();
    });

    document.addEventListener('click', function (event) {
      if (!wrapper.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });

    actions.appendChild(wrapper);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      buildNav();
      buildHeaderMenu();
    }, { once: true });
  } else {
    buildNav();
    buildHeaderMenu();
  }
})();
