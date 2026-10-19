// =====================================================================
// Shared app types. camelCase = app models, snake_case *Row = Postgres rows.
// Mapping between them lives in src/utils/mappers.ts.
// =====================================================================

export type RelationshipCategory =
  | 'Best Friend'
  | 'Close Friend'
  | 'Friend'
  | 'Classmate'
  | 'Family'
  | 'Roommate'
  | 'Acquaintance'
  | 'Situationship'
  | 'Coworker';

export type ImportantDateType = 'Birthday' | 'Anniversary' | 'Graduation' | 'Meet Day' | 'Custom';

export type Gender = 'Woman' | 'Man' | 'Non-binary' | 'Prefer not to say' | 'Custom';

export type LoveLanguage =
  | 'Words of Affirmation'
  | 'Quality Time'
  | 'Acts of Service'
  | 'Gifts'
  | 'Physical Touch';

export type NoteTag = 'Conversation' | 'Interest' | 'Important Detail' | 'Memory';

export interface SocialLink {
  id: string;
  platform: string; // 'Instagram' | 'Snapchat' | 'TikTok' | 'X' | 'LinkedIn' | 'WhatsApp' | 'Other'
  handle: string;
}

export interface ImportantDate {
  id: string;
  label: string;
  type: ImportantDateType;
  date: string; // ISO string (year may be arbitrary if unknown)
  yearKnown: boolean;
}

export interface Note {
  id: string;
  content: string;
  createdAt: string; // ISO date
  tag?: NoteTag;
}

export interface Friend {
  id: string;
  name: string;
  nickname?: string;
  avatarColor: string;
  emoji: string;
  category: RelationshipCategory;
  phone?: string;
  instagram?: string; // legacy shortcut; prefer socialLinks
  city?: string;
  school?: string;
  interests: string[];
  importantDates: ImportantDate[];
  notes: Note[];
  lastContacted?: string; // ISO date
  reconnectFrequencyDays?: number; // e.g. reconnect every 30 days
  favorite: boolean;
  createdAt: string;

  photoUri?: string;
  gender?: Gender;
  genderCustom?: string;
  pronouns?: string;
  email?: string;
  address?: string;
  howWeMet?: string;
  relationshipStartDate?: string; // ISO
  favoriteFood?: string;
  allergiesOrDislikes?: string;
  loveLanguage?: LoveLanguage;
  giftPreferencesNote?: string;
  personalityNotes?: string;
  socialLinks: SocialLink[];
  isArchived: boolean;
  updatedAt: string; // ISO
}

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  bio: string;
  emoji: string;
  avatarColor: string;
  birthday?: string;
  city?: string;
  school?: string;
  instagram?: string;
  interests: string[];

  avatarUrl?: string;
  pushEnabled: boolean;
  messageNotif: boolean;
  likesNotif: boolean;
  soundEnabled: boolean;
  syncContacts: boolean;
  syncCalendar: boolean;
  privateAccount: boolean;
  activityStatus: boolean;
  blockedUserIds: string[];
  mfaEnabled: boolean;

  onboardingCompleted: boolean;
}

export type SpecialDayCategory =
  | 'national'
  | 'religious'
  | 'international'
  | 'seasonal'
  | 'observance';

export interface WorldSpecialDay {
  id: string;
  name: string; // English name
  localName?: string | null; // local-language name
  month: number; // 1-12
  day: number;
  year?: number; // year of the next occurrence
  /** @deprecated Legacy column, no longer written. Use `icon` / SpecialDayThumb. */
  emoji?: string | null;
  icon?: string; // Ionicons name, e.g. 'flag-outline'
  category?: SpecialDayCategory;
  countryCode?: string; // 'UZ', 'US', ... or 'GLOBAL'
}

export interface SpecialDayDetails {
  holiday_id: string;
  title: string | null;
  summary: string | null;
  description: string | null;
  image_urls: string[] | null;
  source_name: string | null;
  source_url: string | null;
  fetched_at: string;
}

// =====================================================================
// APP CONTACTS (username-based, real-user relationships)
// ---------------------------------------------------------------------
// DIFFERENT from `Friend`. A `Friend` is a private diary entry the user
// writes about someone (that person needs no Relatr account). An
// `AppContact` is another REAL Relatr user, connected through the
// `friendships` table by their unique `username`. Contacts gate who can
// see your Stories; Friends are your private notes about people.
// =====================================================================

export type FriendshipStatus = 'pending' | 'accepted';

export interface AppContact {
  id: string; // friendships row id
  userId: string; // the OTHER user's profile id
  name: string;
  username: string;
  emoji: string;
  avatarColor: string;
  avatarUrl?: string;
  status: FriendshipStatus;
  isIncoming: boolean; // true if THEY requested (I must accept/decline)
  createdAt: string;
}

// =====================================================================
// Supabase row shapes (snake_case, as stored in Postgres)
// =====================================================================

export interface FriendRow {
  id: string;
  owner_id: string;
  name: string;
  nickname: string | null;
  avatar_color: string;
  emoji: string;
  category: RelationshipCategory;
  phone: string | null;
  instagram: string | null;
  city: string | null;
  school: string | null;
  interests: string[];
  last_contacted: string | null;
  reconnect_frequency_days: number | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;

  photo_uri: string | null;
  gender: Gender | null;
  gender_custom: string | null;
  pronouns: string | null;
  email: string | null;
  address: string | null;
  how_we_met: string | null;
  relationship_start_date: string | null;
  favorite_food: string | null;
  allergies_or_dislikes: string | null;
  love_language: LoveLanguage | null;
  gift_preferences_note: string | null;
  personality_notes: string | null;
  is_archived: boolean;
}

export interface ImportantDateRow {
  id: string;
  friend_id: string;
  owner_id: string;
  label: string;
  type: ImportantDateType;
  date: string;
  year_known: boolean;
  created_at: string;
}

export interface NoteRow {
  id: string;
  friend_id: string;
  owner_id: string;
  content: string;
  tag: NoteTag | null;
  created_at: string;
}

export interface SocialLinkRow {
  id: string;
  friend_id: string;
  owner_id: string;
  platform: string;
  handle: string;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  name: string;
  username: string;
  bio: string;
  emoji: string;
  avatar_color: string;
  birthday: string | null;
  city: string | null;
  school: string | null;
  instagram: string | null;
  interests: string[];
  created_at: string;
  updated_at: string;

  avatar_url: string | null;
  push_enabled: boolean;
  message_notif: boolean;
  likes_notif: boolean;
  sound_enabled: boolean;
  sync_contacts: boolean;
  sync_calendar: boolean;
  private_account: boolean;
  activity_status: boolean;
  blocked_user_ids: string[];

  onboarding_completed: boolean;
}

export interface BlockedUserRow {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

/** `world_holidays` table, written by the sync-world-holidays Edge Function. */
export interface WorldHolidayRow {
  id: string;
  external_id?: string | null;
  name: string;
  month: number;
  day: number;
  year?: number | null;
  country_code: string;
  source?: 'nager' | 'curated' | string | null;

  /** @deprecated Legacy column; the sync writes ''. */
  emoji?: string | null;
  local_name?: string | null;
  icon?: string | null;
  category?: SpecialDayCategory | null;
  is_fixed?: boolean | null;
  types?: string[] | null;
  description?: string | null;
  event_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FriendshipRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
}

/** Minimal profile projection joined with a friendship row when fetching contacts. */
export interface ContactProfileRow {
  id: string;
  name: string;
  username: string;
  emoji: string;
  avatar_color: string;
  avatar_url: string | null;
}
