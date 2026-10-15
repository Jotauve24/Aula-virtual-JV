-- Index recovery-only foreign keys without touching student records.
create index student_recovery_requester_lookup on private.student_recovery_requests(requester_user_id);
create index student_recovery_reviewed_by_lookup on private.student_recovery_requests(reviewed_by)
  where reviewed_by is not null;
create index student_recovery_student_lookup on private.student_recovery_requests(student_id)
  where student_id is not null;