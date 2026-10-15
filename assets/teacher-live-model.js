// Pure mapping for the teacher's live presence summary.
// Only course IDs shown in the signed-in teacher's dashboard are accepted.
export function buildTeacherPresenceStats(courses, rows) {
  if (!Array.isArray(courses) || !Array.isArray(rows)) {
    throw new TypeError('Los datos de presencia no tienen el formato esperado.');
  }
  const byCourse = new Map(courses.map(course => [String(course.id), 0]));
  const seen = new Set();
  for (const item of rows) {
    if (!item || typeof item.course_id !== 'string') {
      throw new TypeError('Falta el identificador de una materia.');
    }
    const id = item.course_id;
    if (!byCourse.has(id)) continue;
    const online = item.online_count;
    if (!Number.isSafeInteger(online) || online < 0 || seen.has(id)) {
      throw new TypeError('La cantidad de estudiantes conectados no es válida.');
    }
    seen.add(id);
    byCourse.set(id, online);
  }
  return {
    courses: byCourse.size,
    enrolled: courses.reduce((sum, row) => sum + Number(row.student_count || 0), 0),
    online: [...byCourse.values()].reduce((sum, count) => sum + count, 0),
    byCourse
  };
}
