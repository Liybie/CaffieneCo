gsap.registerPlugin(ScrollTrigger);

const IMAGE_FALLBACKS = {
  hero: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1920&q=85',
  specialty: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=85',
  gallery: [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1453614512565-c196108b1718?auto=format&fit=crop&w=800&q=85',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=85'
  ]
};

let lenis;
let preloaderDone = false;
let dataLoaded = false;

document.addEventListener('DOMContentLoaded', async () => {
  const locked = await checkSiteLock();
  if (locked) return;

  initPreloader();
  initCursor();
  initMobileMenu();
  initDiscountForm();

  initBorderGlowElements();

  await loadShopData();
  dataLoaded = true;
  tryFinishPreloader();

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    initLenis();
    initHeroAnimations();
    initScrollAnimations();
    initParallax();
    initMagneticButtons();
    initPrimeEffects();
    initCoffeeEffects();
    initCardTilt();
    ScrollTrigger.refresh();
  } else {
    document.querySelectorAll('.reveal-up, .reveal-scale, .reveal-blur, .hero-word, .hero-lead, .hero-cta, .split-word-inner, .discount-title-line').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
    });
    document.querySelectorAll('.panel').forEach(el => {
      el.style.filter = 'none';
      el.style.clipPath = 'none';
    });
    document.getElementById('preloader')?.classList.add('done');
  }
});

function initPreloader() {
  const fill = document.getElementById('preloaderFill');
  const count = document.getElementById('preloaderCount');
  let progress = 0;

  const tick = setInterval(() => {
    progress += Math.random() * 14 + 6;
    if (progress >= 100) {
      progress = 100;
      clearInterval(tick);
      preloaderDone = true;
      tryFinishPreloader();
    }
    fill.style.width = progress + '%';
    count.textContent = String(Math.floor(progress)).padStart(3, '0');
  }, 100);
}

function tryFinishPreloader() {
  if (!preloaderDone || !dataLoaded) return;
  const preloader = document.getElementById('preloader');
  setTimeout(() => {
    preloader?.classList.add('done');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runHeroEntrance();
    }
  }, 350);
}

/* ---- Data ---- */
async function checkSiteLock() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    if (data.locked) {
      window.location.href = '/locked.html';
      return true;
    }
  } catch { /* continue if status check fails */ }
  return false;
}

async function loadShopData() {
  try {
    const res = await fetch('/api/shop');
    const data = await res.json();
    populatePage(data);
  } catch (err) {
    console.error('Failed to load shop data:', err);
  }
}

function populatePage(data) {
  document.title = data.shopName;

  bindImage(document.getElementById('heroImg'), data.heroImage || IMAGE_FALLBACKS.hero, IMAGE_FALLBACKS.hero);

  const nameParts = (data.shopName || 'Caffeine Co.').split(' ');
  const first = nameParts.slice(0, -1).join(' ') || 'Caffeine';
  const last = nameParts.slice(-1)[0] || 'Co.';
  setText('heroTitle', first);
  setText('heroTitleEnd', last);

  setText('heroTagline', data.tagline);
  setText('aboutDescription', data.description);
  setText('specialtyText', data.specialty);

  bindImage(
    document.getElementById('specialtyImg'),
    data.specialtyImage || IMAGE_FALLBACKS.specialty,
    IMAGE_FALLBACKS.specialty
  );

  if (data.hours) {
    setText('hoursWeekdays', data.hours.weekdays);
    setText('hoursWeekends', data.hours.weekends);
    setText('locationHoursWeekdays', data.hours.weekdays);
    setText('locationHoursWeekends', data.hours.weekends);
  }

  if (data.contact) {
    setText('contactPhone', data.contact.phone);
    setText('contactEmail', data.contact.email);
    setText('contactAddress', data.contact.address);
    setText('locationAddress', data.contact.address);
    setText('footerPhone', data.contact.phone);
    setText('footerEmail', data.contact.email);
    setText('footerAddress', data.contact.address);
  }

  setText('footerTagline', data.tagline);

  const discount = data.discountPercent || 20;
  ['discountPercent', 'footerDiscount'].forEach(id => setText(id, discount));

  const mapFrame = document.getElementById('mapFrame');
  if (mapFrame && data.mapEmbed) mapFrame.src = data.mapEmbed;

  const galleryGrid = document.getElementById('galleryGrid');
  if (galleryGrid && data.galleryImages) {
    galleryGrid.innerHTML = data.galleryImages
      .map((url, i) => {
        const fallback = IMAGE_FALLBACKS.gallery[i] || IMAGE_FALLBACKS.gallery[0];
        return `
          <div class="gallery-item" data-gallery>
            <img src="${sanitizeUrl(url)}" data-fallback="${sanitizeUrl(fallback)}" alt="Caffeine Co. interior ${i + 1}" loading="lazy" decoding="async">
          </div>
        `;
      }).join('');

    galleryGrid.querySelectorAll('img').forEach(img => {
      bindImage(img, img.src, img.dataset.fallback);
    });
  }

  const prosGrid = document.getElementById('prosGrid');
  if (prosGrid && data.pros) {
    prosGrid.innerHTML = data.pros.map((pro, i) => `
      <article class="space-card" data-space-card>
        <span class="space-card-label">${pro.label || String(i + 1).padStart(2, '0')}</span>
        <div>
          <h3>${escapeHtml(pro.title)}</h3>
          <p>${escapeHtml(pro.description)}</p>
        </div>
        <span class="space-card-line"></span>
      </article>
    `).join('');
  }
}

