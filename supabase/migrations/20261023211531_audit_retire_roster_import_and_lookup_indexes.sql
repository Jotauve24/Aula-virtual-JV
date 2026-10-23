-- Retire the unused roster preload API; current enrollment requires a document.
revoke all on function public.teacher_import_roster(uuid,jsonb) from public,anon,authenticated;

-- Support account, roster, recovery and deletion paths as enrollment grows.
create index if not exists students_auth_user_lookup on public.students(auth_user_id,course_id);
create index if not exists students_topic_lookup on public.students(topic_id,course_id);
create index if not exists courses_teacher_lookup on public.courses(teacher_id);
create index if not exists team_messages_course_lookup on public.team_messages(course_id);
create index if not exists team_messages_student_recent on public.team_messages(student_id,created_at desc);
create index if not exists student_identity_links_course_lookup on private.student_identity_links(course_id);
create index if not exists teacher_classroom_presence_teacher_lookup on private.teacher_classroom_presence(teacher_id);
