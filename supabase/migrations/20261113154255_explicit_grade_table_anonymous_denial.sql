-- Explicit anonymous-session denial makes the direct-access intent visible to
-- the database advisor as well as the planner. The false term keeps ALL direct
-- clients denied, including verified accounts. Anonymous classroom profiles
-- still use the RPCs, whose authorization is bound to the canonical student ID.
alter policy grade_scheme_rpc_only on private.course_grade_schemes
  using (false and ((select auth.jwt())->>'is_anonymous')::boolean is false)
  with check (false and ((select auth.jwt())->>'is_anonymous')::boolean is false);
alter policy grade_simulation_rpc_only on private.student_grade_simulations
  using (false and ((select auth.jwt())->>'is_anonymous')::boolean is false)
  with check (false and ((select auth.jwt())->>'is_anonymous')::boolean is false);