function sanitizeUrl(url) {
  if (!url) return '';
  return String(url).replace(/"/g, '&quot;');
}

function bindImage(img, primarySrc, fallbackSrc) {
  if (!img) return;

  const load = src => {
    img.onload = () => img.classList.add('loaded');
    img.onerror = () => {
      if (src !== fallbackSrc && fallbackSrc) {
        load(fallbackSrc);
      } else {
        img.classList.add('loaded');
      }
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('loaded');
    }
  };

  load(primarySrc || fallbackSrc);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && text !== undefined) el.textContent = text;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---- Lenis smooth scroll ---- */
function initLenis() {
  lenis = new Lenis({
    duration: 1.4,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  const navbar = document.getElementById('navbar');
  const progressBar = document.getElementById('scrollProgress');
  let lastScroll = 0;

  navbar.classList.add('on-dark');

  lenis.on('scroll', ({ scroll, progress }) => {
    navbar.classList.toggle('scrolled', scroll > 80);

    if (progressBar) {
      progressBar.style.width = `${(progress || 0) * 100}%`;
    }

    if (scroll > lastScroll && scroll > 400) {
      navbar.classList.add('hidden-nav');
    } else {
      navbar.classList.remove('hidden-nav');
    }
    lastScroll = scroll;
  });
}

/* ---- Hero entrance ---- */
function initHeroAnimations() {
  splitTextElements(document.querySelectorAll('.split-target'));
}

function runHeroEntrance() {
  gsap.set('.hero-bg', { scale: 1.25, filter: 'blur(8px)' });

  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

  tl.to('.hero-bg', {
    scale: 1,
    filter: 'blur(0px)',
    duration: 2.2
  })
  .to('.hero-word', {
    y: 0,
    rotationX: 0,
    duration: 1.5,
    stagger: 0.14,
    ease: 'power4.out'
  }, '-=1.6')
  .to('.hero-lead', {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    duration: 1.1
  }, '-=0.8')
  .to('.hero-cta', {
    opacity: 1,
    y: 0,
    duration: 1
  }, '-=0.7')
  .from('.hero-meta', {
    opacity: 0,
    letterSpacing: '0.55em',
    filter: 'blur(6px)',
    duration: 1.3
  }, '-=1.1')
  .from('.hero-rail', {
    opacity: 0,
    y: 20,
    duration: 0.9
  }, '-=0.5')
  .from('.hero-steam span', {
    opacity: 0,
    y: 40,
    stagger: 0.15,
    duration: 1.2
  }, '-=1.2');
}

function initScrollAnimations() {
  gsap.set('.panel', { clearProps: 'filter,clipPath,opacity' });
  gsap.set('.hero-lead', { filter: 'blur(8px)' });
  gsap.set('.hero-word', { rotationX: 45, transformOrigin: '50% 100%' });

  initRevealElements();
  initSplitTextScroll();
  initDiscountAnimations();
  initGalleryAnimations();
  initSpaceCardAnimations();
  initSectionEntrances();
  initSpecialtyAnimations();
}

function initRevealElements() {
  gsap.utils.toArray('.reveal-up').forEach(el => {
    if (el.closest('.discount')) return;

    gsap.fromTo(el,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 90%',
          toggleActions: 'play none none none'
        }
      }
    );
  });

  gsap.utils.toArray('.reveal-scale').forEach(el => {
    gsap.fromTo(el,
      { opacity: 0, scale: 0.94, y: 24 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      }
    );
  });
}

function initSplitTextScroll() {
  document.querySelectorAll('.split-target').forEach(el => {
    if (el.closest('.hero')) return;
    const words = el.querySelectorAll('.split-word-inner');
    if (!words.length) return;

    gsap.fromTo(words,
      { y: '110%', opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.85,
        stagger: 0.06,
        ease: 'power4.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 86%',
          toggleActions: 'play none none none'
        }
      }
    );
  });
}

