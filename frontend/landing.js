function isPwaLaunchContext() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('source') === 'pwa') return true;
  } catch (e) {}

  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getPreferredLaunchTarget() {
  return String(localStorage.getItem('whabizLaunchTarget') || '').toLowerCase();
}

function hasVendorSession() {
  return Boolean(localStorage.getItem('vendeurToken') && localStorage.getItem('vendeurId'));
}

async function hasAdminSession() {
  try {
    var res = await fetch('/api/auth/admin/session', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    });
    return res.ok;
  } catch (error) {
    return false;
  }
}

const landingPerf = (function () {
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var saveData = Boolean(window.navigator.connection && window.navigator.connection.saveData);
  var narrowScreen = window.innerWidth < 960;

  return {
    reducedMotion: reducedMotion,
    lowPower: reducedMotion || saveData || (coarsePointer && narrowScreen),
    richMotion: !reducedMotion && !saveData && !coarsePointer && window.innerWidth >= 1024
  };
})();

document.documentElement.classList.toggle('landing-low-motion', landingPerf.lowPower);

(async function () {
  if (!isPwaLaunchContext()) return;

  var preferred = getPreferredLaunchTarget();
  var vendorReady = hasVendorSession();

  if (preferred === 'vendeur' && vendorReady) {
    window.location.replace('/vendeur/dashboard');
    return;
  }

  if (preferred === 'admin') {
    if (await hasAdminSession()) {
      window.location.replace('/admin');
      return;
    }
    if (vendorReady) {
      window.location.replace('/vendeur/dashboard');
      return;
    }
    window.location.replace('/admin/login?source=pwa');
    return;
  }

  if (vendorReady) {
    window.location.replace('/vendeur/dashboard');
    return;
  }

  if (await hasAdminSession()) {
    window.location.replace('/admin');
    return;
  }

  window.location.replace('/vendeur?source=pwa');
})();

const landingSession = localStorage.getItem('landingSession') || ('land_' + Date.now() + '_' + Math.random().toString(16).slice(2));
localStorage.setItem('landingSession', landingSession);

const heroExperiment = 'landing-hero-v1';
const heroVariant = localStorage.getItem(heroExperiment) || (Math.random() < 0.5 ? 'A' : 'B');
localStorage.setItem(heroExperiment, heroVariant);

function trackAnalyticsEvent(eventName, metadata) {
  try {
    fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        eventName: eventName,
        sessionId: landingSession,
        metadata: metadata || {}
      })
    });
  } catch (e) {}
}

function trackExperiment(eventName, metadata) {
  try {
    fetch('/api/experiments/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        experimentId: heroExperiment,
        variant: heroVariant,
        eventName: eventName,
        sessionId: landingSession,
        metadata: metadata || {}
      })
    });
  } catch (e) {}
}

(function () {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let isScrolled = null;

  function syncNavbarState() {
    const nextState = window.scrollY > 30;
    if (nextState === isScrolled) return;
    nav.classList.toggle('scrolled', nextState);
    isScrolled = nextState;
  }

  window.addEventListener('scroll', syncNavbarState, { passive: true });
  syncNavbarState();
})();

(function () {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('navbar');
  if (!btn || !nav) return;

  btn.addEventListener('click', function () {
    nav.classList.toggle('nav-open');
  });

  nav.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('nav-open');
    });
  });
})();

