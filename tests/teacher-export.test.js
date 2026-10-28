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

test('Excel recibe las diez columnas, acentos y delimitadores sin dividir registros', () => {
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


test('documentos se exportan completos como texto y edades como números',()=>{
 const sheet=sheetXml(allCoursesXlsx([{
  course:{name:'Sistemas'},topics:[{id:'g1',name:'Equipo Coral'}],students:[
   {firstName:'Ana',lastName:'Abad',email:'a@ejemplo.invalid',phone:'06000001',topicId:'g1',
    documentType:'cedula',documentCountry:'PA',documentNumber:'8-123-45',nationalId:'antiguo',age:21},
   {firstName:'Bea',lastName:'Bello',documentType:'passport',documentCountry:'CO',documentNumber:'00123456789012345678',age:120},
   {firstName:'Ceci',lastName:'Cano',nationalId:'E-12-345',age:null},
   {firstName:'Dora',lastName:'Diaz',age:0}]
 }]));
 assert.match(sheet,/<dimension ref="A1:J5"/);assert.match(sheet,/<autoFilter ref="A1:J5"/);
 for(const heading of ['Tipo de documento','País emisor (ISO)','Cédula o pasaporte','Edad (años)'])assert.ok(sheet.includes(heading));
 assert.match(sheet,/<c r="G2" t="inlineStr"[^>]*><is><t[^>]*>Cédula<\/t>/);
 assert.match(sheet,/<c r="I2" t="inlineStr"[^>]*><is><t[^>]*>8-123-45<\/t>/);
 assert.match(sheet,/<c r="I3" t="inlineStr"[^>]*><is><t[^>]*>00123456789012345678<\/t>/);
 assert.match(sheet,/<c r="J2" t="n" s="2"><v>21<\/v>/);
 assert.match(sheet,/<c r="J3" t="n" s="2"><v>120<\/v>/);
 assert.match(sheet,/<c r="I4" t="inlineStr"[^>]*><is><t[^>]*>E-12-345<\/t>/);
 assert.match(sheet,/<c r="J4" s="2"\/>/);
 assert.match(sheet,/<c r="J5" s="2"\/>/);
 assert.doesNotMatch(sheet,/antiguo|undefined|<f>/);
});
test('el Excel vacío conserva las nuevas columnas y el filtro completo',()=>{
 const sheet=sheetXml(allCoursesXlsx([]));assert.match(sheet,/<dimension ref="A1:J1"/);
 assert.match(sheet,/<autoFilter ref="A1:J1"/);assert.equal((sheet.match(/<c r=/g)||[]).length,10);
});