function initDiscountAnimations() {
  const discountSection = document.querySelector('.discount');
  if (!discountSection) return;

  const badge = document.querySelector('.discount-badge-glow');
  const discountNum = document.getElementById('discountPercent');
  const beamLine = document.querySelector('.discount-beam-line');
  const beamPulse = document.querySelector('.discount-beam-pulse');
  const cremaFill = document.querySelector('.discount-crema-fill');
  const inputRow = document.querySelector('.discount-form-box .input-row');
  const badgeGlow = document.getElementById('discountBadgeGlow');

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

  if (badge) {
    tl.from(badge, { scale: 0.88, opacity: 0, rotate: -10, duration: 1.1, ease: 'power4.out' }, 0);
    tl.add(() => {
      if (badgeGlow && window.runBorderGlowSweep) {
        window.runBorderGlowSweep(badgeGlow);
      }
    }, 0.35);
  }

  if (discountNum) {
    const target = parseInt(discountNum.textContent, 10) || 20;
    tl.fromTo({ val: 0 }, { val: target }, {
      val: target,
      duration: 1.6,
      ease: 'power3.out',
      onUpdate() {
        discountNum.textContent = Math.round(this.targets()[0].val);
      }
    }, 0.15);
  }

  if (beamLine) {
    tl.fromTo(beamLine,
      { scaleX: 0, opacity: 0 },
      { scaleX: 1, opacity: 1, duration: 0.9, ease: 'power2.inOut' },
      0.35
    );
  }

  if (beamPulse) {
    tl.fromTo(beamPulse,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(3)' },
      1.0
    );
    tl.to(beamPulse, { scale: 2.4, opacity: 0, duration: 0.55, ease: 'power2.out' }, 1.12);
  }

  tl.from('.discount-title-line', {
    y: 40,
    opacity: 0,
    stagger: 0.1,
    duration: 0.85,
    ease: 'power4.out'
  }, 0.45);

  tl.from('.discount-copy', { y: 20, opacity: 0, duration: 0.6 }, '-=0.55');
  tl.from('.discount-perks li', {
    y: 14,
    opacity: 0,
    stagger: 0.07,
    duration: 0.45
  }, '-=0.4');

  if (cremaFill) {
    tl.fromTo(cremaFill,
      { scaleY: 0, opacity: 0.85 },
      { scaleY: 1, opacity: 0.4, duration: 1.1, ease: 'power2.inOut' },
      0.65
    );
    tl.to(cremaFill, { opacity: 0, duration: 0.55, ease: 'power2.out' }, 1.35);
  }

  tl.from('.discount-form-box', {
    y: 28,
    opacity: 0,
    duration: 0.8,
    ease: 'power4.out'
  }, 0.7);

  tl.from('#emailInput', { x: -16, opacity: 0, duration: 0.5 }, 1.05);
  tl.from('#submitBtn', { x: 16, opacity: 0, duration: 0.5 }, 1.05);

  if (inputRow) {
    tl.add(() => inputRow.classList.add('is-lit'), 1.15);
  }

  const playDiscount = () => {
    if (tl.progress() === 0) tl.play();
  };

  ScrollTrigger.create({
    trigger: discountSection,
    start: 'top 85%',
    once: true,
    onEnter: playDiscount
  });

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
    const rect = discountSection.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
      playDiscount();
    }
  });
}

function initGalleryAnimations() {
  gsap.utils.toArray('[data-gallery]').forEach((item, i) => {
    const img = item.querySelector('img');

    ScrollTrigger.create({
      trigger: item,
      start: 'top 88%',
      onEnter: () => setTimeout(() => item.classList.add('revealed'), i * 100)
    });

    gsap.fromTo(item,
      { opacity: 0, scale: 0.92, y: 32 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 1.1,
        delay: i * 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: item,
          start: 'top 88%',
          toggleActions: 'play none none none'
        }
      }
    );

    if (img) {
      gsap.to(img, {
        yPercent: -10 - i * 3,
        ease: 'none',
        scrollTrigger: {
          trigger: item,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.5
        }
      });
    }
  });
}

