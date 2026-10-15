// Interpret one owner-scoped snapshot for the live teacher dashboard.
// An online student is a recent classroom heartbeat, not simply an enrollment.
export function buildTeacherPresenceStats(courses, rows) {
  if (!Array.isArray(courses) || !Array.isArray(rows)) {
    throw new TypeError('Los datos de presencia no tienen el formato esperado.');
  }
  const byCourse = new Map(courses.map(course => [String(course.id), 0]));
  const studentsByCourse = new Map([...byCourse.keys()].map(id => [id, []]));
  const observedAtByCourse = new Map();
  const seen = new Set();
  for (const item of rows) {
    if (!item || typeof item.course_id !== 'string') {
      throw new TypeError('Falta el identificador de una materia.');
    }
    const id = item.course_id;
    if (!byCourse.has(id)) continue; // Defense in depth: ignore data for other courses.
    const online = item.online_count;
    if (!Number.isSafeInteger(online) || online < 0 || seen.has(id)) {
      throw new TypeError('La cantidad de estudiantes conectados no es válida.');
    }
    seen.add(id);
    const students = item.students ?? [];
    if (!Array.isArray(students) || (item.students !== undefined && students.length !== online)) {
      throw new TypeError('La lista de estudiantes no coincide con el contador.');
    }
    const ids = new Set();
    for (const student of students) {
      if (!student || typeof student.id !== 'string' || !student.id ||
        typeof student.name !== 'string' || !student.name.trim() ||
        typeof student.group !== 'string' ||
        typeof student.seen_at !== 'string' || !Number.isFinite(Date.parse(student.seen_at)) ||
        ids.has(student.id)) {
        throw new TypeError('La presencia de un estudiante no es válida.');
      }
      ids.add(student.id);
    }
    if (item.observed_at !== undefined &&
      (typeof item.observed_at !== 'string' || !Number.isFinite(Date.parse(item.observed_at)))) {
      throw new TypeError('La fecha de actualización no es válida.');
    }
    byCourse.set(id, online);
    studentsByCourse.set(id, students);
    observedAtByCourse.set(id, item.observed_at || null);
  }
  return {
    courses: byCourse.size,
    enrolled: courses.reduce((sum, row) => sum + Number(row.student_count || 0), 0),
    online: [...byCourse.values()].reduce((sum, count) => sum + count, 0),
    byCourse,
    studentsByCourse,
    observedAtByCourse
  };
}

export function presenceAgeLabel(seenAt, observedAt, fetchedAt = Date.now(), now = Date.now()) {
  const seen = Date.parse(seenAt), observed = Date.parse(observedAt);
  if (!Number.isFinite(seen) || !Number.isFinite(observed)) return 'Señal reciente';
  const seconds = Math.max(0, Math.round((observed - seen) / 1000 + (now - fetchedAt) / 1000));
  return seconds <= 2 ? 'Ahora mismo' : 'Hace ' + seconds + ' s';
}
