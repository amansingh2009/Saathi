-- Saathi schema. All exposed public tables use explicit grants and row-level security.
create schema if not exists private;
revoke create on schema public from public, anon, authenticated;
grant usage on schema private to authenticated;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en','hi','ta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('elderly','caregiver')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default now(),
  unique (family_id,user_id)
);
create index family_members_user_family_idx on public.family_members(user_id,family_id) where status='active';
create index family_members_family_role_idx on public.family_members(family_id,role) where status='active';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text,
  role text not null check (role in ('elderly','caregiver')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_family_idx on public.invitations(family_id,created_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  assigned_to uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,family_id)
);
create index tasks_family_due_idx on public.tasks(family_id,due_at);
create index tasks_assignee_status_idx on public.tasks(assigned_to,status,due_at);

create table public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  action text not null check (action in ('completed','reopened')),
  note text,
  created_at timestamptz not null default now(),
  foreign key(task_id,family_id) references public.tasks(id,family_id) on delete cascade
);
create index task_logs_task_created_idx on public.task_logs(task_id,created_at desc);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  elderly_user_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 160),
  dosage text,
  instructions text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,family_id)
);
create index medications_family_user_idx on public.medications(family_id,elderly_user_id,is_active);

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null,
  family_id uuid not null references public.families(id) on delete cascade,
  scheduled_time time not null,
  days_of_week smallint[] not null check (cardinality(days_of_week) between 1 and 7),
  timezone text not null default 'Asia/Kolkata',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (0 <= all(days_of_week) and 6 >= all(days_of_week)),
  foreign key(medication_id,family_id) references public.medications(id,family_id) on delete cascade
);
create index medication_schedules_medication_idx on public.medication_schedules(medication_id,scheduled_time) where is_active;

create table public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  scheduled_for timestamptz,
  status text not null check (status in ('confirmed_taken','skipped','not_confirmed')),
  note text,
  created_at timestamptz not null default now()
);
create index medication_logs_medication_created_idx on public.medication_logs(medication_id,created_at desc);
create index medication_logs_family_created_idx on public.medication_logs(family_id,created_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  elderly_user_id uuid not null references auth.users(id),
  caregiver_user_id uuid references auth.users(id),
  scope text not null check (scope in ('screen_guidance','activity_sharing')),
  granted boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index consent_family_elder_idx on public.consent_records(family_id,elderly_user_id,scope,created_at desc);

create table public.screen_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  elderly_user_id uuid not null references auth.users(id),
  caregiver_user_id uuid not null references auth.users(id),
  reason text,
  status text not null default 'requested' check (status in ('requested','consented','active','ended','declined')),
  consented_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index screen_sessions_family_created_idx on public.screen_sessions(family_id,created_at desc);

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  elderly_user_id uuid not null references auth.users(id),
  message text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='open' and acknowledged_at is null and resolved_at is null)
    or (status='acknowledged' and acknowledged_at is not null and resolved_at is null)
    or (status='resolved' and acknowledged_at is not null and resolved_at is not null))
);
create index emergency_family_status_idx on public.emergency_events(family_id,status,created_at desc);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_tokens_family_user_idx on public.device_tokens(family_id,user_id);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  emergency_event_id uuid references public.emergency_events(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('queued','sent','failed','not_configured','no_registered_devices')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);
create index notification_logs_event_idx on public.notification_logs(emergency_event_id,created_at desc);

create or replace function private.is_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_members fm
    where fm.family_id=p_family_id and fm.user_id=auth.uid() and fm.status='active'
  );
$$;
create or replace function private.is_family_caregiver(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_members fm
    where fm.family_id=p_family_id and fm.user_id=auth.uid() and fm.status='active' and fm.role='caregiver'
  );
$$;
create or replace function private.is_family_elderly(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_members fm
    where fm.family_id=p_family_id and fm.user_id=auth.uid() and fm.status='active' and fm.role='elderly'
  );
$$;
create or replace function private.family_has_user(p_family_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_members fm
    where fm.family_id=p_family_id and fm.user_id=p_user_id and fm.status='active'
  );
