// Esta versión no autentica estudiantes ni almacena información personal.
export const DEMO_CODE = 'DEMO2026';
export const SKINS = ['#ecc39c', '#cd986b', '#a86c48', '#70472f'];
export const SHIRTS = ['#557d61', '#6887ad', '#bb7251', '#b28c3e', '#937496'];
export const DEMO_PROFILES = [
  { id: 'demo-ana', firstName: 'Ana', lastName: 'Ruiz', skin: 1, shirt: 0, hair: 'long' },
  { id: 'demo-mateo', firstName: 'Mateo', lastName: 'López', skin: 2, shirt: 1, hair: 'short' },
  { id: 'demo-lucia', firstName: 'Lucía', lastName: 'Pérez', skin: 0, shirt: 2, hair: 'curly' },
  { id: 'demo-diego', firstName: 'Diego', lastName: 'Torres', skin: 3, shirt: 3, hair: 'short' },
];
export function normalizeCode(value) { return String(value).trim().replace(/\s/g, '').toUpperCase(); }
export function normalizeSearch(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim(); }
export function formatPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
export function validateProfile(profile) {
  const errors = {};
  if (profile.firstName.trim().length < 2 || profile.firstName.trim().length > 80) errors.firstName = 'Escribe tus nombres completos (de 2 a 80 caracteres).';
  if (profile.lastName.trim().length < 2 || profile.lastName.trim().length > 100) errors.lastName = 'Escribe tus apellidos completos (de 2 a 100 caracteres).';
  if (!/^[\p{L}\p{N} -]{3,32}$/u.test(profile.document.trim())) errors.document = 'Revisa la cédula de ejemplo.';
  if (!/^\d{4}-\d{4}$/.test(profile.phone)) errors.phone = 'Completa los ocho dígitos: XXXX-XXXX.';
  return errors;
}
export function createTopics() {
  return [
    { id: 'arquitectura', name: 'Arquitectura', index: '01', capacity: 4, members: ['Sofía M.', 'Carlos R.'], description: 'Explora cómo se organizan los componentes de un computador.', x: 210, y: 100, target: { x: 320, y: 240 } },
    { id: 'redes', name: 'Redes', index: '02', capacity: 4, members: ['Valeria G.'], description: 'Comparte ideas sobre cómo se conectan los dispositivos y circula la información.', x: 580, y: 100, target: { x: 460, y: 240 } },
    { id: 'seguridad', name: 'Seguridad', index: '03', capacity: 4, members: ['Elena P.', 'Daniel C.', 'Paula S.', 'Andrés V.'], description: 'Investiga prácticas para proteger los equipos y la información.', x: 580, y: 345, target: { x: 460, y: 480 } },
  ];
}
export function joinTopic(topics, currentId, nextId) {
  if (currentId === nextId) return { ok: false, reason: 'already-member' };
  if (currentId) return { ok: false, reason: 'already-in-group' };
  const topic = topics.find(item => item.id === nextId);
  if (!topic) return { ok: false, reason: 'missing-topic' };
  if (topic.members.length >= topic.capacity) return { ok: false, reason: 'full' };
  return { ok: true, topicId: nextId };
}
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
