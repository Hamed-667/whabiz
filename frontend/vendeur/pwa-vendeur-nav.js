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

  var BADGE_REFRESH_INTERVAL_MS = 60000;
  var businessSnapshot = {
    awaitingActionOrders: 0,
    stockAlerts: [],
    lastUpdatedAt: 0,
    hadError: false
  };

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clickElement(selector) {
    var target = document.querySelector(selector);
    if (!target) return false;
    target.click();
    return true;
  }

  function formatBadgeCount(value) {
    var count = Math.max(0, Number(value || 0));
    if (!count) return '';
    if (count > 99) return '99+';
    return String(count);
  }

  function formatRelativeTime(timestamp) {
    var value = Number(timestamp || 0);
    if (!value) return 'Mise a jour en attente';

    var deltaSeconds = Math.max(0, Math.round((Date.now() - value) / 1000));
    if (deltaSeconds < 10) return "Mis a jour a l'instant";
    if (deltaSeconds < 60) return 'Mis a jour il y a ' + deltaSeconds + ' s';

    var deltaMinutes = Math.round(deltaSeconds / 60);
    if (deltaMinutes < 60) return 'Mis a jour il y a ' + deltaMinutes + ' min';

    var deltaHours = Math.round(deltaMinutes / 60);
    return 'Mis a jour il y a ' + deltaHours + ' h';
  }

  function notificationPriority(count, kind) {
    if (kind === 'orders') {
      if (count >= 5) return { label: 'Urgent', tone: 'danger' };
      if (count > 0) return { label: 'A traiter', tone: 'warning' };
      return { label: 'Stable', tone: 'neutral' };
    }

    if (count >= 3) return { label: 'Critique', tone: 'danger' };
    if (count > 0) return { label: 'Attention', tone: 'warning' };
    return { label: 'Stable', tone: 'neutral' };
  }

  function setNavBadge(href, count, tone) {
    var item = document.querySelector('.wb-mobile-nav__item[href="' + href + '"]');
    if (!item) return;

    var existing = item.querySelector('.wb-mobile-nav__badge');
    var text = formatBadgeCount(count);

    if (!text) {
      if (existing) existing.remove();
      item.classList.remove('has-badge');
      return;
    }

    if (!existing) {
      existing = document.createElement('span');
      existing.className = 'wb-mobile-nav__badge';
      item.appendChild(existing);
    }

    existing.className = 'wb-mobile-nav__badge' + (tone ? ' wb-mobile-nav__badge--' + tone : '');
    existing.textContent = text;
    item.classList.add('has-badge');
  }

  async function refreshBusinessBadges() {
    var vendeurId = localStorage.getItem('vendeurId');
    var apiFetch = window.authFetch || window.fetch;
    if (!vendeurId || typeof apiFetch !== 'function') return;

    try {
      var response = await apiFetch('/api/vendeurs/' + encodeURIComponent(vendeurId) + '/dashboard?periodDays=7');
      if (!response.ok) return;

      var payload = await response.json();
      var dashboard = payload && payload.dashboard ? payload.dashboard : {};
      var kpis = dashboard.kpis || {};
      var stockAlerts = Array.isArray(dashboard.stockAlerts) ? dashboard.stockAlerts : [];

      businessSnapshot.awaitingActionOrders = Number(kpis.awaitingActionOrders || 0);
      businessSnapshot.stockAlerts = stockAlerts.slice(0, 6);
      businessSnapshot.lastUpdatedAt = Date.now();
      businessSnapshot.hadError = false;

      setNavBadge('/vendeur/orders', businessSnapshot.awaitingActionOrders, 'success');
      setNavBadge('/vendeur/stats', businessSnapshot.stockAlerts.length, 'warning');
      updateNotificationCenter();
    } catch (error) {
      businessSnapshot.awaitingActionOrders = 0;
      businessSnapshot.stockAlerts = [];
      businessSnapshot.lastUpdatedAt = Date.now();
      businessSnapshot.hadError = true;
      setNavBadge('/vendeur/orders', 0);
      setNavBadge('/vendeur/stats', 0);
      updateNotificationCenter();
    }
  }

  function showQuickToast(message, tone) {
    if (!document.body) return;

    var existing = document.querySelector('.wb-quick-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'wb-quick-toast' + (tone ? ' wb-quick-toast--' + tone : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });

    window.setTimeout(function () {
      toast.classList.remove('is-visible');
      window.setTimeout(function () {
        toast.remove();
      }, 220);
    }, 2200);
  }

  async function shareShop() {
    var trigger = document.getElementById('viewShop');
    if (!trigger || !trigger.getAttribute('href') || trigger.getAttribute('href') === '#') {
      showQuickToast('Lien boutique indisponible', 'error');
      return;
    }

    var shopUrl = new URL(trigger.getAttribute('href'), window.location.origin).toString();
    var shopNameNode = document.querySelector('.shop-name');
    var shopName = shopNameNode ? shopNameNode.textContent.trim() : 'Ma boutique';

    try {
      if (navigator.share) {
        await navigator.share({
          title: shopName,
          text: 'Decouvrez ma boutique sur WhaBiz',
          url: shopUrl
        });
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shopUrl);
        showQuickToast('Lien boutique copie');
        return;
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }

    window.prompt('Copiez le lien de votre boutique', shopUrl);
  }

  function getQuickActions() {
    var actions = [];
    var viewShop = document.getElementById('viewShop');

    if (currentPath === '/vendeur/dashboard') {
      if (typeof window.openAddModal === 'function') {
        actions.push({
          label: 'Ajouter produit',
          icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
          onSelect: function () { window.openAddModal(); }
        });
      }
    }

    if (currentPath === '/vendeur/orders') {
      if (document.getElementById('refreshBtn')) {
        actions.push({
          label: 'Actualiser',
          icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2.2 5.5M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          onSelect: function () { clickElement('#refreshBtn'); }
        });
      }

      if (document.getElementById('exportBtn')) {
        actions.push({
          label: 'Exporter CSV',
          icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          onSelect: function () { clickElement('#exportBtn'); }
        });
      }
    }

    if (currentPath === '/vendeur/stats') {
      if (typeof window.loadData === 'function') {
        actions.push({
          label: 'Actualiser stats',
          icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2.2 5.5M20 4v7h-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
          onSelect: function () {
            Promise.resolve(window.loadData())
              .then(function () { showQuickToast('Statistiques actualisees'); })
              .catch(function () { showQuickToast('Actualisation impossible', 'error'); });
          }
        });
      }

      ['7', '30', '90'].forEach(function (days) {
        var selector = '.period-btn[data-days="' + days + '"]';
        if (!document.querySelector(selector)) return;
        actions.push({
          label: days + ' jours',
          icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
          onSelect: function () { clickElement(selector); }
        });
      });
    }

    if (currentPath === '/vendeur/themes' && typeof window.previewTheme === 'function') {
      actions.push({
        label: 'Previsualiser',
        icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
        onSelect: function () { window.previewTheme(); }
      });
    }

    if (currentPath === '/vendeur/email') {
      actions.push({
        label: 'Dashboard',
        icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        onSelect: function () { window.location.href = '/vendeur/dashboard'; }
      });
    }

    if (viewShop && viewShop.getAttribute('href') && viewShop.getAttribute('href') !== '#') {
      actions.push({
        label: 'Voir boutique',
        icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
        onSelect: function () {
          if (viewShop.target === '_blank') {
            window.open(viewShop.href, '_blank');
          } else {
            window.location.href = viewShop.href;
          }
        }
      });

      actions.push({
        label: 'Partager',
        icon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 12.5a3.5 3.5 0 1 0 0-1l9-4.5a3.5 3.5 0 1 0-.8-1.7L6 9.8a3.5 3.5 0 1 0 0 4.4l9.2 4.5a3.5 3.5 0 1 0 .8-1.7l-9-4.5Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        onSelect: function () { shareShop(); }
      });
    }

    return actions;
  }

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
      var isDanger = normalizeText(text).indexOf('deconnexion') !== -1;
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

  function notificationSummaryCount() {
    return Number(businessSnapshot.awaitingActionOrders || 0) + businessSnapshot.stockAlerts.length;
  }

  function buildNotificationRows() {
    var rows = [];
    var ordersPriority = notificationPriority(businessSnapshot.awaitingActionOrders, 'orders');
    var stockPriority = notificationPriority(businessSnapshot.stockAlerts.length, 'stock');

    if (businessSnapshot.awaitingActionOrders > 0) {
      rows.push(
        '<a class="wb-notify__row wb-notify__row--success" href="/vendeur/orders">' +
          '<span class="wb-notify__row-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 6h13l-1.4 7H8.4L7 6Zm0 0L6.2 3.5H3.5M9 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</span>' +
          '<span class="wb-notify__row-content">' +
            '<strong>' + formatBadgeCount(businessSnapshot.awaitingActionOrders) + ' commande(s) a traiter</strong>' +
            '<span class="wb-notify__pill wb-notify__pill--' + ordersPriority.tone + '">' + ordersPriority.label + '</span>' +
            '<span>Ouvrir le suivi des commandes</span>' +
          '</span>' +
        '</a>'
      );
    }

    if (businessSnapshot.stockAlerts.length) {
      businessSnapshot.stockAlerts.slice(0, 3).forEach(function (alert) {
        var label = String(alert && alert.nom || 'Produit');
        if (alert && alert.variant) {
          label += ' / ' + alert.variant;
        }

        rows.push(
          '<a class="wb-notify__row wb-notify__row--warning" href="/vendeur/stats">' +
            '<span class="wb-notify__row-icon">' +
              '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.2 4.6 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.8 4.6a2 2 0 0 0-3.5 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</span>' +
            '<span class="wb-notify__row-content">' +
              '<strong>' + escapeHtml(label) + '</strong>' +
              '<span class="wb-notify__pill wb-notify__pill--' + stockPriority.tone + '">' + stockPriority.label + '</span>' +
              '<span>Stock critique: ' + formatBadgeCount(alert && alert.stock || 0) + ' restant(s)</span>' +
            '</span>' +
          '</a>'
        );
      });
    }

    if (!rows.length) {
      rows.push(
        '<div class="wb-notify__empty">' +
          '<span class="wb-notify__empty-icon">' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 13 4 4L19 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</span>' +
          '<strong>Tout est sous controle</strong>' +
          '<span>Aucune urgence vendeuse pour le moment.</span>' +
        '</div>'
      );
    }

    return rows.join('');
  }

  function buildNotificationSummary() {
    var ordersPriority = notificationPriority(businessSnapshot.awaitingActionOrders, 'orders');
    var stockPriority = notificationPriority(businessSnapshot.stockAlerts.length, 'stock');
    var syncText = businessSnapshot.hadError ? 'Derniere synchro partielle' : formatRelativeTime(businessSnapshot.lastUpdatedAt);

    return [
      '<div class="wb-notify__summary">',
      '<span class="wb-notify__summary-chip wb-notify__summary-chip--' + ordersPriority.tone + '">Commandes: ' + formatBadgeCount(businessSnapshot.awaitingActionOrders) + '</span>',
      '<span class="wb-notify__summary-chip wb-notify__summary-chip--' + stockPriority.tone + '">Stock: ' + formatBadgeCount(businessSnapshot.stockAlerts.length) + '</span>',
      '<span class="wb-notify__summary-meta">' + syncText + '</span>',
      '</div>'
    ].join('');
  }

  function updateNotificationCenter() {
    var root = document.querySelector('.wb-notify');
    if (!root) return;

    var badge = root.querySelector('.wb-notify__badge');
    var body = root.querySelector('.wb-notify__body');
    var summary = root.querySelector('.wb-notify__summary-slot');
    var count = notificationSummaryCount();
    var text = formatBadgeCount(count);

    if (badge) {
      if (text) {
        badge.textContent = text;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    }

    if (body) {
      body.innerHTML = buildNotificationRows();
    }

    if (summary) {
      summary.innerHTML = buildNotificationSummary();
    }
  }

  function buildNotificationCenter() {
    var actions = document.querySelector('.header-right, .header-actions');
    if (!actions || actions.querySelector('.wb-notify')) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'wb-notify';
    wrapper.innerHTML = [
      '<button type="button" class="wb-notify__toggle" aria-label="Notifications vendeur" aria-expanded="false">',
      '<span class="wb-notify__toggle-icon">',
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '</span>',
      '<span class="wb-notify__badge" hidden></span>',
      '</button>',
      '<div class="wb-notify__panel" role="dialog" aria-label="Notifications vendeur">',
      '<div class="wb-notify__panel-header">',
      '<div><strong>Notifications</strong><span>Priorites boutique en direct</span></div>',
      '<div class="wb-notify__panel-actions">',
      '<button type="button" class="wb-notify__refresh" aria-label="Rafraichir">&#8635;</button>',
      '<button type="button" class="wb-notify__close" aria-label="Fermer">x</button>',
      '</div>',
      '</div>',
      '<div class="wb-notify__summary-slot"></div>',
      '<div class="wb-notify__body"></div>',
      '</div>'
    ].join('');

    var toggle = wrapper.querySelector('.wb-notify__toggle');
    var panel = wrapper.querySelector('.wb-notify__panel');
    var closeButton = wrapper.querySelector('.wb-notify__close');
    var refreshButton = wrapper.querySelector('.wb-notify__refresh');

    function closeNotifications() {
      wrapper.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    function openNotifications() {
      wrapper.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      if (wrapper.classList.contains('is-open')) {
        closeNotifications();
      } else {
        openNotifications();
      }
    });

    closeButton.addEventListener('click', function () {
      closeNotifications();
    });

    refreshButton.addEventListener('click', function () {
      refreshButton.classList.add('is-spinning');
      Promise.resolve(refreshBusinessBadges()).finally(function () {
        window.setTimeout(function () {
          refreshButton.classList.remove('is-spinning');
        }, 260);
      });
    });

    panel.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function (event) {
      if (!wrapper.contains(event.target)) {
        closeNotifications();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeNotifications();
    });

    actions.appendChild(wrapper);
    updateNotificationCenter();
  }

  function buildQuickActions() {
    if (document.querySelector('.wb-quick-actions')) return;
    if (!document.body) return;

    var actions = getQuickActions();
    if (!actions.length) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'wb-quick-actions';
    wrapper.innerHTML = [
      '<button type="button" class="wb-quick-actions__toggle" aria-label="Actions rapides" aria-expanded="false">',
      '<span class="wb-quick-actions__toggle-icon">+</span>',
      '<span class="wb-quick-actions__toggle-label">Actions</span>',
      '</button>',
      '<div class="wb-quick-actions__sheet" role="dialog" aria-label="Actions rapides vendeur">',
      '<div class="wb-quick-actions__sheet-header">',
      '<div><strong>Actions rapides</strong><span>Les gestes utiles sans quitter la page</span></div>',
      '<button type="button" class="wb-quick-actions__close" aria-label="Fermer">x</button>',
      '</div>',
      '<div class="wb-quick-actions__grid"></div>',
      '</div>'
    ].join('');

    var toggle = wrapper.querySelector('.wb-quick-actions__toggle');
    var sheet = wrapper.querySelector('.wb-quick-actions__sheet');
    var grid = wrapper.querySelector('.wb-quick-actions__grid');
    var closeButton = wrapper.querySelector('.wb-quick-actions__close');

    actions.forEach(function (action) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'wb-quick-actions__item';
      button.innerHTML = [
        '<span class="wb-quick-actions__item-icon">', action.icon, '</span>',
        '<span class="wb-quick-actions__item-label">', action.label, '</span>'
      ].join('');
      button.addEventListener('click', function () {
        closeQuickActions();
        action.onSelect();
      });
      grid.appendChild(button);
    });

    function closeQuickActions() {
      wrapper.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('wb-quick-actions-open');
    }

    function openQuickActions() {
      wrapper.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('wb-quick-actions-open');
    }

    toggle.addEventListener('click', function (event) {
      event.stopPropagation();
      if (wrapper.classList.contains('is-open')) {
        closeQuickActions();
      } else {
        openQuickActions();
      }
    });

    closeButton.addEventListener('click', function () {
      closeQuickActions();
    });

    sheet.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    document.addEventListener('click', function (event) {
      if (!wrapper.contains(event.target)) {
        closeQuickActions();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeQuickActions();
    });

    document.body.appendChild(wrapper);
  }

  function initBusinessBadges() {
    refreshBusinessBadges();

    window.setInterval(refreshBusinessBadges, BADGE_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        refreshBusinessBadges();
      }
    });

    window.addEventListener('focus', refreshBusinessBadges);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      buildNav();
      buildNotificationCenter();
      buildHeaderMenu();
      buildQuickActions();
      initBusinessBadges();
    }, { once: true });
  } else {
    buildNav();
    buildNotificationCenter();
    buildHeaderMenu();
    buildQuickActions();
    initBusinessBadges();
  }
})();
