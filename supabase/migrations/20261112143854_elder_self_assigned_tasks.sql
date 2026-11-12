drop policy tasks_caregiver_insert on public.tasks;
create policy tasks_authorized_insert on public.tasks for insert to authenticated with check (
  (
    (select private.is_family_caregiver(family_id))
    and assigned_by=(select auth.uid())
    and (select private.family_has_user(family_id,assigned_to))
  )
  or
  (
    (select private.is_family_elderly(family_id))
    and assigned_by=(select auth.uid())
    and assigned_to=(select auth.uid())
  )
);
