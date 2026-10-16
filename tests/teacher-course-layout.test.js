import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../docente.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/live.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../assets/teacher.js',import.meta.url),'utf8');
const detail=html.slice(html.indexOf('<section id="detail"'),html.indexOf('<dialog id="edit-topic-dialog"'));
const pos=part=>detail.indexOf(part);

test('course detail preserves existing forms, actions, dialogs and unique IDs',()=>{
  const ids=['detail','back','course-title','course-summary','enter-room','registration',
    'course-code-panel','course-access-code','copy-course-code','generate-course-code',
    'detail-live-panel','detail-online-list','student-recovery-panel','student-recovery-requests',
    'group-count-form','group-count','new-group-capacity','new-topic','topic-list',
    'student-list','toggle-course','delete-course','course-management','course-advanced',
    'detail-status-pill','detail-student-total','detail-group-total','detail-unassigned-total'];
  for(const id of ids){
    const count=html.match(new RegExp('id="'+id+'"','g'))?.length||0;
    if(id==='course-code-panel'||id==='course-management')continue; // CSS class, not ID
    assert.equal(count,1,'Only one #'+id);
  }
  assert.match(html,/<dialog id="move-student-dialog"/);
  assert.match(html,/<dialog id="delete-student-dialog"/);
  assert.match(html,/<dialog id="delete-course-dialog"/);
});
test('instructor sees summary, code and presence first, with all destructive course actions at the very bottom',()=>{
  assert.ok(pos('id="course-title"')<pos('id="detail-student-total"'));
  assert.ok(pos('id="detail-student-total"')<pos('id="course-access-code"'));
  assert.ok(pos('id="course-access-code"')<pos('id="detail-live-panel"'));
  assert.ok(pos('id="detail-live-panel"')<pos('id="detail-groups"'));
  assert.ok(pos('id="detail-groups"')<pos('id="topic-list"'));
  assert.ok(pos('id="topic-list"')<pos('id="detail-students"'));
  assert.ok(pos('id="detail-students"')<pos('id="student-list"'));
  assert.ok(pos('id="student-list"')<pos('id="course-advanced"'));
  assert.ok(pos('id="course-advanced"')<pos('id="toggle-course"'));
  assert.ok(pos('id="toggle-course"')<pos('id="delete-course"'));
  assert.match(detail,/<details id="course-advanced"[^>]*>/);
  assert.doesNotMatch(detail,/<details id="course-advanced"[^>]*\sopen(?:=|\s|>)/);
  assert.match(detail,/<summary>/);
});
test('status and numbers stay connected to course overview without new backend calls',()=>{
  for(const id of ['detail-student-total','detail-group-total','detail-unassigned-total','detail-status-pill']){
    assert.match(js,new RegExp("#"+id+"\\'"));
  }
  assert.match(js,/overview\.students\.filter\(student => !student\.topicId\)\.length/);
  assert.match(js,/\$\('#course-advanced'\)\.open = !active/);
  assert.match(js,/await rpc\('teacher_overview'/);
});
test('design is isolated to teacher detail and responsive without touching student view',()=>{
  assert.match(css,/#detail\.teacher-course-detail/);
  assert.match(css,/#detail \.detail-workspace-grid/);
  assert.match(css,/#detail \.course-advanced/);
  assert.match(css,/@media\(max-width:920px\)/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/@media\(max-width:385px\)/);
  assert.match(html,/live\.css\?v=20261016r/);
});
