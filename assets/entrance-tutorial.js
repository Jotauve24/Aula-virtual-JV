import { drawWorld, avatarSVG } from './world.js?v=0.9.0';
import { createRoomLayout, findPath } from './world-layout.js?v=0.9.0';

export const TUTORIAL_STEPS = [
  { id: 'code', short: 'Código', title: 'Primero, el código de tu materia.', description: 'En la portada, escribe el código que te compartió tu docente y pulsa «Entrar a mi materia».', duration: 6000 },
  { id: 'registration', short: 'Registro', title: 'Luego, completa tu registro.', description: 'Responde en orden: nombre, apellido, cédula o pasaporte, correo y teléfono. Al terminar, pulsa «Crear mi personaje». Si ya tienes perfil, utiliza la recuperación.', duration: 11000 },
  { id: 'avatar', short: 'Avatar', title: 'Después, personaliza tu avatar.', description: 'Elige tu avatar, tono de piel, color de ropa y cabello. Pulsa «Guardar y explorar el aula» para entrar a la sala.', duration: 6500 },
  { id: 'movement', short: 'Mover', title: 'Ahora sí: entra y mueve tu personaje.', description: 'Toca el suelo o usa las flechas y W A S D para caminar. Acércate a una mesa y pulsa E, o toca su rótulo, para ver el tema.', duration: 6500 },
  { id: 'capacity', short: 'Cupos', title: 'Revisa los cupos antes de elegir.', description: 'Un equipo con 5 de 5 lugares está completo. Explora otra mesa con cupos disponibles; todavía no has elegido tu equipo.', duration: 6500 },
  { id: 'choose', short: 'Elegir', title: 'Elige un equipo y confirma tu lugar.', description: 'Abre un equipo disponible, pulsa «Quiero este equipo» y después «Sí, unirme al equipo». Tu lugar se guarda al confirmar.', duration: 7500 },
  { id: 'team', short: 'Mi equipo', title: 'Tu equipo, siempre a mano.', description: 'Busca la marca «✓ Tu equipo» o pulsa «Ver mi equipo». Aquí ves a tus compañeros y sus correos. Compartir tu teléfono es opcional.', duration: 6500 },
  { id: 'chat', short: 'Chat', title: 'La conversación continúa aquí.', description: 'Abre Chat para conversar y compartir archivos de hasta 10 MB. Solo los integrantes del equipo pueden participar en esta conversación.', duration: 6500 }
];

