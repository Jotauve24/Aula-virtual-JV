const HEADERS = ['Nombre de la materia', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Equipo'];

function csvCell(value) {
  // Student-entered fields are data, never spreadsheet formulas.
  const plain = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const safe = /^[=+\-@]/.test(plain) ? "'" + plain : plain;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function rosterCsv(overview) {
  const teamNames = new Map(overview.topics.map(topic => [topic.id, topic.name]));
  const rows = overview.students.map(student => [
    overview.course.name,
    student.firstName,
    student.lastName,
    student.email,
    student.phone,
    student.topicId ? teamNames.get(student.topicId) || 'Equipo no disponible' : 'Sin equipo'
  ]);
  // Excel recognizes sep=; even when the computer's regional CSV separator differs.
  return '\uFEFFsep=;\r\n' + [HEADERS, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function rosterFilename(courseName) {
  const slug = String(courseName).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'materia';
  return `Estudiantes_${slug}.csv`;
}
