-- ====================================================================
-- Consolidated Migration Patch: 2026-11-13
-- Project: mrcuxavgdzxbaheshpzs (Saathi)
-- ====================================================================

-- 1. Extend profiles with senior discovery attributes
alter table public.profiles
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists is_discoverable boolean not null default true;

-- 2. Senior connections table (mutual consent model)
create table if not exists public.senior_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'blocked')),
  blocked_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint senior_connections_no_self check (requester_id <> recipient_id),
  constraint senior_connections_unique_pair unique (requester_id, recipient_id)
);

create index if not exists senior_connections_requester_idx on public.senior_connections(requester_id, status);
create index if not exists senior_connections_recipient_idx on public.senior_connections(recipient_id, status);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'senior_connections_touch'
  ) then
    create trigger senior_connections_touch
      before update on public.senior_connections
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- 3. Senior reports table
create table if not exists public.senior_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);

-- 4. Calls table
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'rejected', 'missed', 'ended')),
  room_name text not null unique,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index if not exists calls_caller_idx on public.calls(caller_id, created_at desc);
create index if not exists calls_receiver_idx on public.calls(receiver_id, created_at desc);
create index if not exists calls_active_idx on public.calls(room_name) where status in ('ringing', 'accepted');

-- 5. Profile visibility helper
create or replace function private.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    p_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p where p.id = p_user_id and p.is_discoverable = true
    )
    or exists (
      select 1 from public.family_members actor
      join public.family_members target on target.family_id = actor.family_id
      where actor.user_id = auth.uid() and actor.status = 'active'
        and target.user_id = p_user_id and target.status = 'active'
    )
    or exists (
      select 1 from public.senior_connections sc
      where ((sc.requester_id = auth.uid() and sc.recipient_id = p_user_id)
         or (sc.recipient_id = auth.uid() and sc.requester_id = p_user_id))
        and sc.status <> 'blocked'
    )
  );
$$;

-- 6. Enable RLS and policies for senior connect
alter table public.senior_connections enable row level security;
alter table public.senior_reports enable row level security;
alter table public.calls enable row level security;

drop policy if exists senior_connections_select on public.senior_connections;
create policy senior_connections_select on public.senior_connections for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists senior_connections_insert on public.senior_connections;
create policy senior_connections_insert on public.senior_connections for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists senior_connections_update on public.senior_connections;
create policy senior_connections_update on public.senior_connections for update to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid())
  with check (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists senior_reports_insert on public.senior_reports;
create policy senior_reports_insert on public.senior_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert to authenticated
  with check (caller_id = auth.uid());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid())
  with check (caller_id = auth.uid() or receiver_id = auth.uid());

grant select, insert, update on public.senior_connections to authenticated;
grant insert on public.senior_reports to authenticated;
grant select, insert, update on public.calls to authenticated;

-- 7. Allow elderly users to perform all CRUD operations on medications and schedules
drop policy if exists medications_caregiver_insert on public.medications;
drop policy if exists medications_caregiver_update on public.medications;
drop policy if exists schedules_caregiver_insert on public.medication_schedules;
drop policy if exists schedules_caregiver_update on public.medication_schedules;

drop policy if exists medications_member_insert on public.medications;
create policy medications_member_insert on public.medications
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_family_member(family_id)
    and private.family_has_user(family_id, elderly_user_id)
  );

drop policy if exists medications_member_update on public.medications;
create policy medications_member_update on public.medications
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (
    private.is_family_member(family_id)
    and private.family_has_user(family_id, elderly_user_id)
  );

drop policy if exists medications_member_delete on public.medications;
create policy medications_member_delete on public.medications
  for delete to authenticated
  using (private.is_family_member(family_id));

drop policy if exists schedules_member_insert on public.medication_schedules;
create policy schedules_member_insert on public.medication_schedules
  for insert to authenticated
  with check (private.is_family_member(family_id));

drop policy if exists schedules_member_update on public.medication_schedules;
create policy schedules_member_update on public.medication_schedules
  for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

drop policy if exists schedules_member_delete on public.medication_schedules;
create policy schedules_member_delete on public.medication_schedules
  for delete to authenticated
  using (private.is_family_member(family_id));

grant select, insert, update, delete on public.medications to authenticated;
grant select, insert, update, delete on public.medication_schedules to authenticated;

-- 8. Add tables to supabase_realtime publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'calls') then
    alter publication supabase_realtime add table public.calls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'medications') then
    alter publication supabase_realtime add table public.medications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'medication_schedules') then
    alter publication supabase_realtime add table public.medication_schedules;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'medication_logs') then
    alter publication supabase_realtime add table public.medication_logs;
  end if;
end $$;

-- 9. AI chat messages table for persistent conversation history
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  role text not null check (role in ('user', 'model', 'system')),
  content text not null,
  model text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_chat_messages_user_created
  on public.ai_chat_messages (user_id, created_at asc);

alter table public.ai_chat_messages enable row level security;

drop policy if exists "Users can view their own chat messages" on public.ai_chat_messages;
create policy "Users can view their own chat messages"
  on public.ai_chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own chat messages" on public.ai_chat_messages;
create policy "Users can insert their own chat messages"
  on public.ai_chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own chat messages" on public.ai_chat_messages;
create policy "Users can delete their own chat messages"
  on public.ai_chat_messages for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.ai_chat_messages to authenticated;