export const TUTORIAL_REGISTRATION_FIELDS = [
  { id: 'firstName', label: 'Tus nombres', value: 'Alex' },
  { id: 'lastName', label: 'Tus apellidos', value: 'Ejemplo' },
  { id: 'documentNumber', label: 'Cédula o pasaporte', value: '8-123-456' },
  { id: 'email', label: 'Correo de contacto', value: 'alex@ejemplo.com' },
  { id: 'phone', label: 'Tu teléfono', value: '6000-0011' }
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
  const hall = { x: 400, y: layout.rooms[0].arrival.y + 55 };
  const fullTeam = layout.rooms[1].arrival, chosenTeam = layout.rooms[0].arrival;
  function route(from, target) {
    const points = [from, ...findPath(from, target, layout)];
    let length = 0;
    const segments = points.slice(1).map((to, index) => {
      const origin = points[index], start = length;
      length += Math.hypot(to.x - origin.x, to.y - origin.y);
      return { from: origin, to, start, end: length };
    }).filter(part => part.end > part.start);
    return { from, length, segments };
  }
  const routes = { movement: route(layout.spawn, hall),
    capacity: route(hall, fullTeam), choose: route(fullTeam, chosenTeam) };
  const state = (id, phase = 0) => {
    const joined = ['team', 'chat'].includes(id) || (id === 'choose' && phase >= .83);
    const choice = joined ? 'saved' : id === 'choose' && phase >= .65 ? 'confirm' : 'open';
    const fieldIndex = Math.min(TUTORIAL_REGISTRATION_FIELDS.length - 1,
      Math.floor(Math.max(0, phase) * TUTORIAL_REGISTRATION_FIELDS.length));
    const details = { joined, choice, fieldIndex };
    // Personalization comes before entering the room. The example student must
    // not appear or move on the map while code, registration or avatar is shown.
    if (['code', 'registration', 'avatar'].includes(id)) return { ...details, player: null };
    const currentRoute = routes[id] || routes.choose;
    const progress = routes[id] ? Math.min(1, Math.max(0, phase) / .62) : 1;
    const distance = currentRoute.length * progress;
    const part = currentRoute.segments.find(segment => segment.end >= distance) || currentRoute.segments.at(-1);
    const ratio = part ? (distance - part.start) / (part.end - part.start) : 0;
    const x = part ? part.from.x + (part.to.x - part.from.x) * ratio : currentRoute.from.x;
    const y = part ? part.from.y + (part.to.y - part.from.y) * ratio : currentRoute.from.y;
    const dx = part ? part.to.x - part.from.x : 0, dy = part ? part.to.y - part.from.y : 0;
    return { ...details, player: { id: 'tour-me', x, y, skin: 1, shirt: 0, hair: 'curly',
      direction: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'),
      moving: !!routes[id] && progress < 1 } };
  };
  return { layout, state };
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
  let frame = 0, lastPaint = -Infinity, renderedStep = -1, renderedJoined = null, renderedField = -1;
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
    const example = scene.state(step.id, state.phase), { joined } = example;
    root.dataset.playing = String(!state.paused && state.visible);
    root.dataset.step = String(state.step);
    root.dataset.scene = step.id;
    root.dataset.choice = example.choice;
    root.style.setProperty('--tour-progress', state.progress);
    $('#tour-toggle').textContent = state.paused ? '▶ Reproducir' : 'Ⅱ Pausar';
    $('#tour-toggle').setAttribute('aria-label', state.paused ? 'Reproducir tutorial' : 'Pausar tutorial');
    $('#tour-toggle').setAttribute('aria-pressed', String(!state.paused));
    if (renderedStep !== state.step) {
      renderedStep = state.step;
      cards.forEach(card => { card.hidden = card.dataset.tourCard !== step.id; });
      buttons.forEach((button, index) => {
        button.classList.toggle('is-complete', index < state.step);
        if (button.dataset.tourStep === step.id) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      $('#tour-counter').textContent = String(state.step + 1).padStart(2, '0') + ' / ' + String(TUTORIAL_STEPS.length).padStart(2, '0');
      $('#tour-caption').textContent = step.title;
      $('#tour-description').textContent = step.description;
      $('#tour-previous').disabled = state.step === 0;
      $('#tour-next').disabled = state.step === TUTORIAL_STEPS.length - 1;
    }
    if (renderedJoined !== joined) {
      renderedJoined = joined;
      root.dataset.joined = String(joined);
      $('#tour-my-place').textContent = joined ? '✓ Tu equipo · 4/5' : '3/5 · Disponible';
      $('#tour-choice-capacity').textContent = joined ? '4/5' : '3/5';
    }
    if (step.id === 'registration' && renderedField !== example.fieldIndex) {
      renderedField = example.fieldIndex;
      const field = TUTORIAL_REGISTRATION_FIELDS[example.fieldIndex];
      $('#tour-register-label').textContent = field.label;
      $('#tour-register-value').textContent = field.value;
      $('#tour-register-count').textContent = String(example.fieldIndex + 1) + ' de ' + TUTORIAL_REGISTRATION_FIELDS.length;
      $('#tour-register-next').textContent = example.fieldIndex === TUTORIAL_REGISTRATION_FIELDS.length - 1 ? 'Crear mi personaje →' : 'Continuar →';
    }
    const player = example.player;
    drawWorld(canvas, { layout: scene.layout, player, hidePlayerName: true,
      walking: !!player?.moving && !state.paused, time: state.elapsed,
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
  buttons.forEach(button => button.addEventListener('click', () => chooseStep(TUTORIAL_STEPS.findIndex(step => step.id === button.dataset.tourStep))));
  $('#tour-previous').addEventListener('click', () => chooseStep(clock.snapshot().step - 1));
  $('#tour-next').addEventListener('click', () => chooseStep(clock.snapshot().step + 1));
  $('#tour-toggle').addEventListener('click', () => {
    const play = clock.snapshot().paused;
    if (play) motionOverride = true;
    clock.pause(!play); sync();
  });
  $('#tour-replay').addEventListener('click', () => {
    clock.go(0); clock.pause(reducedMotion.matches && !motionOverride); sync();
    $('#tour-announcement').textContent = 'Tutorial desde el inicio: código, registro, avatar y entrada al aula.';
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
