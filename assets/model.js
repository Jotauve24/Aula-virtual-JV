export const SKINS = ['#ecc39c', '#cd986b', '#a86c48', '#70472f'];
export const SHIRTS = ['#557d61', '#6887ad', '#bb7251', '#b28c3e', '#937496', '#d8588f', '#9c69c7'];
export function normalizeCode(value) { return String(value).trim().replace(/\s/g, '').toUpperCase(); }

export function normalizeStudentAge(value) {
  const age = Number(String(value ?? '').trim());
  if (!Number.isInteger(age) || age < 1 || age > 120)
    throw new Error('Escribe tu edad en años completos, entre 1 y 120.');
  return age;
}

