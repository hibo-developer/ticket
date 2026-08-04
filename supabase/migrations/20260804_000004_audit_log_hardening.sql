revoke select on all tables in schema public from anon;

alter policy audit_log_insert_org
on public.audit_log
with check (org_id = private.current_org_id() and actor_user_id = auth.uid());

