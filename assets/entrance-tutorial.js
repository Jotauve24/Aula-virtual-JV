import { drawWorld, avatarSVG } from './world.js?v=0.7.0';
import { createRoomLayout, findPath } from './world-layout.js?v=0.7.0';

export const TUTORIAL_STEPS = [
  { short: 'Ingreso', title: 'Tu materia es el punto de partida.', description: 'Escribe el código de tu docente. Si eres nuevo, completa tus datos y tu cédula o pasaporte. Si ya te registraste, conserva tu perfil o recupera tu cuenta.', duration: 7200 },
  { short: 'Avatar', title: 'Dale tu estilo a tu personaje.', description: 'Personaliza tu avatar antes de entrar. Tu personaje y tus cambios quedan guardados para tu próximo ingreso.', duration: 5400 },
  { short: 'Elegir', title: 'Encuentra un lugar para ti.', description: 'Recorre el aula, abre un tema y revisa los cupos. Pulsa «Quiero este equipo» y confirma para guardar tu lugar.', duration: 6500 },
  { short: 'Completo', title: '¿Está completo? Explora otro equipo.', description: 'Un equipo con todos sus lugares ocupados no admite más integrantes. Elige otro con cupos; para cambiar después, pide ayuda al docente.', duration: 6000 },
  { short: 'Mi equipo', title: 'Tu equipo, siempre a mano.', description: 'Busca la marca «✓ Tu equipo» o pulsa «Ver mi equipo». Aquí ves a tus compañeros y sus correos. Compartir tu teléfono es opcional.', duration: 6500 },
  { short: 'Chat', title: 'La conversación continúa aquí.', description: 'Abre Chat para conversar y compartir archivos de hasta 10 MB. Solo los integrantes del equipo pueden participar en esta conversación.', duration: 6500 }
];

const TOTAL = TUTORIAL_STEPS.reduce((sum, step) => sum + step.duration, 0);
const STARTS = TUTORIAL_STEPS.map((_, index) => TUTORIAL_STEPS.slice(0, index).reduce((sum, step) => sum + step.duration, 0));

// This clock advances only while visible and playing. Resuming never skips
// unread instructions or jumps forward by the time spent in another tab.
export function createTutorialClock(paused = false) {
  let elapsed = 0, lastTime = null, visible = true;
  const snapshot = () => {
    let step = TUTORIAL_STEPS.length - 1;
    while (step > 0 && elapsed < STARTS[step]) step--;
    return { elapsed, step, phase: (elapsed - STARTS[step]) / TUTORIAL_STEPS[step].duration,
      progress: elapsed / TOTAL, paused, visible };
  };
  return {
    snapshot,
    tick(time) {
      if (!Number.isFinite(time)) return snapshot();
      if (lastTime !== null && !paused && visible)
        elapsed = (elapsed + Math.max(0, time - lastTime)) % TOTAL;
      lastTime = time;
      return snapshot();
    },
    pause(value) { paused = value; lastTime = null; return snapshot(); },
    visibility(value) { visible = value; lastTime = null; return snapshot(); },
    go(index) {
      elapsed = STARTS[Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Math.floor(index)))];
      lastTime = null;
      return snapshot();
    }
  };
}

export function createTutorialScene() {
  const layout = createRoomLayout(4);
  const points = [layout.spawn, ...findPath(layout.spawn, layout.rooms[0].arrival, layout)];
  let length = 0;
  const segments = points.slice(1).map((to, index) => {
    const from = points[index], start = length;
    length += Math.hypot(to.x - from.x, to.y - from.y);
    return { from, to, start, end: length };
  }).filter(part => part.end > part.start);
  const player = (step, phase) => {
    const progress = step < 2 ? 0 : step > 2 ? 1 : Math.min(1, phase / .72);
    const distance = length * progress;
    const part = segments.find(segment => segment.end >= distance) || segments.at(-1);
    const ratio = part ? (distance - part.start) / (part.end - part.start) : 0;
    const x = part ? part.from.x + (part.to.x - part.from.x) * ratio : layout.spawn.x;
    const y = part ? part.from.y + (part.to.y - part.from.y) * ratio : layout.spawn.y;
    const dx = part ? part.to.x - part.from.x : 0, dy = part ? part.to.y - part.from.y : 0;
    return { id: 'tour-me', x, y, skin: 1, shirt: 0, hair: 'curly',
      direction: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'),
      moving: step === 2 && progress < 1 };
  };
  return { layout, player };
}

const LOOKS = [
  { skin: 1, shirt: 0, hair: 'curly' }, { skin: 0, shirt: 5, hair: 'long' },
  { skin: 2, shirt: 1, hair: 'short' }, { skin: 1, shirt: 6, hair: 'long' },
  { skin: 3, shirt: 3, hair: 'short' }
];