function initSpaceCardAnimations() {
  gsap.utils.toArray('[data-space-card]').forEach((card, i) => {
    gsap.fromTo(card,
      { opacity: 0, y: 48, rotateX: 8 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        transformOrigin: '50% 100%',
        duration: 0.9,
        delay: (i % 3) * 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 92%',
          toggleActions: 'play none none none'
        }
      }
    );
  });
}

function initSectionEntrances() {
  gsap.utils.toArray('.panel:not(.hero)').forEach(panel => {
    let sweep = panel.querySelector('.section-sweep');
    if (!sweep) {
      sweep = document.createElement('div');
      sweep.className = 'section-sweep';
      sweep.setAttribute('aria-hidden', 'true');
      panel.prepend(sweep);
    }

    gsap.fromTo(sweep,
      { scaleX: 0, opacity: 0.6 },
      {
        scaleX: 1,
        opacity: 1,
        duration: 1.4,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: panel,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      }
    );

    gsap.fromTo(sweep,
      { opacity: 1 },
      {
        opacity: 0,
        duration: 0.6,
        delay: 0.8,
        scrollTrigger: {
          trigger: panel,
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      }
    );
  });
}

function initSpecialtyAnimations() {
  const section = document.querySelector('.specialty');
  if (!section) return;

  const tl = gsap.timeline({
    paused: true,
    defaults: { ease: 'power3.out', immediateRender: false }
  });

  tl.from('.specialty .section-tag', { y: 20, opacity: 0, duration: 0.6 }, 0);
  tl.from('.specialty-accent-dot', { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, 0.1);
  tl.from('.specialty-accent-ring', { scale: 0.6, opacity: 0, duration: 0.6, ease: 'back.out(1.5)' }, 0.15);
  tl.from('.specialty-title-line:first-child', { y: 48, opacity: 0, duration: 0.9, ease: 'power4.out' }, 0.2);
  tl.from('.specialty-title-outline', { y: 48, opacity: 0, duration: 0.9, ease: 'power4.out' }, 0.32);
  tl.from('.specialty-quote', { y: 24, opacity: 0, duration: 0.8 }, 0.45);
  tl.from('.specialty-rule', { scaleX: 0, duration: 1, ease: 'power2.inOut' }, 0.55);
  tl.from('.specialty-frame', {
    x: 60,
    opacity: 0,
    rotateY: -8,
    duration: 1.2,
    ease: 'power4.out',
    transformPerspective: 900,
    immediateRender: false
  }, 0.25);

  const playSpecialty = () => {
    if (tl.progress() === 0) tl.play();
  };

  ScrollTrigger.create({
    trigger: section,
    start: 'top 80%',
    once: true,
    onEnter: playSpecialty
  });

  const revealIfVisible = () => {
    const rect = section.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) {
      playSpecialty();
    }
  };

  requestAnimationFrame(revealIfVisible);
  ScrollTrigger.addEventListener('refresh', revealIfVisible);
}

function initPrimeEffects() {
  gsap.to('.marquee-forward', {
    xPercent: -15,
    ease: 'none',
    scrollTrigger: {
      trigger: '.marquee-wrap',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.5
    }
  });

  gsap.to('.marquee-reverse', {
    xPercent: 15,
    ease: 'none',
    scrollTrigger: {
      trigger: '.marquee-wrap',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 1.5
    }
  });

  gsap.utils.toArray('.discount-ring-outer').forEach(ring => {
    gsap.to(ring, {
      rotation: 360,
      ease: 'none',
      scrollTrigger: {
        trigger: ring,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 2
      }
    });
  });
}

function initCoffeeEffects() {
  gsap.utils.toArray('.hero-steam span').forEach((steam, i) => {
    gsap.to(steam, {
      y: -80 - i * 20,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1.2
      }
    });
  });

  gsap.utils.toArray('.coffee-orb').forEach((orb, i) => {
    gsap.to(orb, {
      y: -40 - i * 15,
      x: 20 * (i % 2 ? 1 : -1),
      ease: 'none',
      scrollTrigger: {
        trigger: '.discount',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.8
      }
    });
  });

  gsap.fromTo('.discount-bg-glow',
    { scale: 1, opacity: 0.7 },
    {
      scale: 1.1,
      opacity: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: '.discount',
        start: 'top 80%',
        end: 'top 40%',
        scrub: 1.2
      }
    }
  );
}

