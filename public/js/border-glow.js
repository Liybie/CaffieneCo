function parseHSL(hslStr) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors) {
  const vars = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
function easeInCubic(x) { return x * x * x; }

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now() + delay;
  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  setTimeout(() => requestAnimationFrame(tick), delay);
}

function getCenterOfElement(el) {
  const { width, height } = el.getBoundingClientRect();
  return [width / 2, height / 2];
}

function getEdgeProximity(el, x, y) {
  const [cx, cy] = getCenterOfElement(el);
  const dx = x - cx;
  const dy = y - cy;
  let kx = Infinity;
  let ky = Infinity;
  if (dx !== 0) kx = cx / Math.abs(dx);
  if (dy !== 0) ky = cy / Math.abs(dy);
  return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
}

function getCircleGlowProximity(el, x, y) {
  const { width, height } = el.getBoundingClientRect();
  const cx = width / 2;
  const cy = height / 2;
  const dist = Math.hypot(x - cx, y - cy);
  const radius = Math.min(cx, cy);
  const normalized = Math.min(dist / radius, 1);
  return 0.65 + normalized * 0.35;
}

function getCircleCursorAngle(el, x, y) {
  const { width, height } = el.getBoundingClientRect();
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;
  if (dx === 0 && dy === 0) return 0;
  let degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (degrees < 0) degrees += 360;
  return degrees;
}

function isCircleGlow(card) {
  return card.classList.contains('border-glow-circle') || card.dataset.shape === 'circle';
}

function getCursorAngle(el, x, y) {
  if (isCircleGlow(el)) return getCircleCursorAngle(el, x, y);
  const [cx, cy] = getCenterOfElement(el);
  const dx = x - cx;
  const dy = y - cy;
  if (dx === 0 && dy === 0) return 0;
  let degrees = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (degrees < 0) degrees += 360;
  return degrees;
}

function lerpAngle(current, target, t) {
  let diff = target - current;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  let next = current + diff * t;
  if (next < 0) next += 360;
  if (next >= 360) next -= 360;
  return next;
}

function applyBorderGlowOptions(card, options = {}) {
  const {
    edgeSensitivity = 30,
    glowColor = '40 80 80',
    backgroundColor = '#120F17',
    borderRadius = 28,
    glowRadius = 40,
    glowIntensity = 1.0,
    coneSpread = 25,
    colors = ['#c084fc', '#f472b6', '#38bdf8'],
    fillOpacity = 0.5,
  } = options;

  Object.assign(card.style, {
    '--card-bg': backgroundColor,
    '--edge-sensitivity': edgeSensitivity,
    '--border-radius': typeof borderRadius === 'string' ? borderRadius : `${borderRadius}px`,
    '--glow-padding': `${glowRadius}px`,
    '--cone-spread': coneSpread,
    '--fill-opacity': fillOpacity,
    '--glow-arc': `${coneSpread * 3.6}deg`,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors),
  });
}

function applySmoothGlow(card, angle, proximity) {
  card.style.setProperty('--smooth-angle', `${angle.toFixed(2)}deg`);
  card.style.setProperty('--edge-proximity', proximity.toFixed(2));
  card.style.setProperty('--cursor-angle', `${angle.toFixed(2)}deg`);
}

function startSmoothGlowLoop(card) {
  if (card._glowState) return;

  const orbitProx = Number(card.dataset.orbitProximity) || 75;
  const state = {
    angle: 0,
    proximity: orbitProx,
    targetAngle: 0,
    targetProximity: orbitProx,
    hovering: false,
    autoSpin: card.dataset.orbit === 'true',
  };
  card._glowState = state;

  card.addEventListener('pointerenter', (e) => {
    state.hovering = true;
    card.classList.add('is-hovering');
    if (isCircleGlow(card)) {
      card.style.setProperty('--cone-spread', card.dataset.hoverConeSpread || '36');
      card.style.setProperty('--glow-arc', `${(Number(card.dataset.hoverConeSpread) || 36) * 3.6}deg`);
    }
    updateBorderGlowFromPointer(card, e);
  });

  card.addEventListener('pointerleave', () => {
    state.hovering = false;
    card.classList.remove('is-hovering');
    if (isCircleGlow(card)) {
      card.style.setProperty('--cone-spread', card.dataset.coneSpread || '28');
      card.style.setProperty('--glow-arc', `${(Number(card.dataset.coneSpread) || 28) * 3.6}deg`);
    }
    state.targetProximity = Number(card.dataset.orbitProximity) || 75;
  });

  function tick() {
    if (!state.hovering && !card.classList.contains('sweep-active') && state.autoSpin) {
      state.targetAngle = (state.targetAngle + 1.1) % 360;
      if (!state.hovering) state.targetProximity = Number(card.dataset.orbitProximity) || 75;
    }

    state.angle = lerpAngle(state.angle, state.targetAngle, state.hovering ? 0.22 : 0.1);
    state.proximity += (state.targetProximity - state.proximity) * (state.hovering ? 0.24 : 0.08);

    applySmoothGlow(card, state.angle, state.proximity);
    card._glowFrame = requestAnimationFrame(tick);
  }

  card._glowFrame = requestAnimationFrame(tick);
}

