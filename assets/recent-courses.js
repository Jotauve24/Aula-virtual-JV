import { normalizeCode } from './model.js?v=0.27.5';

export const RECENT_COURSES_KEY = 'aula-recent-course-codes';
const LAST_CODE = 'aula-student-course-code';
const validCode = value => typeof value === 'string' && /^MAT-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(normalizeCode(value));
const courseName = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 160) : '';

// These are navigation shortcuts, never credentials or permission to join a course.
export function createRecentCourses(storage) {
  if (!storage) { try { storage = localStorage; } catch { /* Storage may be unavailable. */ } }
  let memory = [], volatile = !storage;
  function list() {
    let saved = memory;
    if (!volatile) {
      try {
        const raw = storage.getItem(RECENT_COURSES_KEY);
        saved = raw && raw.length < 16384 ? JSON.parse(raw) : [];
      } catch { saved = memory; }
    }
    const rows = [];
    for (const value of Array.isArray(saved) ? saved : []) {
      const code = typeof value === 'string' ? value : value?.code;
      if (!validCode(code)) continue;
      const normalized = normalizeCode(code);
      if (!rows.some(row => row.code === normalized)) rows.push({code: normalized, name: courseName(value?.name)});
      if (rows.length === 5) break;
    }
    // Students who used the app before this feature keep their last saved code.
    try {
      const previous = storage?.getItem(LAST_CODE);
      if (validCode(previous) && !rows.some(row => row.code === normalizeCode(previous)))
        rows.push({code: normalizeCode(previous), name: ''});
    } catch { /* Manual entry remains available. */ }
    return rows.slice(0, 5);
  }
  function save(rows) {
    memory = rows;
    try { storage.setItem(RECENT_COURSES_KEY, JSON.stringify(rows)); volatile = false; }
    catch { volatile = true; }
  }
  return {
    list,
    remember(code, name = '') {
      if (!validCode(code)) return;
      code = normalizeCode(code);
      const rows = list(), previous = rows.find(row => row.code === code);
      save([{code, name: courseName(name) || previous?.name || ''}, ...rows.filter(row => row.code !== code)].slice(0, 5));
    },
    forget(code) {
      if (!validCode(code)) return;
      code = normalizeCode(code);
      save(list().filter(row => row.code !== code));
      try { if (normalizeCode(storage?.getItem(LAST_CODE) || '') === code) storage.removeItem(LAST_CODE); } catch { /* Best effort. */ }
    },
    clear() {
      memory = []; volatile = true;
      try { storage?.removeItem(RECENT_COURSES_KEY); storage?.removeItem(LAST_CODE); volatile = !storage; } catch { /* Keep the page's list empty. */ }
    }
  };
}
