const HEADERS = ['Nombre de la materia', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Equipo'];

function csvCell(value) {
  // Student-entered fields are data, never spreadsheet formulas.
  const plain = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const safe = /^[=+\-@]/.test(plain) ? "'" + plain : plain;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function allCoursesCsv(overviews) {
  const rows = overviews.flatMap(overview => {
    const teamNames = new Map(overview.topics.map(topic => [topic.id, topic.name]));
    return overview.students.map(student => [
      overview.course.name,
      student.firstName,
      student.lastName,
      student.email,
      student.phone,
      student.topicId ? teamNames.get(student.topicId) || 'Equipo no disponible' : 'Sin equipo'
    ]);
  }).sort((a, b) => a[0].localeCompare(b[0], 'es') || a[2].localeCompare(b[2], 'es') || a[1].localeCompare(b[1], 'es'));
  // Excel recognizes sep=; even when the computer's regional CSV separator differs.
  return '\uFEFFsep=;\r\n' + [HEADERS, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
