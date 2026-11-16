const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function libraryRole(requested, available) {
  return available.includes(requested) ? requested : available.includes('teacher') ? 'teacher' : available.includes('student') ? 'student' : '';
}
export function normalizeLibraryCourses(value, role) {
  if (!Array.isArray(value)) throw new Error('No se pudieron cargar tus materias. Vuelve a intentarlo.');
  const ids = new Set();
  return value.map(row => {
    const id = role === 'student' ? row?.course_id : row?.id;
    const name = role === 'student' ? row?.course_name : row?.name;
    if (!uuid.test(id) || typeof name !== 'string' || !name.trim() || name.length > 200 || ids.has(id))
      throw new Error('El listado de materias no es válido. Vuelve a cargar la biblioteca.');
    ids.add(id); return { id, name: name.trim() };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
export function createLibrarySession({ request, signedIn, identity = () => '', onChange = () => {} }) {
  let generation = 0, state = { role: '', phase: 'idle', courses: [], selected: '', error: '', unavailable: false };
  let owner = '';
  const emit = kind => onChange(kind, state);
  function reset() { generation++; owner = ''; state = { role: '', phase: 'idle', courses: [], selected: '', error: '', unavailable: false }; emit('reset'); }
  async function load(role, preferred = '') {
    const token = ++generation;
    const requestedOwner = identity(role); owner = requestedOwner;
    state = { role, phase: 'loading', courses: [], selected: '', error: '', unavailable: false }; emit('loading');
    if (!signedIn(role)) { reset(); return; }
    try {
      const courses = normalizeLibraryCourses(await request(role), role);
      if (token !== generation) return;
      if (!signedIn(role) || requestedOwner !== identity(role)) { reset(); return; }
      const wanted = uuid.test(preferred) ? preferred : '';
      const selected = courses.some(row => row.id === wanted) ? wanted : wanted ? '' : courses[0]?.id || '';
      Object.assign(state, { phase: 'ready', courses, selected, unavailable: !!wanted && !selected }); emit('loaded');
    } catch (error) {
      if (token !== generation) return;
      if (!signedIn(role) || requestedOwner !== identity(role)) { reset(); return; }
      Object.assign(state, { phase: 'error', error: error.message || 'No se pudo cargar la biblioteca.' }); emit('error');
    }
  }
  function select(id) {
    if (owner !== identity(state.role)) { reset(); return false; }
    if (state.phase !== 'ready' || !signedIn(state.role) || !state.courses.some(row => row.id === id)) return false;
    state.selected = id; state.unavailable = false; emit('selected'); return true;
  }
  return { load, reset, select, snapshot: () => state };
}
