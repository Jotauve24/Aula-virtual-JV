import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const block=read('supabase/migrations/20261019202728_prevent_same_course_duplicate_email_enrollment.sql');
const hint=read('supabase/migrations/20261019202818_student_registration_matching_identity_duplicate_hint.sql');
const existing=read('supabase/migrations/20261019202916_protect_student_session_before_recovery_login.sql');
const html=read('live.html');
const js=read('assets/live.js');
const recovery=read('assets/student-recovery.js');

test('enroll_student checks course-scoped existing email before inserting (without changing previous students)',()=>{
  assert.match(block,/create or replace function public\.enroll_student/i);
  assert.ok(block.indexOf('where course_id = v_course.id and auth_user_id')<
      block.indexOf('if exists (select 1 from public.students s'),
    'legitimate previous auth sessions continue to reopen their original profile');
  assert.match(block,/s\.course_id=v_course\.id and lower\(btrim\(s\.email\)\)=v_email/);
  assert.match(block,/raise exception 'Este correo ya tiene una inscripción en esta materia/);
  assert.ok(block.indexOf("raise exception 'Este correo ya tiene una inscripción")<
    block.indexOf('insert into public.students'));
  assert.match(block,/and active for update/);
  assert.doesNotMatch(block,/\b(delete|truncate)\s+(from\s+)?public\.students\b/i);
});
test('email-step hint requires course code and first and last name to avoid casual email enumeration',()=>{
  assert.match(hint,/create or replace function public\.student_registration_email_hint/i);
  assert.match(hint,/lower\(btrim\(s\.original_first_name\)\)/);
  assert.match(hint,/lower\(btrim\(s\.original_last_name\)\)/);
  assert.match(hint,/lower\(btrim\(s\.email\)\)/);
  assert.match(hint,/revoke all on function public\.student_registration_email_hint.*from public,anon/i);
  assert.match(existing,/student_has_any_enrollment/i);
  assert.match(existing,/auth_user_id=\(select auth\.uid\(\)\)/);
});
test('conditional duplicate prompt uses common student registration for all present and future subjects',()=>{
  assert.match(html,/id="email-duplicate-notice"[^>]+hidden/);
  assert.match(html,/id="email-duplicate-recover"/);
  assert.match(js,/student_registration_email_hint/);
  assert.match(js,/showDuplicateContact/);
  assert.match(js,/aula-student-recovery-code/);
  assert.match(recovery,/student_has_any_enrollment/);
  assert.match(html,/live\.js\?v=[\w.-]+/);
  assert.match(html,/student-recovery\.js\?v=[\w.-]+/);
  assert.match(html,/student-account\.css\?v=[\w.-]+/);
});
