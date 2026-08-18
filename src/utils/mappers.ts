import {
  Friend,
  FriendRow,
  ImportantDate,
  ImportantDateRow,
  Note,
  NoteRow,
  UserProfile,
  ProfileRow,
  WorldSpecialDay,
  WorldHolidayRow,
} from '../types';

export function friendFromRow(
  row: FriendRow,
  notes: NoteRow[] = [],
  dates: ImportantDateRow[] = []
): Friend {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname ?? undefined,
    avatarColor: row.avatar_color,
    emoji: row.emoji,
    category: row.category,
    phone: row.phone ?? undefined,
    instagram: row.instagram ?? undefined,
    city: row.city ?? undefined,
    school: row.school ?? undefined,
    interests: row.interests ?? [],
    importantDates: dates.map(importantDateFromRow),
    notes: notes.map(noteFromRow),
    lastContacted: row.last_contacted ?? undefined,
    reconnectFrequencyDays: row.reconnect_frequency_days ?? undefined,
    favorite: row.favorite,
    createdAt: row.created_at,
  };
}

export function friendToInsertRow(friend: Friend, ownerId: string) {
  return {
    id: friend.id,
    owner_id: ownerId,
    name: friend.name,
    nickname: friend.nickname ?? null,
    avatar_color: friend.avatarColor,
    emoji: friend.emoji,
    category: friend.category,
    phone: friend.phone ?? null,
    instagram: friend.instagram ?? null,
    city: friend.city ?? null,
    school: friend.school ?? null,
    interests: friend.interests ?? [],
    last_contacted: friend.lastContacted ?? null,
    reconnect_frequency_days: friend.reconnectFrequencyDays ?? null,
    favorite: friend.favorite,
  };
}

export function friendUpdatesToRow(updates: Partial<Friend>) {
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.nickname !== undefined) row.nickname = updates.nickname ?? null;
  if (updates.avatarColor !== undefined) row.avatar_color = updates.avatarColor;
  if (updates.emoji !== undefined) row.emoji = updates.emoji;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.phone !== undefined) row.phone = updates.phone ?? null;
  if (updates.instagram !== undefined) row.instagram = updates.instagram ?? null;
  if (updates.city !== undefined) row.city = updates.city ?? null;
  if (updates.school !== undefined) row.school = updates.school ?? null;
  if (updates.interests !== undefined) row.interests = updates.interests;
  if (updates.lastContacted !== undefined) row.last_contacted = updates.lastContacted ?? null;
  if (updates.reconnectFrequencyDays !== undefined)
    row.reconnect_frequency_days = updates.reconnectFrequencyDays ?? null;
  if (updates.favorite !== undefined) row.favorite = updates.favorite;
  return row;
}

export function noteFromRow(row: NoteRow): Note {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    tag: row.tag ?? undefined,
  };
}

export function noteToInsertRow(friendId: string, ownerId: string, note: Note) {
  return {
    id: note.id,
    friend_id: friendId,
    owner_id: ownerId,
    content: note.content,
    tag: note.tag ?? null,
  };
}

export function importantDateFromRow(row: ImportantDateRow): ImportantDate {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    date: row.date,
    yearKnown: row.year_known,
  };
}

export function importantDateToInsertRow(
  friendId: string,
  ownerId: string,
  date: ImportantDate
) {
  return {
    id: date.id,
    friend_id: friendId,
    owner_id: ownerId,
    label: date.label,
    type: date.type,
    date: date.date,
    year_known: date.yearKnown,
  };
}

export function importantDateUpdatesToRow(updates: Partial<ImportantDate>) {
  const row: Record<string, unknown> = {};
  if (updates.label !== undefined) row.label = updates.label;
  if (updates.type !== undefined) row.type = updates.type;
  if (updates.date !== undefined) row.date = updates.date;
  if (updates.yearKnown !== undefined) row.year_known = updates.yearKnown;
  return row;
}

export function profileFromRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    bio: row.bio,
    emoji: row.emoji,
    avatarColor: row.avatar_color,
    birthday: row.birthday ?? undefined,
    city: row.city ?? undefined,
    school: row.school ?? undefined,
    instagram: row.instagram ?? undefined,
    interests: row.interests ?? [],
  };
}

export function profileUpdatesToRow(updates: Partial<UserProfile>) {
  const row: Record<string, unknown> = {};
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.username !== undefined) row.username = updates.username;
  if (updates.bio !== undefined) row.bio = updates.bio;
  if (updates.emoji !== undefined) row.emoji = updates.emoji;
  if (updates.avatarColor !== undefined) row.avatar_color = updates.avatarColor;
  if (updates.birthday !== undefined) row.birthday = updates.birthday ?? null;
  if (updates.city !== undefined) row.city = updates.city ?? null;
  if (updates.school !== undefined) row.school = updates.school ?? null;
  if (updates.instagram !== undefined) row.instagram = updates.instagram ?? null;
  if (updates.interests !== undefined) row.interests = updates.interests;
  return row;
}

export function worldSpecialDayFromRow(row: WorldHolidayRow): WorldSpecialDay {
  const d = new Date(row.event_date + 'T00:00:00');
  return {
    id: row.id,
    name: row.name,
    month: d.getMonth() + 1,
    day: d.getDate(),
    emoji: row.emoji,
  };
}
