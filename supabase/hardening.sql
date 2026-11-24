-- =============================================================================
-- Security hardening for the onboarding portal database.
--
-- Review before applying (Supabase → SQL Editor). Idempotent: safe to re-run.
-- Assumes public.is_admin() exists (SECURITY DEFINER, checks profiles.role).
-- =============================================================================

-- 1. Users may edit their own profile, but never their role or project.
--    Service-role calls (API routes) and admins are allowed.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.project_id is distinct from old.project_id)
     and coalesce(auth.role(), '') = 'authenticated'
     and not public.is_admin() then
    raise exception 'Not allowed to change role or project_id'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_columns on public.profiles;
create trigger protect_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- 2. Anonymous visitors should not read profile or file metadata.
revoke select on public.profiles    from anon;
revoke select on public.phase_files from anon;

-- 3. Clients must not be able to add themselves to arbitrary projects.
--    (Adjust if project_members already has stricter policies.)
alter table if exists public.project_members enable row level security;

drop policy if exists "project_members admin all" on public.project_members;
create policy "project_members admin all" on public.project_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project_members read own" on public.project_members;
create policy "project_members read own" on public.project_members
  for select to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- Verification queries (run after applying)
-- =============================================================================
-- Admins that exist today — every row should be expected:
--   select p.id, u.email, p.created_at from profiles p join auth.users u on u.id = p.id where p.role = 'admin';
-- Policies per table:
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;
-- Grants to anon:
--   select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public';
