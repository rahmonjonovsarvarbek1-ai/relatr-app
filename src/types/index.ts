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