(function () {
  const selectors = [
    '.avantage-card',
    '.etape',
    '.carte-prix',
    '.form-wrapper',
    '.temoignage-card',
    '.faq-item'
  ];
  const elements = document.querySelectorAll(selectors.join(','));

  elements.forEach(function (el) {
    el.classList.add('reveal');
  });

  if (landingPerf.lowPower || typeof IntersectionObserver === 'undefined') {
    elements.forEach(function (el) {
      el.classList.add('visible');
    });
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var delay = Math.min(Number(entry.target.dataset.delay || 0), 220);
      entry.target.style.transitionDelay = delay + 'ms';
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  elements.forEach(function (el) {
    observer.observe(el);
  });
})();

(function () {
  const heroTitle = document.querySelector('.hero-title');
  const heroSub = document.querySelector('.hero-sub');

  if (heroTitle && heroVariant === 'B') {
    heroTitle.textContent = 'Lancez votre boutique WhatsApp en 24h';
  }
  if (heroSub && heroVariant === 'B') {
    heroSub.textContent = 'Transformez vos ventes locales avec une boutique rapide, visible et prete a encaisser.';
  }

  trackExperiment('page_view', { path: window.location.pathname });
  trackAnalyticsEvent('landing_view', { variant: heroVariant });
})();

(function () {
  const form = document.getElementById('inscriptionForm');
  const success = document.getElementById('successMessage');
  if (!form || !success) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const data = {
      nom: document.getElementById('vendeurNom').value,
      boutique: document.getElementById('vendeurBoutique').value,
      tel: document.getElementById('vendeurTel').value,
      email: document.getElementById('vendeurEmail').value,
      plan: document.getElementById('vendeurPlan').value,
      produits: document.getElementById('vendeurProduits').value
    };

    trackExperiment('signup_submit', { plan: data.plan });
    trackAnalyticsEvent('signup_submit', { plan: data.plan });

    try {
      const response = await fetch('/api/vendeurs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        alert("Erreur lors de l'inscription. Reessayez.");
        return;
      }

      const payload = await response.json();
      const vendeur = payload.vendeur || payload;
      trackAnalyticsEvent('signup_success', { vendeurId: vendeur.id || null, slug: vendeur.slug || '' });
      trackExperiment('signup_success', { slug: vendeur.slug || '' });

      const phoneNumber = '22654576629';
      const msg =
        '*Nouvelle demande de boutique WhaBiz*\n\n' +
        '*Nom :* ' + data.nom + '\n' +
        '*Boutique :* ' + data.boutique + '\n' +
        '*Tel :* ' + data.tel + '\n' +
        (data.email ? '*Email :* ' + data.email + '\n' : '') +
        '*Plan :* ' + data.plan + '\n' +
        (data.produits ? '*Produits :* ' + data.produits + '\n' : '') +
        '\n*Lien boutique :* ' + window.location.origin + '/' + vendeur.slug;

      window.open('https://wa.me/' + phoneNumber + '?text=' + encodeURIComponent(msg), '_blank');
      form.style.display = 'none';
      success.classList.add('show');
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion. Verifiez votre internet.');
    }
  });
})();

(function () {
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = 70;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });
})();

(function () {
  const counter = document.getElementById('shopCounter');
  if (!counter) return;

  function startCounter() {
    if (counter.dataset.started === '1') return;
    counter.dataset.started = '1';

    const target = 142;
    const duration = landingPerf.lowPower ? 900 : 1600;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * ease);
      counter.textContent = '+' + current;

      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  if (landingPerf.lowPower || typeof IntersectionObserver === 'undefined') {
    startCounter();
    return;
  }

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      startCounter();
      observer.disconnect();
    });
  }, { threshold: 0.35 });

  observer.observe(counter);
})();

(function () {
  const phone = document.querySelector('.hero-mockup');
  const hero = document.querySelector('.hero');
  if (!phone || !hero) return;

  if (!landingPerf.richMotion) {
    phone.classList.add('hero-mockup-static');
    return;
  }

  let rafId = 0;

  function updatePhonePosition() {
    const heroHeight = hero.offsetHeight || 0;
    const scrolled = window.scrollY;
    const progress = heroHeight ? Math.min(scrolled / heroHeight, 1) : 0;
    const translateY = Math.min(scrolled * 0.14, 28);
    const rotation = Math.min(scrolled * 0.01, 2.8);
    const scale = 1 - Math.min(progress * 0.05, 0.05);

    phone.style.transform = 'translate3d(0, ' + translateY + 'px, 0) rotateZ(' + rotation + 'deg) scale(' + scale + ')';
    phone.style.opacity = String(Math.max(1 - progress * 0.3, 0.72));
    rafId = 0;
  }

  function requestTick() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(updatePhonePosition);
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  requestTick();
})();

(function () {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach(function (question) {
    question.addEventListener('click', function () {
      const item = question.parentElement;
      document.querySelectorAll('.faq-item').forEach(function (otherItem) {
        if (otherItem !== item) otherItem.classList.remove('active');
      });
      item.classList.toggle('active');
    });
  });
})();
