-- =====================================================================
-- Relatr — extended profiles (NEW fields, social links, blocked users,
-- account deletion, avatar storage)
-- Run this in Supabase SQL editor, or: supabase db push
-- Safe to re-run: every statement is idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- friends: new optional columns (see FriendRow in src/types/index.ts)
-- ---------------------------------------------------------------------
alter table public.friends
  add column if not exists photo_uri text,
  add column if not exists gender text,
  add column if not exists gender_custom text,
  add column if not exists pronouns text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists how_we_met text,
  add column if not exists relationship_start_date date,
  add column if not exists favorite_food text,
  add column if not exists allergies_or_dislikes text,
  add column if not exists love_language text,
  add column if not exists gift_preferences_note text,
  add column if not exists personality_notes text,
  add column if not exists is_archived boolean not null default false;

do $$ begin
  alter table public.friends
    add constraint friends_gender_check
    check (gender is null or gender in ('Woman', 'Man', 'Non-binary', 'Prefer not to say', 'Custom'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.friends
    add constraint friends_love_language_check
    check (
      love_language is null or love_language in (
        'Words of Affirmation', 'Quality Time', 'Acts of Service', 'Gifts', 'Physical Touch'
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists friends_is_archived_idx on public.friends(is_archived);

-- ---------------------------------------------------------------------
-- profiles: new optional/notification/privacy columns
-- (see ProfileRow in src/types/index.ts)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists push_enabled boolean not null default true,
  add column if not exists message_notif boolean not null default true,
  add column if not exists likes_notif boolean not null default true,
  add column if not exists sound_enabled boolean not null default true,
  add column if not exists sync_contacts boolean not null default false,
  add column if not exists sync_calendar boolean not null default false,
  add column if not exists private_account boolean not null default false,
  add column if not exists activity_status boolean not null default true,
  add column if not exists blocked_user_ids uuid[] not null default '{}';

-- ---------------------------------------------------------------------
-- social_links (belongs to a friend) — see SocialLinkRow
-- ---------------------------------------------------------------------
create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  friend_id uuid not null references public.friends(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  handle text not null,
  created_at timestamptz not null default now()
);

create index if not exists social_links_friend_id_idx on public.social_links(friend_id);
create index if not exists social_links_owner_id_idx on public.social_links(owner_id);

alter table public.social_links enable row level security;

drop policy if exists "social_links_all_own" on public.social_links;
create policy "social_links_all_own" on public.social_links
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

alter publication supabase_realtime add table public.social_links;

-- ---------------------------------------------------------------------
-- blocked_users — see BlockedUserRow. Used by useProfileSettings.ts
-- (loadBlockedUsers / unblockUser).
-- ---------------------------------------------------------------------
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocker_id_idx on public.blocked_users(blocker_id);
create index if not exists blocked_users_blocked_id_idx on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

-- A user can see rows where they are either side, so unblockUser's join
-- (blocked_users -> profiles:blocked_id) can resolve the blocked profile's
-- name/username/avatar even though that profile isn't theirs.
drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own" on public.blocked_users
  for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);

drop policy if exists "blocked_users_insert_own" on public.blocked_users;
create policy "blocked_users_insert_own" on public.blocked_users
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "blocked_users_delete_own" on public.blocked_users;
create policy "blocked_users_delete_own" on public.blocked_users
  for delete using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------
-- delete_own_account(): lets a signed-in user delete their own
-- auth.users row (and, via ON DELETE CASCADE, all of their friends,
-- notes, important_dates, social_links, and their profiles row).
-- security definer is required because deleting from auth.users needs
-- elevated privilege; search_path is pinned to avoid hijacking.
-- ---------------------------------------------------------------------
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------
-- avatars storage bucket (public read, owner-only write) — used by
-- useProfileSettings.ts (pickAndUploadAvatar / removeAvatar).
-- Files are stored at `<user_id>/avatar_<timestamp>.<ext>` so the
-- policies below can check the first path segment against auth.uid().
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
