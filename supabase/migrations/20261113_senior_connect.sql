-- ====================================================================
-- Senior Connect Migration: Realtime Audio/Video Calling & Connections
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

create or replace trigger senior_connections_touch
  before update on public.senior_connections
  for each row execute function public.touch_updated_at();

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

-- 5. Update profile visibility to allow viewing discoverable and connected seniors
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

-- 6. Enable Row Level Security (RLS)
alter table public.senior_connections enable row level security;
alter table public.senior_reports enable row level security;
alter table public.calls enable row level security;

-- Senior connections policies
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

-- Senior reports policy
drop policy if exists senior_reports_insert on public.senior_reports;
create policy senior_reports_insert on public.senior_reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Calls policies
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

-- 7. Grant access to authenticated users
grant select, insert, update on public.senior_connections to authenticated;
grant insert on public.senior_reports to authenticated;
grant select, insert, update on public.calls to authenticated;

-- 8. Add calls to realtime publication for instant incoming call alerts
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

