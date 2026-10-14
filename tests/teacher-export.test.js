import test from 'node:test';
import assert from 'node:assert/strict';
import { allCoursesXlsx } from '../assets/teacher-export.js';

function sheetXml(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const length = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    if (name === 'xl/worksheets/sheet1.xml') return decoder.decode(bytes.subarray(start, start + length));
    offset = start + length;
  }
  throw new Error('No hay hoja de estudiantes en el archivo');
}

test('Excel recibe las seis columnas, acentos y delimitadores sin dividir registros', () => {
  const sheet = sheetXml(allCoursesXlsx([{
    course: { name: 'Ética; sección "A"' }, topics: [],
    students: [{ firstName: 'María', lastName: 'O"Neill', email: 'maria@ejemplo.com', phone: '0555; 123', topicId: null }]
  }]));
  assert.match(sheet, /Nombre de la materia/);
  assert.match(sheet, /Teléfono/);
  assert.match(sheet, /Ética; sección &quot;A&quot;/);
  assert.match(sheet, /María/);
  assert.match(sheet, /O&quot;Neill/);
  assert.match(sheet, /0555; 123/);
  assert.match(sheet, /Sin equipo/);
});

test('el listado trata como texto los valores que podrían iniciar fórmulas', () => {
  const sheet = sheetXml(allCoursesXlsx([{
    course: { name: '=SUM(1+1)' }, topics: [{ id: 't', name: '@SUM(A1)' }],
    students: [{ firstName: '\t=2+2', lastName: '+1', email: '-1', phone: '@SUM(1)', topicId: 't' }]
  }]));
  assert.match(sheet, /t="inlineStr"/);
  assert.match(sheet, /<t xml:space="preserve">=SUM\(1\+1\)<\/t>/);
  assert.match(sheet, /<t xml:space="preserve">\t=2\+2<\/t>/);
  assert.doesNotMatch(sheet, /<f>/);
});
