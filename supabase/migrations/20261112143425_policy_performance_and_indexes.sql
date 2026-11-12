-- Evaluate stable auth and membership checks once per statement and cover foreign keys.
alter policy profiles_self_update on public.profiles
  using (id=(select auth.uid())) with check (id=(select auth.uid()));
alter policy families_creator_insert on public.families
  with check (created_by=(select auth.uid()));
alter policy family_members_visible_to_family on public.family_members
  using (user_id=(select auth.uid()) or (select private.is_family_member(family_id)));
alter policy invitations_caregiver_insert on public.invitations
  with check (invited_by=(select auth.uid()) and (select private.is_family_caregiver(family_id)));
alter policy tasks_caregiver_insert on public.tasks
  with check (assigned_by=(select auth.uid()) and (select private.is_family_caregiver(family_id)) and (select private.family_has_user(family_id,assigned_to)));
alter policy medications_caregiver_insert on public.medications
  with check (created_by=(select auth.uid()) and (select private.is_family_caregiver(family_id)) and (select private.family_has_user(family_id,elderly_user_id)));
alter policy consent_elder_insert on public.consent_records
  with check (elderly_user_id=(select auth.uid()) and (select private.is_family_elderly(family_id)));
alter policy sessions_caregiver_insert on public.screen_sessions
  with check (caregiver_user_id=(select auth.uid()) and (select private.is_family_caregiver(family_id)) and (select private.family_has_user(family_id,elderly_user_id)));
alter policy emergencies_elder_insert on public.emergency_events
  with check (elderly_user_id=(select auth.uid()) and (select private.is_family_elderly(family_id)));
alter policy devices_owner_select on public.device_tokens
  using (user_id=(select auth.uid()) and (select private.is_family_member(family_id)));
alter policy devices_owner_insert on public.device_tokens
  with check (user_id=(select auth.uid()) and (select private.is_family_member(family_id)));
alter policy devices_owner_update on public.device_tokens
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and (select private.is_family_member(family_id)));
alter policy devices_owner_delete on public.device_tokens
  using (user_id=(select auth.uid()));
alter policy guidance_participant_receive on realtime.messages
  using (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status='active'
      and (s.elderly_user_id=(select auth.uid()) or s.caregiver_user_id=(select auth.uid()))
  ));
alter policy guidance_elder_publish on realtime.messages
  with check (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status='active'
      and s.elderly_user_id=(select auth.uid())
  ));

create index if not exists consent_records_caregiver_idx on public.consent_records(caregiver_user_id) where caregiver_user_id is not null;
create index if not exists consent_records_elder_idx on public.consent_records(elderly_user_id);
create index if not exists device_tokens_user_idx on public.device_tokens(user_id);
create index if not exists emergency_events_acknowledged_by_idx on public.emergency_events(acknowledged_by) where acknowledged_by is not null;
create index if not exists emergency_events_elderly_user_idx on public.emergency_events(elderly_user_id);
create index if not exists emergency_events_resolved_by_idx on public.emergency_events(resolved_by) where resolved_by is not null;
create index if not exists families_created_by_idx on public.families(created_by);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);
create index if not exists medication_logs_user_idx on public.medication_logs(user_id);
create index if not exists medication_schedules_medication_family_idx on public.medication_schedules(medication_id,family_id);
create index if not exists medications_created_by_idx on public.medications(created_by);
create index if not exists medications_elderly_user_idx on public.medications(elderly_user_id);
create index if not exists notification_logs_user_idx on public.notification_logs(user_id);
create index if not exists screen_sessions_caregiver_idx on public.screen_sessions(caregiver_user_id);
create index if not exists screen_sessions_elderly_idx on public.screen_sessions(elderly_user_id);
create index if not exists task_logs_family_idx on public.task_logs(family_id);
create index if not exists task_logs_task_family_idx on public.task_logs(task_id,family_id);
create index if not exists task_logs_user_idx on public.task_logs(user_id);
create index if not exists tasks_assigned_by_idx on public.tasks(assigned_by);

create or replace function public.end_guidance_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.screen_sessions;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into s from public.screen_sessions where id=p_session_id for update;
  if not found or (auth.uid()<>s.elderly_user_id and auth.uid()<>s.caregiver_user_id) then raise exception 'session unavailable' using errcode='42501'; end if;
  if s.status='ended' then return to_jsonb(s); end if;
  update public.screen_sessions set status='ended',ended_at=now() where id=s.id returning * into s;
  update public.consent_records set revoked_at=now()
    where family_id=s.family_id and elderly_user_id=s.elderly_user_id
      and caregiver_user_id=s.caregiver_user_id and scope='screen_guidance' and revoked_at is null;
  return to_jsonb(s);
end;
$$;
