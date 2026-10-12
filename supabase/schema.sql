-- ============================================================================
-- Uzzap backend schema (Supabase Postgres)
-- Project ref: ybpzfubyipllkdzdtuvp
--
-- HOW TO APPLY: paste this entire file into the Supabase dashboard
-- SQL editor (https://supabase.com/dashboard/project/ybpzfubyipllkdzdtuvp/sql)
-- and press Run. It is idempotent (safe to re-run).
--
-- Design notes:
-- - `profiles.id` is the Supabase Auth user id (uuid). `username` is the
--   legacy Uzzap user id (e.g. "bob") and stays the join key the app uses.
-- - Per-owner tables carry `owner_id` so Row Level Security isolates users.
-- - Timestamps are Unix epoch SECONDS (bigint) to match the app model.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user, created on sign-up
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null default '',
  phone_number text,
  first_name text,
  last_name text,
  avatar text,
  status text not null default 'offline',
  status_message text,
  push_token text,
  push_platform text,
  last_seen bigint,
  created_at bigint not null default extract(epoch from now()),
  updated_at bigint not null default extract(epoch from now())
);

-- ----------------------------------------------------------------------------
-- buddies — roster entries, one set per owner
-- ----------------------------------------------------------------------------
create table if not exists public.buddies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id text not null,
  display_name text not null default '',
  phone_number text,
  status text not null default 'offline',
  status_message text,
  is_blocked boolean not null default false,
  is_uzzap_user boolean not null default true,
  last_seen bigint,
  avatar text,
  groups text[] not null default '{}',
  amaz_cid text,
  created_at bigint not null default extract(epoch from now()),
  updated_at bigint not null default extract(epoch from now()),
  unique (owner_id, buddy_id)
);
create index if not exists buddies_owner_idx on public.buddies (owner_id);
create index if not exists buddies_status_idx on public.buddies (status);

-- ----------------------------------------------------------------------------
-- conversations — one per (owner, buddy)
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id text not null,
  last_message_id uuid,
  unread_count integer not null default 0,
  is_pinned boolean not null default false,
  draft_text text,
  updated_at bigint not null default extract(epoch from now()),
  unique (owner_id, buddy_id)
);
create index if not exists conversations_owner_idx on public.conversations (owner_id);

-- ----------------------------------------------------------------------------
-- messages — 1:1 chat history
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id text not null,
  type text not null default 'text',
  content text not null default '',
  timestamp bigint not null default extract(epoch from now()),
  status text not null default 'sent',
  receipt_requested boolean not null default true,
  offline_queued boolean not null default false,
  amaz_msg_id text,
  retry_count integer not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, timestamp);

-- ----------------------------------------------------------------------------
-- chat_rooms — group chat rooms (discoverable by all authenticated users)
-- ----------------------------------------------------------------------------
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'generated',
  topic text not null default '',
  max_users integer not null default 20,
  password_protected boolean not null default false,
  password_hash text,
  creator_id uuid references public.profiles (id) on delete set null,
  created_at bigint not null default extract(epoch from now()),
  last_active_at bigint,
  unread_count integer not null default 0
);
create index if not exists chat_rooms_name_idx on public.chat_rooms (name);
create index if not exists chat_rooms_type_idx on public.chat_rooms (type);

-- ----------------------------------------------------------------------------
-- chat_room_users — membership (member_id = auth uid)
-- ----------------------------------------------------------------------------
create table if not exists public.chat_room_users (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  username text not null default '',
  nick text not null default '',
  role text not null default 'participant',
  status text not null default 'offline',
  joined_at bigint not null default extract(epoch from now()),
  last_seen bigint,
  primary key (room_id, member_id)
);
create index if not exists chat_room_users_room_idx on public.chat_room_users (room_id);

-- ----------------------------------------------------------------------------
-- chat_messages — group chat history
-- ----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id text not null default '',
  sender_nick text not null default '',
  type text not null default 'groupchat',
  content text not null default '',
  timestamp bigint not null default extract(epoch from now()),
  recipient_id text,
  amaz_msg_id text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, timestamp);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.buddies enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_room_users enable row level security;
alter table public.chat_messages enable row level security;

