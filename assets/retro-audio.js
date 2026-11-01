import {
  SOUND_STORAGE_KEY, AMBIENT_VOLUME, EFFECT_VOLUME, SOUND_SOURCE,
  soundEnabled, shouldPlayAmbient, soundForAction
} from './retro-audio-model.js?v=0.27.8';

const room = document.querySelector('#room');
const button = document.querySelector('#retro-sound-toggle');
if (room && button) {
  const storedPreference = (() => {
    try { return localStorage.getItem(SOUND_STORAGE_KEY); } catch { return null; }
  })();
  let enabled = soundEnabled(storedPreference);
  let context = null, musicPending = false, gestureNeeded = false;
  let sourceFailed = false, fallbackTimer = 0, duckTimer = 0;

  // External link supplied by the teacher. No MP3 is redistributed with the app.
  // If the provider blocks hotlinking, a small ORIGINAL synthesized chiptune plays instead.
  const music = new Audio(SOUND_SOURCE);
  music.loop = true;
  music.preload = 'none';
  music.volume = AMBIENT_VOLUME;
  music.addEventListener('error', () => {
    sourceFailed = true;
    music.pause();
    synchronize();
  });

  function active() {
    return document.documentElement?.dataset?.aulaGuideOpen !== 'true' && shouldPlayAmbient({
      enabled, stage:room.dataset.stage, hidden:room.hidden, pageHidden:document.hidden
    });
  }
  function paintButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Silenciar sonidos del aula' : 'Activar sonidos del aula');
    button.title = enabled ? 'Silenciar música y efectos' : 'Activar música y efectos';
    button.textContent = enabled ? '🔉 Sonido' : '🔇 Sin sonido';
  }
  function audioContext() {
    if (!context) {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return null;
      context = new AudioEngine();
    }
    return context;
  }
  // The effects are short, original 8-bit tones, not copied Mario samples.
  function notes(list, level = EFFECT_VOLUME) {
    if (!enabled || document.hidden || document.documentElement?.dataset?.aulaGuideOpen === 'true') return;
    const engine = audioContext();
    if (!engine) return;
    if (engine.state === 'suspended') void engine.resume().catch(() => {});
    let position = engine.currentTime + 0.005;
    for (const [frequency, duration] of list) {
      const oscillator = engine.createOscillator();
      const envelope = engine.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, position);
      envelope.gain.setValueAtTime(0.0001, position);
      envelope.gain.exponentialRampToValueAtTime(level, position + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, position + duration);
      oscillator.connect(envelope);
      envelope.connect(engine.destination);
      oscillator.start(position);
      oscillator.stop(position + duration + 0.008);
      position += duration + 0.014;
    }
  }
  function effect(name) {
    if (!enabled) return;
    const patterns = {
      step:[[523.25,0.075],[659.25,0.086]],
      finish:[[392,0.095],[523.25,0.095],[659.25,0.12]],
      join:[[440,0.1],[587.33,0.1],[698.46,0.15]],
      send:[[659.25,0.065],[783.99,0.08]],
      // A cheerful, original coin-like sparkle, distinct from the send cue.
      receive:[[783.99,0.075],[987.77,0.075],[1318.51,0.11]]
    };
    const pattern = patterns[name];
    if (pattern) notes(pattern, EFFECT_VOLUME);
  }
  function receivedMessage() {
    // This event is emitted only for new messages from someone else.
    // If the student muted the room or it is hidden, stay completely silent.
    if (!enabled || !active()) return;
    if (context?.state === 'suspended' && !gestureNeeded) {
      // The sound engine may require a user interaction; never force playback.
      void context.resume().catch(() => {});
    }
    // Lower background music for less than a second so the alert is clear
    // at a comfortable volume.
    if (!music.paused) {
      clearTimeout(duckTimer);
      music.volume = AMBIENT_VOLUME * 0.32;
      duckTimer = setTimeout(() => {
        music.volume = AMBIENT_VOLUME;
        duckTimer = 0;
      }, 650);
    }
    effect('receive');
  }
  document.addEventListener('aulajv:chat-received', receivedMessage);
  // Quiet backup for sites that reject third-party MP3 playback.
  const melody = [261.63,329.63,392,329.63,293.66,349.23,392,349.23];
  let beat = 0;
  function stopFallback() {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = 0;
  }
  function continueFallback() {
    if (!active() || !sourceFailed) return stopFallback();
    notes([[melody[beat++ % melody.length],0.12]], AMBIENT_VOLUME * 0.32);
    fallbackTimer = setTimeout(continueFallback, 700);
  }
  function synchronize() {
    if (!active()) {
      music.pause();
      stopFallback();
      clearTimeout(duckTimer);
      duckTimer = 0;
      music.volume = AMBIENT_VOLUME;
      return;
    }
    if (sourceFailed) {
      if (!fallbackTimer) continueFallback();
      return;
    }
    if (music.paused && !musicPending && !gestureNeeded) {
      musicPending = true;
      void music.play().catch(() => { gestureNeeded = true; })
        .finally(() => { musicPending = false; });
    }
  }
  function userGesture() {
    if (!enabled) return;
    const engine = audioContext();
    if (engine?.state === 'suspended') void engine.resume().catch(() => {});
    gestureNeeded = false;
    synchronize();
  }

  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(SOUND_STORAGE_KEY,String(enabled)); } catch { /* Storage optional. */ }
    paintButton();
    if (enabled) userGesture();
    else synchronize();
  });

  // Register effects only on meaningful actions: never for typing or walking.
  document.addEventListener('click', event => {
    if (!event.target.closest || event.target.closest('#retro-sound-toggle')) return;
    userGesture();
    const action = soundForAction(event.target);
    if (action && !event.target.closest(':disabled')) effect(action);
  }, {capture:true});

  const observer = new MutationObserver(synchronize);
  observer.observe(room,{attributes:true,attributeFilter:['hidden','data-stage']});
  document.addEventListener('visibilitychange',synchronize);
  document.addEventListener('aulajv:guide-visibility',synchronize);
  window.addEventListener('pagehide', () => {
    music.pause();
    stopFallback();
    clearTimeout(duckTimer);
    music.volume = AMBIENT_VOLUME;
  });
  window.addEventListener('pageshow', synchronize);
  paintButton();
  synchronize();
}