function updateBorderGlowFromPointer(card, e) {
  const rect = card.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const edge = isCircleGlow(card)
    ? getCircleGlowProximity(card, x, y)
    : getEdgeProximity(card, x, y);
  const angle = getCursorAngle(card, x, y);

  if (card._glowState) {
    card._glowState.targetAngle = angle;
    card._glowState.targetProximity = edge * 100;
    return;
  }

  applySmoothGlow(card, angle, edge * 100);
}

function runBorderGlowSweep(card) {
  if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const state = card._glowState;
  const angleStart = 110;
  const angleEnd = 465;
  card.classList.add('sweep-active');

  if (state) {
    state.targetAngle = angleStart;
    state.targetProximity = 0;
    state.angle = angleStart;
    state.proximity = 0;
  } else {
    applySmoothGlow(card, angleStart, 0);
  }

  animateValue({ duration: 500, onUpdate: v => {
    if (state) state.targetProximity = v;
    else applySmoothGlow(card, angleStart, v);
  }});

  animateValue({
    ease: easeInCubic,
    duration: 1500,
    end: 50,
    onUpdate: v => {
      const angle = (angleEnd - angleStart) * (v / 100) + angleStart;
      if (state) state.targetAngle = angle;
    }
  });

  animateValue({
    ease: easeOutCubic,
    delay: 1500,
    duration: 2250,
    start: 50,
    end: 100,
    onUpdate: v => {
      const angle = (angleEnd - angleStart) * (v / 100) + angleStart;
      if (state) state.targetAngle = angle;
    }
  });

  animateValue({
    ease: easeInCubic,
    delay: 2500,
    duration: 1500,
    start: 100,
    end: card.dataset.orbit === 'true' ? (Number(card.dataset.orbitProximity) || 75) : 0,
    onUpdate: v => {
      if (state) state.targetProximity = v;
    },
    onEnd: () => card.classList.remove('sweep-active'),
  });
}

function initBorderGlow(card, options = {}) {
  if (!card) return;

  applyBorderGlowOptions(card, options);
  startSmoothGlowLoop(card);

  card.addEventListener('pointermove', (e) => updateBorderGlowFromPointer(card, e));

  if (options.animated) {
    runBorderGlowSweep(card);
  }
}

function initBorderGlowElements() {
  document.querySelectorAll('[data-border-glow]').forEach(card => {
    initBorderGlow(card, {
      edgeSensitivity: Number(card.dataset.edgeSensitivity) || 30,
      glowColor: card.dataset.glowColor || '40 80 80',
      backgroundColor: card.dataset.backgroundColor || '#120F17',
      borderRadius: card.dataset.borderRadius || 28,
      glowRadius: Number(card.dataset.glowRadius) || 40,
      glowIntensity: Number(card.dataset.glowIntensity) || 1.0,
      coneSpread: Number(card.dataset.coneSpread) || 25,
      fillOpacity: Number(card.dataset.fillOpacity) || 0.5,
      animated: card.dataset.animated === 'true',
      orbit: card.dataset.orbit === 'true',
      colors: (card.dataset.colors || '#c084fc,#f472b6,#38bdf8').split(',').map(c => c.trim()),
    });
  });
}

window.initBorderGlow = initBorderGlow;
window.initBorderGlowElements = initBorderGlowElements;
window.runBorderGlowSweep = runBorderGlowSweep;