export function mountEntranceTutorial(root) {
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const canvas = $('#preview-map'), scene = createTutorialScene();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = createTutorialClock(reducedMotion.matches);
  const cards = [...root.querySelectorAll('[data-tour-card]')];
  const buttons = [...root.querySelectorAll('[data-tour-step]')];
  const labels = [...root.querySelectorAll('[data-tour-room]')];
  let frame = 0, lastPaint = -Infinity, renderedStep = -1, renderedJoined = null;
  let inView = true, motionOverride = false;
  const seated = scene.layout.rooms.flatMap((room, roomIndex) =>
    Array.from({ length: [3, 5, 2, 2][roomIndex] }, (_, seatIndex) => ({
      id: `tour-${roomIndex}-${seatIndex}`, roomIndex, seatIndex,
      avatar: LOOKS[(roomIndex + seatIndex) % LOOKS.length]
    })));

  root.querySelectorAll('[data-tour-avatar]').forEach(node => {
    node.innerHTML = avatarSVG(LOOKS[Number(node.dataset.tourAvatar) % LOOKS.length]);
  });
  labels.forEach((label, index) => {
    const anchor = scene.layout.rooms[index].label;
    label.style.left = anchor.x / scene.layout.width * 100 + '%';
    label.style.top = anchor.y / scene.layout.height * 100 + '%';
  });

  function paint() {
    const state = clock.snapshot(), step = TUTORIAL_STEPS[state.step];
    const joined = state.step > 2 || (state.step === 2 && state.phase >= .72);
    root.dataset.playing = String(!state.paused && state.visible);
    root.dataset.step = String(state.step);
    root.style.setProperty('--tour-progress', state.progress);
    $('#tour-toggle').textContent = state.paused ? '▶ Reproducir' : 'Ⅱ Pausar';
    $('#tour-toggle').setAttribute('aria-label', state.paused ? 'Reproducir tutorial' : 'Pausar tutorial');
    $('#tour-toggle').setAttribute('aria-pressed', String(!state.paused));
    if (renderedStep !== state.step) {
      renderedStep = state.step;
      cards.forEach((card, index) => { card.hidden = index !== state.step; });
      buttons.forEach((button, index) => {
        if (index === state.step) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      $('#tour-counter').textContent = String(state.step + 1).padStart(2, '0') + ' / 06';
      $('#tour-caption').textContent = step.title;
      $('#tour-description').textContent = step.description;
      $('#tour-previous').disabled = state.step === 0;
      $('#tour-next').disabled = state.step === TUTORIAL_STEPS.length - 1;
    }
    if (renderedJoined !== joined) {
      renderedJoined = joined;
      root.dataset.joined = String(joined);
      $('#tour-my-place').textContent = joined ? '✓ Tu equipo · 4/5' : '3/5 · Disponible';
    }
    const player = scene.player(state.step, state.phase);
    drawWorld(canvas, { layout: scene.layout, player, hidePlayerName: true,
      walking: player.moving && !state.paused, time: state.elapsed,
      ambientTime: state.elapsed + 5000, reducedMotion: reducedMotion.matches && !motionOverride,
      seated, seatCounts: [5, 5, 5, 5] });
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function animate(time) {
    frame = 0;
    const state = clock.tick(time);
    if (time - lastPaint >= 50) { paint(); lastPaint = time; }
    if (!state.paused && state.visible) frame = requestAnimationFrame(animate);
  }
  function sync() {
    stop(); lastPaint = -Infinity;
    const state = clock.visibility(inView && !document.hidden);
    paint();
    if (!state.paused && state.visible) frame = requestAnimationFrame(animate);
  }
  function chooseStep(index) {
    clock.go(index); clock.pause(true); sync();
    $('#tour-announcement').textContent = TUTORIAL_STEPS[clock.snapshot().step].title + ' ' + TUTORIAL_STEPS[clock.snapshot().step].description;
  }
  buttons.forEach((button, index) => button.addEventListener('click', () => chooseStep(index)));
  $('#tour-previous').addEventListener('click', () => chooseStep(clock.snapshot().step - 1));
  $('#tour-next').addEventListener('click', () => chooseStep(clock.snapshot().step + 1));
  $('#tour-toggle').addEventListener('click', () => {
    const play = clock.snapshot().paused;
    if (play) motionOverride = true;
    clock.pause(!play); sync();
  });
  $('#tour-replay').addEventListener('click', () => {
    clock.go(0); clock.pause(reducedMotion.matches && !motionOverride); sync();
  });
  reducedMotion.addEventListener('change', () => {
    motionOverride = false;
    if (reducedMotion.matches) clock.pause(true);
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  // The map sits below the form on a phone: don't animate an off-screen canvas.
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting; sync();
  }, { threshold: .08 }) : null;
  observer?.observe(root);
  window.addEventListener('pagehide', () => { stop(); observer?.disconnect(); });
  window.addEventListener('pageshow', () => { observer?.observe(root); sync(); });
  sync();
}
