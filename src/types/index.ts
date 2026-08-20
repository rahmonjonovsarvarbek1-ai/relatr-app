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

export type ImportantDateType =
  | 'Birthday'
  | 'Anniversary'
  | 'Graduation'
  | 'Meet Day'
  | 'Custom';

// ---------------- NEW ----------------
export type Gender = 'Woman' | 'Man' | 'Non-binary' | 'Prefer not to say' | 'Custom';

export type LoveLanguage =
  | 'Words of Affirmation'
  | 'Quality Time'
  | 'Acts of Service'
  | 'Gifts'
  | 'Physical Touch';

export interface SocialLink {
  id: string;
  platform: string; // 'Instagram' | 'Snapchat' | 'TikTok' | 'X' | 'LinkedIn' | 'WhatsApp' | 'Other'
  handle: string;
}
// --------------------------------------

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
  tag?: 'Conversation' | 'Interest' | 'Important Detail' | 'Memory';
}

export interface Friend {
  id: string;
  name: string;
  nickname?: string;
  avatarColor: string;
  emoji: string;
  category: RelationshipCategory;
  phone?: string;
  instagram?: string;
  city?: string;
  school?: string;
  interests: string[];
  importantDates: ImportantDate[];
  notes: Note[];
  lastContacted?: string; // ISO date
  reconnectFrequencyDays?: number; // e.g. reconnect every 30 days
  favorite: boolean;
  createdAt: string;

  // ---------------- NEW ----------------
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
  // --------------------------------------
}

// ---------------- UserProfile (kengaytirilgan, yakuniy versiya) ----------------
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

  // ---------------- NEW ----------------
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
  // --------------------------------------
}

export interface WorldSpecialDay {
  id: string;
  name: string;
  month: number; // 1-12
  day: number;
  emoji: string;
}

// =====================================================================
// Supabase row shapes (snake_case, as stored in Postgres).
// Mapping to/from the camelCase app types above happens in
// src/utils/mappers.ts.
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

  // ---------------- NEW ----------------
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
  // --------------------------------------
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
  tag: Note['tag'] | null;
  created_at: string;
}

// ---------------- NEW ----------------
export interface SocialLinkRow {
  id: string;
  friend_id: string;
  owner_id: string;
  platform: string;
  handle: string;
  created_at: string;
}
// --------------------------------------

// ---------------- ProfileRow (kengaytirilgan, yakuniy versiya) ----------------
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

  // ---------------- NEW ----------------
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
  // --------------------------------------
}

export interface BlockedUserRow {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface WorldHolidayRow {
  id: string;
  google_event_id: string;
  country_code: string;
  name: string;
  description: string | null;
  emoji: string;
  event_date: string;
  is_recurring_yearly: boolean;
  source: string;
  html_link: string | null;
  created_at: string;
}

