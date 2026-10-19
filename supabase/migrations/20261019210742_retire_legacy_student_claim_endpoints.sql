-- These entry points belonged to the retired preloaded-profile flow.
-- Preserve functions and historical rows, but stop exposing the old API.
revoke execute on function public.request_course(text,uuid)
  from public, anon, authenticated;
revoke execute on function public.teacher_approve_claim(uuid,uuid)
  from public, anon, authenticated;
revoke execute on function public.save_my_profile(uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
