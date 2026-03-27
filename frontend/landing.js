



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
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  });
})();


(function () {
  const btn  = document.getElementById('hamburger');
  const nav  = document.getElementById('navbar');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => nav.classList.toggle('nav-open'));

  nav.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => nav.classList.remove('nav-open'));
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

  elements.forEach(el => el.classList.add('reveal'));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const delay = entry.target.dataset.delay || 0;
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, Number(delay));

      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15 });

  elements.forEach(el => observer.observe(el));
})();

(function () {
  const heroTitle = document.querySelector('.hero-title');
  const heroSub = document.querySelector('.hero-subtitle');
  if (heroTitle && heroVariant === 'B') {
    heroTitle.textContent = 'Lancez votre boutique WhatsApp en 24h';
  }
  if (heroSub && heroVariant === 'B') {
    heroSub.textContent = 'Transformez vos ventes locales avec une boutique rapide, visible et prête à encaisser.';
  }
  trackExperiment('page_view', { path: window.location.pathname });
  trackAnalyticsEvent('landing_view', { variant: heroVariant });
})();


(function () {
  const form    = document.getElementById('inscriptionForm');
  const success = document.getElementById('successMessage');
  if (!form || !success) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const data = {
      nom:      document.getElementById('vendeurNom').value,
      boutique: document.getElementById('vendeurBoutique').value,
      tel:      document.getElementById('vendeurTel').value,
      email:    document.getElementById('vendeurEmail').value,
      plan:     document.getElementById('vendeurPlan').value,
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

      if (response.ok) {
        const payload = await response.json();
        const vendeur = payload.vendeur || payload;
        trackAnalyticsEvent('signup_success', { vendeurId: vendeur.id || null, slug: vendeur.slug || '' });
        trackExperiment('signup_success', { slug: vendeur.slug || '' });

        
        const WHABIZ_NUMERO = '22654576629';

        const msg =
          '🛍️ *Nouvelle demande de boutique WhaBiz*\n\n' +
          '*Nom :* ' + data.nom + '\n' +
          '*Boutique :* ' + data.boutique + '\n' +
          '*Tel :* ' + data.tel + '\n' +
          (data.email ? '*Email :* ' + data.email + '\n' : '') +
          '*Plan :* ' + data.plan + '\n' +
          (data.produits ? '*Produits :* ' + data.produits + '\n' : '') +
          '\n*Lien boutique :* ' + window.location.origin + '/' + vendeur.slug;

        const url = 'https://wa.me/' + WHABIZ_NUMERO + '?text=' + encodeURIComponent(msg);
        window.open(url, '_blank');

        form.style.display   = 'none';
        success.classList.add('show');
      } else {
        alert('❌ Erreur lors de l\'inscription. Réessayez.');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur de connexion. Vérifiez votre internet.');
    }
  });
})();


(function () {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const offset = 70;
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();

/* --- Compteur Animé --- */
(function() {
  const counter = document.getElementById('shopCounter');
  if (!counter) return;

  const target = 142; // Nombre final à afficher
  const duration = 2000; // Durée en ms
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease out
    
    const current = Math.floor(start + (target - start) * ease);
    counter.textContent = '+' + current;

    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
})();


(function () {
  const phone = document.querySelector('.hero-mockup');
  if (!phone) return;

  let ticking = false;
  let mouseX = 0;
  let mouseY = 0;

  
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function updatePhonePosition() {
    const scrolled = window.scrollY;
    const heroHeight = document.querySelector('.hero')?.offsetHeight || 0;
    
    if (scrolled < heroHeight) {
      
      const translateY = scrolled * 0.3;
      const rotation = scrolled * 0.02;
      const scale = 1 - (scrolled * 0.0002);
      
      
      const rotateY = mouseX * 10; 
      const rotateX = -mouseY * 10; 
      
      phone.style.transform = `
        translateY(${translateY}px) 
        rotateZ(${rotation}deg) 
        rotateY(${rotateY}deg) 
        rotateX(${rotateX}deg) 
        scale(${Math.max(scale, 0.85)})
      `;
      phone.style.opacity = Math.max(1 - (scrolled / heroHeight), 0.3);
    }
    
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      window.requestAnimationFrame(updatePhonePosition);
      ticking = true;
    }
  }

  window.addEventListener('scroll', requestTick);
  
  
  document.addEventListener('mousemove', requestTick);
  
  
  requestTick();
})();

/* --- FAQ Accordion --- */
(function() {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      // Fermer les autres (optionnel, pour effet accordéon strict)
      document.querySelectorAll('.faq-item').forEach(i => {
        if (i !== item) i.classList.remove('active');
      });
      item.classList.toggle('active');
    });
  });
})();

/* --- Avatars Aléatoires (Thème Afrique) --- */
(function() {
  const avatars = document.querySelectorAll('.proof-avatars img.proof-avatar');
  if (avatars.length === 0) return;

  // Liste d'images Unsplash (Portraits type africain/burkinabé)
  const africanPortraits = [
    'photo-1531123897727-8f129e1688ce', // Femme fond jaune
    'photo-1506277886164-e25aa3f4ef7f', // Homme
    'photo-1589156280159-27698a70f29e', // Femme souriante
    'photo-1572561300743-2dd367ed0c9a', // Femme tresses
    'photo-1534528741775-53994a69daeb', // Femme portrait
    'photo-1507003211169-0a1dd7228f2d', // Homme
    'photo-1522512115668-c09775d6f424', // Homme
    'photo-1531384441138-2736e62e0919', // Homme
    'photo-1542596594-649edbc13630', // Femme
    'photo-1567532939604-b6b5b0db2604', // Femme
    'photo-1504199367641-aba8151af406'  // Femme
  ];

  // Mélanger le tableau de façon aléatoire
  const shuffled = africanPortraits.sort(() => 0.5 - Math.random());

  // Appliquer les images aux balises img
  avatars.forEach((img, index) => {
    if (shuffled[index]) {
      img.src = `https://images.unsplash.com/${shuffled[index]}?auto=format&fit=crop&w=150&q=80`;
    }
  });
})();

/* --- Avatars Aléatoires Témoignages --- */
(function() {
  const testimonialAvatars = document.querySelectorAll('.temoignage-card .t-avatar');
  if (testimonialAvatars.length === 0) return;

  const africanPortraits = [
    'photo-1531123897727-8f129e1688ce', 'photo-1506277886164-e25aa3f4ef7f',
    'photo-1589156280159-27698a70f29e', 'photo-1572561300743-2dd367ed0c9a',
    'photo-1534528741775-53994a69daeb', 'photo-1507003211169-0a1dd7228f2d',
    'photo-1522512115668-c09775d6f424', 'photo-1531384441138-2736e62e0919',
    'photo-1542596594-649edbc13630', 'photo-1567532939604-b6b5b0db2604',
    'photo-1504199367641-aba8151af406'
  ];

  // Mélanger pour éviter la répétition avec les avatars du hero
  const shuffled = africanPortraits.sort(() => 0.5 - Math.random());
  const usedInHero = 3; // Nombre d'avatars dans la section hero

  testimonialAvatars.forEach((img, index) => {
    const imageIndex = usedInHero + index;
    if (shuffled[imageIndex]) {
      img.src = `https://images.unsplash.com/${shuffled[imageIndex]}?auto=format&fit=crop&w=100&q=80`;
    }
  });
})();
