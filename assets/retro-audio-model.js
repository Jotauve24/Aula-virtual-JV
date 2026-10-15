// Small, deterministic audio policy shared by students and ZombieAdmin.
// Volume is intentionally low; muted preference wins over every playback event.
export const SOUND_STORAGE_KEY = 'aulajv-sound-enabled-v1';
export const AMBIENT_VOLUME = 0.035;
export const EFFECT_VOLUME = 0.035;
export const SOUND_SOURCE = 'https://sonidosmp3gratis.com/sounds/ringtones-super-mario-bros.mp3';
export function soundEnabled(saved) {
  return saved === null || saved === undefined ? true : saved === 'true';
}
export function shouldPlayAmbient({enabled, stage, hidden, pageHidden}) {
  return !!enabled && stage === 'room' && !hidden && !pageHidden;
}
export function soundForAction(target) {
  if (!target?.closest) return null;
  if (target.closest('#next-question, #previous-question')) return 'step';
  if (target.closest('#finish-registration, #avatar-form button[type="submit"]')) return 'finish';
  if (target.closest('.join-confirm-actions .danger, #topic-dialog .join-confirmation .danger')) return 'join';
  if (target.closest('#team-chat-form button[type="submit"]')) return 'send';
  if (target.closest('#restart-demo')) return 'step';
  return null;
}
