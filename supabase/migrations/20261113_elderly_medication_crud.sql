-- Allow elderly users to perform all CRUD operations on medications and schedules
-- and broadcast changes to all family members via Supabase Realtime

-- 1. Drop restrictive caregiver-only policies
drop policy if exists medications_caregiver_insert on public.medications;
drop policy if exists medications_caregiver_update on public.medications;
drop policy if exists schedules_caregiver_insert on public.medication_schedules;
drop policy if exists schedules_caregiver_update on public.medication_schedules;

-- 2. Create family-member policies for medications (allowing both elderly and caregivers)
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'medications' and policyname = 'medications_member_insert') then
    create policy medications_member_insert on public.medications
      for insert to authenticated
      with check (
        created_by = auth.uid()
        and private.is_family_member(family_id)
        and private.family_has_user(family_id, elderly_user_id)
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'medications' and policyname = 'medications_member_update') then
    create policy medications_member_update on public.medications
      for update to authenticated
      using (private.is_family_member(family_id))
      with check (
        private.is_family_member(family_id)
        and private.family_has_user(family_id, elderly_user_id)
      );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'medications' and policyname = 'medications_member_delete') then
    create policy medications_member_delete on public.medications
      for delete to authenticated
      using (private.is_family_member(family_id));
  end if;
end $$;

-- 3. Create family-member policies for medication_schedules
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'medication_schedules' and policyname = 'schedules_member_insert') then
    create policy schedules_member_insert on public.medication_schedules
      for insert to authenticated
      with check (private.is_family_member(family_id));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'medication_schedules' and policyname = 'schedules_member_update') then
    create policy schedules_member_update on public.medication_schedules
      for update to authenticated
      using (private.is_family_member(family_id))
      with check (private.is_family_member(family_id));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'medication_schedules' and policyname = 'schedules_member_delete') then
    create policy schedules_member_delete on public.medication_schedules
      for delete to authenticated
      using (private.is_family_member(family_id));
  end if;
end $$;

-- 4. Grant delete permissions to authenticated role
grant select, insert, update, delete on public.medications to authenticated;
grant select, insert, update, delete on public.medication_schedules to authenticated;

-- 5. Add medications, medication_schedules, and medication_logs to supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'medications'
  ) then
    alter publication supabase_realtime add table public.medications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'medication_schedules'
  ) then
    alter publication supabase_realtime add table public.medication_schedules;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'medication_logs'
  ) then
    alter publication supabase_realtime add table public.medication_logs;
  end if;
end $$;