function initCardTilt() {
  if (window.matchMedia('(max-width: 768px)').matches) return;

  document.querySelectorAll('[data-space-card]:not([data-tilt-bound])').forEach(card => {
    card.dataset.tiltBound = '1';
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(card, {
        rotateY: x * 10,
        rotateX: -y * 10,
        transformPerspective: 800,
        duration: 0.4,
        ease: 'power2.out'
      });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        rotateY: 0,
        rotateX: 0,
        duration: 0.7,
        ease: 'elastic.out(1, 0.5)'
      });
    });
  });
}
function splitTextElements(elements) {
  elements.forEach(el => {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    const text = el.innerHTML;
    el.innerHTML = text
      .split(/(<br\s*\/?>)/gi)
      .map(part => {
        if (part.match(/<br/i)) return part;
        return part.split(/(\s+)/).map(token => {
          if (!token.trim()) return token;
          return `<span class="split-word"><span class="split-word-inner">${token}</span></span>`;
        }).join('');
      })
      .join('');
  });
}

/* ---- Parallax ---- */
function initParallax() {
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    gsap.to(heroBg, {
      yPercent: 28,
      scale: 1.08,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });
  }

  const specialtyImg = document.querySelector('.specialty-frame img');
  if (specialtyImg) {
    gsap.to(specialtyImg, {
      scale: 1.05,
      ease: 'none',
      scrollTrigger: {
        trigger: '.specialty',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1.2
      }
    });
  }

  gsap.utils.toArray('.panel').forEach(panel => {
    const tag = panel.querySelector('.section-tag');
    if (tag) {
      gsap.fromTo(tag,
        { x: -20, opacity: 0.6 },
        {
          x: 0,
          opacity: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: panel,
            start: 'top bottom',
            end: 'top 60%',
            scrub: 1
          }
        }
      );
    }
  });
}

/* ---- Cursor ---- */
function initCursor() {
  const ring = document.getElementById('cursorRing');
  const dot = document.getElementById('cursorDot');
  if (!ring || window.matchMedia('(max-width: 768px)').matches) return;

  let mx = 0, my = 0, rx = 0, ry = 0, dx = 0, dy = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
  });

  const animate = () => {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    dx += (mx - dx) * 0.35;
    dy += (my - dy) * 0.35;
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    if (dot) {
      dot.style.left = dx + 'px';
      dot.style.top = dy + 'px';
    }
    requestAnimationFrame(animate);
  };
  animate();

  document.querySelectorAll('a, button, .btn, input, [data-space-card]').forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('hover'));
    el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
  });
}

/* ---- Magnetic buttons ---- */
function initMagneticButtons() {
  document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(btn, { x: x * 0.25, y: y * 0.25, duration: 0.4, ease: 'power2.out' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    });
  });
}

/* ---- Mobile menu ---- */
function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  const closeMenu = () => {
    links.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
  };

  const openMenu = () => {
    links.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('menu-open');
  };

  btn.addEventListener('click', () => {
    if (links.classList.contains('open')) closeMenu();
    else openMenu();
  });

  document.querySelectorAll('[data-nav]').forEach(a => {
    a.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 769px)').matches) closeMenu();
  });
}

/* ---- Discount form ---- */
function initDiscountForm() {
  const form = document.getElementById('discountForm');
  const messageEl = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('emailInput').value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').classList.add('hidden');
    submitBtn.querySelector('.btn-loader').classList.remove('hidden');
    messageEl.classList.add('hidden');

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      messageEl.classList.remove('hidden', 'success', 'error');
      if (res.ok) {
        messageEl.classList.add('success');
        let msg = data.message;
        if (data.code) msg += ` Your code: <strong>${data.code}</strong>`;
        messageEl.innerHTML = msg;
        form.reset();
        gsap.from(messageEl, { opacity: 0, y: 10, duration: 0.5 });
      } else {
        messageEl.classList.add('error');
        messageEl.textContent = data.error || 'Something went wrong.';
      }
    } catch {
      messageEl.classList.remove('hidden');
      messageEl.classList.add('error');
      messageEl.textContent = 'Network error. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').classList.remove('hidden');
      submitBtn.querySelector('.btn-loader').classList.add('hidden');
    }
  });
}
