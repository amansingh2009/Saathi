-- 1. Grant EXECUTE on trigger functions so authenticated users can insert and update rows
grant execute on function public.touch_updated_at() to authenticated, anon;
grant execute on function public.add_family_creator_membership() to authenticated, anon;
grant execute on function public.handle_new_auth_user() to authenticated, anon;

-- 2. Allow family creator to select their own family row (needed for INSERT ... RETURNING and viewing family)
drop policy if exists families_member_select on public.families;
create policy families_member_select on public.families for select to authenticated 
using (created_by = (select auth.uid()) or private.is_family_member(id));

-- 3. Backfill any auth.users missing from profiles
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 4. Grant insert and full select on profiles to authenticated users
grant select, insert, update on public.profiles to authenticated;

-- 5. Allow users to insert their own profile row if not created yet
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
