-- Tables remain completely closed. Only the four validated, owner-checked RPCs
-- access them as the function owner; a table grant alone can never expose drafts.
drop policy grade_scheme_course_member on private.course_grade_schemes;
drop policy grade_simulation_owner on private.student_grade_simulations;
create policy grade_scheme_rpc_only on private.course_grade_schemes for all to authenticated
  using (false) with check (false);
create policy grade_simulation_rpc_only on private.student_grade_simulations for all to authenticated
  using (false) with check (false);
