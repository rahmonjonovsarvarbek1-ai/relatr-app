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
