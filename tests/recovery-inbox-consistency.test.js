import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const teacherSql=read('supabase/migrations/20261016213444_teacher_recovery_matching_profile_only.sql');
const requestSql=read('supabase/migrations/20261016213623_student_recovery_prevent_orphaned_requests.sql');
const legacySql=read('supabase/migrations/20261016214043_student_legacy_orphaned_recovery_status.sql');
const teacher=read('assets/teacher.js');
const student=read('assets/student-recovery.js');

test('every teacher subject uses a shared inbox that excludes claims with no matching registered email',()=>{
  assert.match(teacherSql,/create or replace function public\.teacher_student_recovery_requests\(/i);
  assert.match(teacherSql,/and exists\s*\(\s*select 1 from public\.students match/i);
  assert.match(teacherSql,/match\.course_id\s*=\s*r\.course_id/i);
  assert.match(teacherSql,/lower\(btrim\(match\.email\)\)\s*=\s*lower\(btrim\(u\.email\)\)/i);
  assert.match(teacherSql,/and not exists\s*\(\s*select 1 from public\.students owned/i);
  assert.match(teacherSql,/student_try_verified_email_recovery|Self-service eligible/i);
  assert.doesNotMatch(teacherSql,/\bdelete from public\.students\b/i);
  assert.doesNotMatch(teacherSql,/\bdelete from private\.student_recovery_requests\b/i);
});
test('new no-email-match recovery attempts cannot create invisible orphan requests',()=>{
  const noMatch=requestSql.indexOf("if v_auto->>'status'='not_found'");
  const insert=requestSql.indexOf('insert into private.student_recovery_requests');
  assert.ok(noMatch>0 && noMatch<insert,'no-match must return BEFORE request insert');
  assert.match(requestSql,/return jsonb_build_object\('status','not_found'/);
  assert.match(legacySql,/if v_any and not v_has_reviewable_candidate then/);
  assert.match(legacySql,/return jsonb_build_object\('status','not_found'\)/);
  assert.doesNotMatch(legacySql,/\bupdate private\.student_recovery_requests\b/i);
});
test('teacher and student both share the corrected logic and browser cache revisions',()=>{
  const docente=read('docente.html'),live=read('live.html');
  assert.match(docente,/assets\/teacher\.js\?v=20261016t/);
  assert.match(live,/assets\/student-recovery\.js\?v=20261019d/);
  assert.match(teacher,/panel\.hidden = true;\s*host\.replaceChildren\(\);/);
  assert.match(teacher,/panel\.hidden = false;\s*\}\s*catch/);
  assert.match(student,/result\.status==='not_found'/);
});
