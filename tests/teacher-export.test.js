import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterCsv, rosterFilename } from '../assets/teacher-export.js';

test('Excel recibe las seis columnas, acentos y delimitadores sin dividir registros', () => {
  const csv = rosterCsv({
    course: { name: 'Ética; sección "A"' }, topics: [],
    students: [{ firstName: 'María', lastName: 'O"Neill', email: 'maria@ejemplo.com', phone: '555; 123', topicId: null }]
  });
  assert.ok(csv.startsWith('\uFEFFsep=;\r\n'));
  assert.match(csv, /"Nombre de la materia";"Nombre";"Apellido";"Correo";"Teléfono";"Equipo"\r\n/);
  assert.match(csv, /"Ética; sección ""A""";"María";"O""Neill";"maria@ejemplo.com";"555; 123";"Sin equipo"\r\n/);
  assert.equal(rosterFilename('Ética; sección "A"'), 'Estudiantes_Etica_seccion_A.csv');
});

test('el listado trata como texto los valores que podrían iniciar fórmulas', () => {
  const csv = rosterCsv({
    course: { name: '=SUM(1+1)' }, topics: [{ id: 't', name: '@SUM(A1)' }],
    students: [{ firstName: '\t=2+2', lastName: '+1', email: '-1', phone: '@SUM(1)', topicId: 't' }]
  });
  assert.match(csv, /"'=SUM\(1\+1\)";"'=2\+2";"'\+1";"'-1";"'@SUM\(1\)";"'@SUM\(A1\)"/);
});