-- profiles: users read everyone (directory), write only self
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_write_self" on public.profiles;
create policy "profiles_write_self" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- buddies: owner only
drop policy if exists "buddies_owner_all" on public.buddies;
create policy "buddies_owner_all" on public.buddies
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- conversations: owner only
drop policy if exists "conversations_owner_all" on public.conversations;
create policy "conversations_owner_all" on public.conversations
  for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- messages: owner of the parent conversation only
drop policy if exists "messages_owner_all" on public.messages;
create policy "messages_owner_all" on public.messages
  for all to authenticated using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  );

-- chat_rooms: readable by all authenticated users; creator manages
drop policy if exists "rooms_read_all" on public.chat_rooms;
create policy "rooms_read_all" on public.chat_rooms
  for select to authenticated using (true);
drop policy if exists "rooms_insert_auth" on public.chat_rooms;
create policy "rooms_insert_auth" on public.chat_rooms
  for insert to authenticated with check (auth.uid() = creator_id);
-- Room settings (topic, password flag) may be changed by the creator or
-- any current member; destructive deletes stay creator-only.
drop policy if exists "rooms_update_creator" on public.chat_rooms;
drop policy if exists "rooms_update_topic_member" on public.chat_rooms;
drop policy if exists "rooms_update_member" on public.chat_rooms;
create policy "rooms_update_member" on public.chat_rooms
  for update to authenticated using (
    auth.uid() = creator_id
    or exists (
      select 1 from public.chat_room_users m
      where m.room_id = id and m.member_id = auth.uid()
    )
  );
drop policy if exists "rooms_delete_creator" on public.chat_rooms;
create policy "rooms_delete_creator" on public.chat_rooms
  for delete to authenticated using (auth.uid() = creator_id);

-- chat_room_users: members readable; users manage own rows
drop policy if exists "room_users_read_member" on public.chat_room_users;
create policy "room_users_read_member" on public.chat_room_users
  for select to authenticated using (
    exists (
      select 1 from public.chat_room_users m
      where m.room_id = room_id and m.member_id = auth.uid()
    )
  );
drop policy if exists "room_users_self_all" on public.chat_room_users;
create policy "room_users_self_all" on public.chat_room_users
  for all to authenticated using (auth.uid() = member_id) with check (auth.uid() = member_id);
-- Moderators may manage (update role / remove) other members of their rooms.
drop policy if exists "room_users_moderator_manage" on public.chat_room_users;
create policy "room_users_moderator_manage" on public.chat_room_users
  for update to authenticated using (
    exists (
      select 1 from public.chat_room_users m
      where m.room_id = room_id and m.member_id = auth.uid() and m.role = 'moderator'
    )
  );
drop policy if exists "room_users_moderator_remove" on public.chat_room_users;
create policy "room_users_moderator_remove" on public.chat_room_users
  for delete to authenticated using (
    auth.uid() = member_id
    or exists (
      select 1 from public.chat_room_users m
      where m.room_id = room_id and m.member_id = auth.uid() and m.role = 'moderator'
    )
  );

-- chat_messages: readable/writable by room members
drop policy if exists "room_messages_member_all" on public.chat_messages;
create policy "room_messages_member_all" on public.chat_messages
  for all to authenticated using (
    exists (
      select 1 from public.chat_room_users m
      where m.room_id = room_id and m.member_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.chat_room_users m
      where m.room_id = room_id and m.member_id = auth.uid()
    )
  );

-- ============================================================================
-- Realtime publication (messages + rooms + roster + presence-side tables)
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'buddies') then
    alter publication supabase_realtime add table public.buddies;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_rooms') then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_room_users') then
    alter publication supabase_realtime add table public.chat_room_users;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- ============================================================================
-- Storage bucket for chat media (images / voice / files)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects
  for select to authenticated using (bucket_id = 'chat-media');
drop policy if exists "chat_media_write" on storage.objects;
create policy "chat_media_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'chat-media');
drop policy if exists "chat_media_delete_own" on storage.objects;
create policy "chat_media_delete_own" on storage.objects
  for delete to authenticated using (bucket_id = 'chat-media' and auth.uid() = owner);
