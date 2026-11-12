-- AI chat messages table for preserving conversation context & history across devices
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

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ai_chat_messages' and policyname = 'Users can view their own chat messages') then
    create policy "Users can view their own chat messages"
      on public.ai_chat_messages for select
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ai_chat_messages' and policyname = 'Users can insert their own chat messages') then
    create policy "Users can insert their own chat messages"
      on public.ai_chat_messages for insert
      with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ai_chat_messages' and policyname = 'Users can delete their own chat messages') then
    create policy "Users can delete their own chat messages"
      on public.ai_chat_messages for delete
      using (auth.uid() = user_id);
  end if;
end $$;

