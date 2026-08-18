-- =====================================================================
-- Relatr — initial schema
-- Run this in Supabase SQL editor, or: supabase db push
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles: one row per auth.users, created automatically on signup
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  username text not null default '',
  bio text not null default '',
  emoji text not null default '🌿',
  avatar_color text not null default '#8B5FE0',
  birthday date,
  city text,
  school text,
  instagram text,
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- friends
-- ---------------------------------------------------------------------
create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  nickname text,
  avatar_color text not null default '#B084F5',
  emoji text not null default '😊',
  category text not null default 'Friend',
  phone text,
  instagram text,
  city text,
  school text,
  interests text[] not null default '{}',
  last_contacted timestamptz,
  reconnect_frequency_days int,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists friends_owner_id_idx on public.friends(owner_id);

-- ---------------------------------------------------------------------
-- important_dates (belongs to a friend)
-- ---------------------------------------------------------------------
create table if not exists public.important_dates (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  type text not null default 'Custom',
  date date not null,
  year_known boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists important_dates_friend_id_idx on public.important_dates(friend_id);
create index if not exists important_dates_owner_id_idx on public.important_dates(owner_id);

-- ---------------------------------------------------------------------
-- notes (belongs to a friend)
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  tag text,
  created_at timestamptz not null default now()
);

create index if not exists notes_friend_id_idx on public.notes(friend_id);
create index if not exists notes_owner_id_idx on public.notes(owner_id);

-- ---------------------------------------------------------------------
-- world_holidays (global, read-only for clients — written by edge function)
-- ---------------------------------------------------------------------
create table if not exists public.world_holidays (
  id uuid primary key default gen_random_uuid(),
  google_event_id text not null,
  country_code text not null,
  name text not null,
  description text,
  emoji text not null default '📅',
  event_date date not null,
  is_recurring_yearly boolean not null default true,
  source text not null default 'google_calendar',
  html_link text,
  created_at timestamptz not null default now(),
  unique (country_code, google_event_id)
);

-- =====================================================================
-- updated_at triggers
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_friends_updated_at on public.friends;
create trigger trg_friends_updated_at before update on public.friends
  for each row execute function public.set_updated_at();

-- =====================================================================
-- auto-create profile row on signup
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, username, emoji, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce('@' || split_part(new.email, '@', 1), ''),
    '🌿',
    '#8B5FE0'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.friends enable row level security;
alter table public.important_dates enable row level security;
alter table public.notes enable row level security;
alter table public.world_holidays enable row level security;

-- profiles: user can only see/edit their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- friends: owner-only full access
drop policy if exists "friends_all_own" on public.friends;
create policy "friends_all_own" on public.friends
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- important_dates: owner-only full access
drop policy if exists "important_dates_all_own" on public.important_dates;
create policy "important_dates_all_own" on public.important_dates
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- notes: owner-only full access
drop policy if exists "notes_all_own" on public.notes;
create policy "notes_all_own" on public.notes
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- world_holidays: readable by any authenticated user, writes only via
-- service role (the edge function), so no insert/update/delete policy
-- for regular users is defined.
drop policy if exists "world_holidays_select_all" on public.world_holidays;
create policy "world_holidays_select_all" on public.world_holidays
  for select using (auth.role() = 'authenticated');

-- =====================================================================
-- Realtime: add tables to the supabase_realtime publication
-- =====================================================================
alter publication supabase_realtime add table public.friends;
alter publication supabase_realtime add table public.important_dates;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.world_holidays;
