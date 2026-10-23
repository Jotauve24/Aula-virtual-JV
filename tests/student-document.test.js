import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentDocument } from '../assets/student-document.js';

test('cedula normalizes prefixed values, dash characters and insignificant zeros without guessing group boundaries',()=>{
 for(const [raw,want] of [['8-0123-000045','8-123-45'],['pe 0012 00345','PE-12-345'],['8av–12–34','8AV-12-34'],['13PI-7-4','13PI-7-4'],['N-123-45','N-123-45'],['E-1-123456','E-1-123456']])
  assert.equal(normalizeStudentDocument('cedula',raw),want);
 assert.notEqual(normalizeStudentDocument('cedula','8-12-345'),normalizeStudentDocument('cedula','8-123-45'));
 for(const raw of ['812345','14-12-34','8-12345-6','8-1-1234567','8-abc-45','8-12-3!'])
  assert.throws(()=>normalizeStudentDocument('cedula',raw));
});
test('passport preserves letters and leading zeros and ignores presentation separators',()=>{
 assert.equal(normalizeStudentDocument('passport',' ab-0012 34 '),'AB001234');
 for(const value of ['','ABC','AB/1234','💥1234','A'.repeat(25)]) assert.throws(()=>normalizeStudentDocument('passport',value));
 assert.throws(()=>normalizeStudentDocument('other','1234567'));
});