$$;
create or replace function private.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (p_user_id=auth.uid() or exists (
    select 1 from public.family_members actor
    join public.family_members target on target.family_id=actor.family_id
    where actor.user_id=auth.uid() and actor.status='active'
      and target.user_id=p_user_id and target.status='active'
  ));
$$;
revoke all on function private.is_family_member(uuid),private.is_family_caregiver(uuid),private.is_family_elderly(uuid),private.family_has_user(uuid,uuid),private.can_view_profile(uuid) from public,anon;
grant execute on function private.is_family_member(uuid),private.is_family_caregiver(uuid),private.is_family_elderly(uuid),private.family_has_user(uuid,uuid),private.can_view_profile(uuid) to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
grant execute on function public.touch_updated_at() to authenticated, anon;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger families_touch before update on public.families for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger medications_touch before update on public.medications for each row execute function public.touch_updated_at();
create trigger screen_sessions_touch before update on public.screen_sessions for each row execute function public.touch_updated_at();
create trigger emergency_events_touch before update on public.emergency_events for each row execute function public.touch_updated_at();
create trigger device_tokens_touch before update on public.device_tokens for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,full_name)
  values(new.id,new.email,new.raw_user_meta_data->>'full_name')
  on conflict(id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.add_family_creator_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.family_members(family_id,user_id,role) values(new.id,new.created_by,'caregiver');
  return new;
end;
$$;
grant execute on function public.handle_new_auth_user() to authenticated, anon;
grant execute on function public.add_family_creator_membership() to authenticated, anon;
create trigger family_creator_membership after insert on public.families for each row execute function public.add_family_creator_membership();

create or replace function public.accept_family_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; member public.family_members; actor_email text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  actor_email := lower(coalesce(auth.jwt()->>'email',''));
  select * into inv from public.invitations where token_hash=p_token_hash and accepted_at is null and expires_at>now() for update;
  if not found then raise exception 'invitation unavailable' using errcode='P0002'; end if;
  if inv.email is not null and lower(inv.email)<>actor_email then raise exception 'invitation email mismatch' using errcode='42501'; end if;
  insert into public.family_members(family_id,user_id,role) values(inv.family_id,auth.uid(),inv.role)
    on conflict(family_id,user_id) do update set role=excluded.role,status='active',joined_at=now()
    returning * into member;
  update public.invitations set accepted_at=now() where id=inv.id;
  return jsonb_build_object('family_id',member.family_id,'user_id',member.user_id,'role',member.role,'status',member.status);
end;
$$;

create or replace function public.complete_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tasks; logrow public.task_logs;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into t from public.tasks where id=p_task_id for update;
  if not found or not private.is_family_member(t.family_id) then raise exception 'task unavailable' using errcode='P0002'; end if;
  if t.assigned_to<>auth.uid() and not private.is_family_caregiver(t.family_id) then raise exception 'not authorized' using errcode='42501'; end if;
  if t.status='completed' then raise exception 'task already completed' using errcode='P0001'; end if;
  update public.tasks set status='completed',completed_at=now() where id=t.id;
  insert into public.task_logs(task_id,family_id,user_id,action) values(t.id,t.family_id,auth.uid(),'completed') returning * into logrow;
  return to_jsonb(logrow);
end;
$$;

create or replace function public.record_medication_status(p_medication_id uuid,p_status text,p_scheduled_for timestamptz default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.medications; logrow public.medication_logs;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_status not in ('confirmed_taken','skipped') then raise exception 'invalid medicine status' using errcode='22023'; end if;
  select * into m from public.medications where id=p_medication_id and is_active for update;
  if not found or not private.is_family_member(m.family_id) then raise exception 'medicine unavailable' using errcode='P0002'; end if;
  if p_status='confirmed_taken' and auth.uid()<>m.elderly_user_id then raise exception 'only the person taking the medicine can confirm it' using errcode='42501'; end if;
  if auth.uid()<>m.elderly_user_id and not private.is_family_caregiver(m.family_id) then raise exception 'not authorized' using errcode='42501'; end if;
  insert into public.medication_logs(medication_id,family_id,user_id,scheduled_for,status,note)
    values(m.id,m.family_id,auth.uid(),p_scheduled_for,p_status,p_note) returning * into logrow;
  return to_jsonb(logrow);
end;
$$;

create or replace function public.consent_to_guidance_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.screen_sessions;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into s from public.screen_sessions where id=p_session_id for update;
  if not found or s.elderly_user_id<>auth.uid() or s.status<>'requested' then raise exception 'session unavailable' using errcode='42501'; end if;
  update public.screen_sessions set status='consented',consented_at=now() where id=s.id returning * into s;
  insert into public.consent_records(family_id,elderly_user_id,caregiver_user_id,scope,granted)
    values(s.family_id,s.elderly_user_id,s.caregiver_user_id,'screen_guidance',true);
  return to_jsonb(s);
end;
$$;

create or replace function public.end_guidance_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.screen_sessions;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into s from public.screen_sessions where id=p_session_id for update;
  if not found or (auth.uid()<>s.elderly_user_id and auth.uid()<>s.caregiver_user_id) then raise exception 'session unavailable' using errcode='42501'; end if;
  if s.status='ended' then return to_jsonb(s); end if;
  update public.screen_sessions set status='ended',ended_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
end;
$$;

create or replace function public.start_guidance_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.screen_sessions;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into s from public.screen_sessions where id=p_session_id for update;
  if not found or s.elderly_user_id<>auth.uid() or s.status<>'consented' then raise exception 'session unavailable' using errcode='42501'; end if;
  update public.screen_sessions set status='active',started_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
end;
$$;

create or replace function public.decline_guidance_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.screen_sessions;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into s from public.screen_sessions where id=p_session_id for update;
  if not found or s.elderly_user_id<>auth.uid() or s.status<>'requested' then raise exception 'session unavailable' using errcode='42501'; end if;
  update public.screen_sessions set status='declined',ended_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
end;
$$;

create or replace function public.acknowledge_emergency(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id for update;
  if not found or not private.is_family_caregiver(e.family_id) then raise exception 'event unavailable' using errcode='42501'; end if;
  if e.status<>'open' then raise exception 'event cannot be acknowledged' using errcode='P0001'; end if;
  update public.emergency_events set status='acknowledged',acknowledged_by=auth.uid(),acknowledged_at=now() where id=e.id returning * into e;
  return to_jsonb(e);
end;
$$;

create or replace function public.resolve_emergency(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id for update;
  if not found or not private.is_family_caregiver(e.family_id) or e.status<>'acknowledged' then raise exception 'event cannot be resolved' using errcode='42501'; end if;
  update public.emergency_events set status='resolved',resolved_by=auth.uid(),resolved_at=now() where id=e.id returning * into e;
  return to_jsonb(e);
end;
$$;

create or replace function public.emergency_notification_targets(p_event_id uuid)
returns table(user_id uuid,token text) language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id;
  if not found or (auth.uid()<>e.elderly_user_id and not private.is_family_caregiver(e.family_id)) then raise exception 'event unavailable' using errcode='42501'; end if;
  return query select dt.user_id,dt.token from public.device_tokens dt
    join public.family_members fm on fm.family_id=dt.family_id and fm.user_id=dt.user_id
    where dt.family_id=e.family_id and fm.role='caregiver' and fm.status='active';
end;
$$;

create or replace function public.record_emergency_notification(p_event_id uuid,p_recipient_id uuid,p_status text,p_provider_message_id text default null,p_error_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events; l public.notification_logs;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id;
  if not found or (auth.uid()<>e.elderly_user_id and not private.is_family_caregiver(e.family_id)) then raise exception 'event unavailable' using errcode='42501'; end if;
  if p_status not in ('sent','failed','not_configured','no_registered_devices') then raise exception 'invalid status' using errcode='22023'; end if;
  insert into public.notification_logs(family_id,emergency_event_id,user_id,status,provider_message_id,error_message)
    values(e.family_id,e.id,p_recipient_id,p_status,p_provider_message_id,p_error_message) returning * into l;
  return to_jsonb(l);
end;
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.invitations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.medications enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.medication_logs enable row level security;
alter table public.consent_records enable row level security;
alter table public.screen_sessions enable row level security;
alter table public.emergency_events enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notification_logs enable row level security;

create policy profiles_visible_select on public.profiles for select to authenticated using (private.can_view_profile(id));
create policy profiles_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy families_member_select on public.families for select to authenticated using (created_by = (select auth.uid()) or private.is_family_member(id));
create policy families_creator_insert on public.families for insert to authenticated with check (created_by=auth.uid());
create policy families_caregiver_update on public.families for update to authenticated using (private.is_family_caregiver(id)) with check (private.is_family_caregiver(id));
create policy family_members_visible_to_family on public.family_members for select to authenticated using (user_id=auth.uid() or private.is_family_member(family_id));
create policy invitations_caregiver_select on public.invitations for select to authenticated using (private.is_family_caregiver(family_id));
create policy invitations_caregiver_insert on public.invitations for insert to authenticated with check (invited_by=auth.uid() and private.is_family_caregiver(family_id));
create policy tasks_member_select on public.tasks for select to authenticated using (private.is_family_member(family_id));
create policy tasks_caregiver_insert on public.tasks for insert to authenticated with check (assigned_by=auth.uid() and private.is_family_caregiver(family_id) and private.family_has_user(family_id,assigned_to));
create policy tasks_caregiver_update on public.tasks for update to authenticated using (private.is_family_caregiver(family_id)) with check (private.is_family_caregiver(family_id) and private.family_has_user(family_id,assigned_to));
create policy tasks_caregiver_delete on public.tasks for delete to authenticated using (private.is_family_caregiver(family_id));
create policy task_logs_member_select on public.task_logs for select to authenticated using (private.is_family_member(family_id));
create policy medications_member_select on public.medications for select to authenticated using (private.is_family_member(family_id));
create policy medications_caregiver_insert on public.medications for insert to authenticated with check (created_by=auth.uid() and private.is_family_caregiver(family_id) and private.family_has_user(family_id,elderly_user_id));
create policy medications_caregiver_update on public.medications for update to authenticated using (private.is_family_caregiver(family_id)) with check (private.is_family_caregiver(family_id) and private.family_has_user(family_id,elderly_user_id));
create policy schedules_member_select on public.medication_schedules for select to authenticated using (private.is_family_member(family_id));
create policy schedules_caregiver_insert on public.medication_schedules for insert to authenticated with check (private.is_family_caregiver(family_id));
create policy schedules_caregiver_update on public.medication_schedules for update to authenticated using (private.is_family_caregiver(family_id)) with check (private.is_family_caregiver(family_id));
create policy medication_logs_member_select on public.medication_logs for select to authenticated using (private.is_family_member(family_id));
create policy consent_member_select on public.consent_records for select to authenticated using (private.is_family_member(family_id));
create policy consent_elder_insert on public.consent_records for insert to authenticated with check (elderly_user_id=auth.uid() and private.is_family_elderly(family_id));
create policy sessions_member_select on public.screen_sessions for select to authenticated using (private.is_family_member(family_id));
create policy sessions_caregiver_insert on public.screen_sessions for insert to authenticated with check (caregiver_user_id=auth.uid() and private.is_family_caregiver(family_id) and private.family_has_user(family_id,elderly_user_id));
create policy emergencies_member_select on public.emergency_events for select to authenticated using (private.is_family_member(family_id));
create policy emergencies_elder_insert on public.emergency_events for insert to authenticated with check (elderly_user_id=auth.uid() and private.is_family_elderly(family_id));
create policy devices_owner_select on public.device_tokens for select to authenticated using (user_id=auth.uid() and private.is_family_member(family_id));
create policy devices_owner_insert on public.device_tokens for insert to authenticated with check (user_id=auth.uid() and private.is_family_member(family_id));
create policy devices_owner_update on public.device_tokens for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid() and private.is_family_member(family_id));
create policy devices_owner_delete on public.device_tokens for delete to authenticated using (user_id=auth.uid());
create policy notifications_family_select on public.notification_logs for select to authenticated using (private.is_family_member(family_id));

grant select(id,full_name,phone,preferred_language),update(full_name,phone,preferred_language) on public.profiles to authenticated;
grant select,insert,update on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select,insert on public.invitations to authenticated;
grant select,insert,update,delete on public.tasks to authenticated;
grant select on public.task_logs to authenticated;
grant select,insert,update on public.medications to authenticated;
grant select,insert,update on public.medication_schedules to authenticated;
grant select on public.medication_logs to authenticated;
grant select,insert on public.consent_records to authenticated;
grant select,insert on public.screen_sessions to authenticated;
grant select,insert on public.emergency_events to authenticated;
grant select,insert,update,delete on public.device_tokens to authenticated;
grant select on public.notification_logs to authenticated;

revoke all on function public.accept_family_invitation(text),public.complete_task(uuid),public.record_medication_status(uuid,text,timestamptz,text),public.consent_to_guidance_session(uuid),public.start_guidance_session(uuid),public.decline_guidance_session(uuid),public.end_guidance_session(uuid),public.acknowledge_emergency(uuid),public.resolve_emergency(uuid),public.emergency_notification_targets(uuid),public.record_emergency_notification(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.accept_family_invitation(text),public.complete_task(uuid),public.record_medication_status(uuid,text,timestamptz,text),public.consent_to_guidance_session(uuid),public.start_guidance_session(uuid),public.decline_guidance_session(uuid),public.end_guidance_session(uuid),public.acknowledge_emergency(uuid),public.resolve_emergency(uuid),public.emergency_notification_targets(uuid),public.record_emergency_notification(uuid,uuid,text,text,text) to authenticated;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_logs;
alter publication supabase_realtime add table public.medication_logs;
alter publication supabase_realtime add table public.emergency_events;

-- Private per-session rooms let only the two named session participants exchange ephemeral frames.
create policy guidance_participant_receive on realtime.messages
  for select to authenticated
  using (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status='active'
      and (s.elderly_user_id=auth.uid() or s.caregiver_user_id=auth.uid())
  ));
create policy guidance_elder_publish on realtime.messages
  for insert to authenticated
  with check (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status='active'
      and s.elderly_user_id=auth.uid()
  ));
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
alter publication supabase_realtime add table public.screen_sessions;
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
alter policy guidance_participant_receive on realtime.messages
  using (exists (
    select 1 from public.screen_sessions s
    where realtime.topic()='guidance:' || s.id::text and s.status in ('active','ended','declined')
      and (s.elderly_user_id=(select auth.uid()) or s.caregiver_user_id=(select auth.uid()))
  ));
create index if not exists medication_schedules_family_idx on public.medication_schedules(family_id);
create index if not exists notification_logs_family_idx on public.notification_logs(family_id);
create or replace function public.record_emergency_notification(p_event_id uuid,p_recipient_id uuid,p_status text,p_provider_message_id text default null,p_error_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.emergency_events; l public.notification_logs;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into e from public.emergency_events where id=p_event_id;
  if not found or (auth.uid()<>e.elderly_user_id and not private.is_family_caregiver(e.family_id)) then raise exception 'event unavailable' using errcode='42501'; end if;
  if p_status not in ('sent','failed','not_configured','no_registered_devices') then raise exception 'invalid status' using errcode='22023'; end if;
  if p_recipient_id<>e.elderly_user_id and not private.family_has_user(e.family_id,p_recipient_id) then raise exception 'recipient unavailable' using errcode='42501'; end if;
  if length(coalesce(p_provider_message_id,''))>512 or length(coalesce(p_error_message,''))>200 then raise exception 'notification details too long' using errcode='22023'; end if;
  insert into public.notification_logs(family_id,emergency_event_id,user_id,status,provider_message_id,error_message)
    values(e.family_id,e.id,p_recipient_id,p_status,p_provider_message_id,p_error_message) returning * into l;
  return to_jsonb(l);
end;
$$;
