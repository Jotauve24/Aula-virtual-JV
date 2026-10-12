import test from 'node:test';
import assert from 'node:assert/strict';
import {attachmentInfo,MAX_ATTACHMENT_BYTES} from '../assets/attachments.js';
test('documentos e imágenes válidos conservan su nombre y tipo',()=>{
  assert.equal(attachmentInfo({name:'Trabajo.docx',size:100}).type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(attachmentInfo({name:'Captura.PNG',size:100}).type,'image/png');
});
test('se rechazan archivos vacíos, grandes y ejecutables',()=>{
  for(const file of [{name:'x.pdf',size:0},{name:'x.pdf',size:MAX_ATTACHMENT_BYTES+1},{name:'x.exe',size:1},{name:'x.html',size:30}])assert.throws(()=>attachmentInfo(file));
  assert.equal(attachmentInfo({name:'x.pdf',size:MAX_ATTACHMENT_BYTES}).size,MAX_ATTACHMENT_BYTES);
});
