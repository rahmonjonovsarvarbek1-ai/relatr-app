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
  SocialLink,
  SocialLinkRow,
} from '../types';

export function friendFromRow(
  row: FriendRow,
  notes: NoteRow[] = [],
  dates: ImportantDateRow[] = [],
  socialLinks: SocialLinkRow[] = []
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

    // ---------------- NEW ----------------
    photoUri: row.photo_uri ?? undefined,
    gender: row.gender ?? undefined,
    genderCustom: row.gender_custom ?? undefined,
    pronouns: row.pronouns ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    howWeMet: row.how_we_met ?? undefined,
    relationshipStartDate: row.relationship_start_date ?? undefined,
    favoriteFood: row.favorite_food ?? undefined,
    allergiesOrDislikes: row.allergies_or_dislikes ?? undefined,
    loveLanguage: row.love_language ?? undefined,
    giftPreferencesNote: row.gift_preferences_note ?? undefined,
    personalityNotes: row.personality_notes ?? undefined,
    socialLinks: socialLinks.map(socialLinkFromRow),
    isArchived: row.is_archived,
    updatedAt: row.updated_at,
    // --------------------------------------
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

    // ---------------- NEW ----------------
    photo_uri: friend.photoUri ?? null,
    gender: friend.gender ?? null,
    gender_custom: friend.genderCustom ?? null,
    pronouns: friend.pronouns ?? null,
    email: friend.email ?? null,
    address: friend.address ?? null,
    how_we_met: friend.howWeMet ?? null,
    relationship_start_date: friend.relationshipStartDate ?? null,
    favorite_food: friend.favoriteFood ?? null,
    allergies_or_dislikes: friend.allergiesOrDislikes ?? null,
    love_language: friend.loveLanguage ?? null,
    gift_preferences_note: friend.giftPreferencesNote ?? null,
    personality_notes: friend.personalityNotes ?? null,
    is_archived: friend.isArchived ?? false,
    // --------------------------------------
  };
}

// NOTE: `socialLinks` is intentionally NOT included here — social links live
// in their own `social_links` table (see setSocialLinks in AppContext), not
// as a column on `friends`. `updatedAt` is also excluded since it's managed
// by the `set_updated_at` DB trigger.
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

  // ---------------- NEW ----------------
  if (updates.photoUri !== undefined) row.photo_uri = updates.photoUri ?? null;
  if (updates.gender !== undefined) row.gender = updates.gender ?? null;
  if (updates.genderCustom !== undefined) row.gender_custom = updates.genderCustom ?? null;
  if (updates.pronouns !== undefined) row.pronouns = updates.pronouns ?? null;
  if (updates.email !== undefined) row.email = updates.email ?? null;
  if (updates.address !== undefined) row.address = updates.address ?? null;
  if (updates.howWeMet !== undefined) row.how_we_met = updates.howWeMet ?? null;
  if (updates.relationshipStartDate !== undefined)
    row.relationship_start_date = updates.relationshipStartDate ?? null;
  if (updates.favoriteFood !== undefined) row.favorite_food = updates.favoriteFood ?? null;
  if (updates.allergiesOrDislikes !== undefined)
    row.allergies_or_dislikes = updates.allergiesOrDislikes ?? null;
  if (updates.loveLanguage !== undefined) row.love_language = updates.loveLanguage ?? null;
  if (updates.giftPreferencesNote !== undefined)
    row.gift_preferences_note = updates.giftPreferencesNote ?? null;
  if (updates.personalityNotes !== undefined)
    row.personality_notes = updates.personalityNotes ?? null;
  if (updates.isArchived !== undefined) row.is_archived = updates.isArchived;
  // --------------------------------------
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

// ---------------- NEW: social links ----------------
export function socialLinkFromRow(row: SocialLinkRow): SocialLink {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
  };
}

export function socialLinkToInsertRow(friendId: string, ownerId: string, link: SocialLink) {
  return {
    id: link.id,
    friend_id: friendId,
    owner_id: ownerId,
    platform: link.platform,
    handle: link.handle,
  };
}
// --------------------------------------

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

    // ---------------- NEW ----------------
    avatarUrl: row.avatar_url ?? undefined,
    pushEnabled: row.push_enabled,
    messageNotif: row.message_notif,
    likesNotif: row.likes_notif,
    soundEnabled: row.sound_enabled,
    syncContacts: row.sync_contacts,
    syncCalendar: row.sync_calendar,
    privateAccount: row.private_account,
    activityStatus: row.activity_status,
    blockedUserIds: row.blocked_user_ids ?? [],
    mfaEnabled: false, // populated separately from supabase.auth.mfa
    // --------------------------------------
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

  // ---------------- NEW ----------------
  if (updates.avatarUrl !== undefined) row.avatar_url = updates.avatarUrl ?? null;
  if (updates.pushEnabled !== undefined) row.push_enabled = updates.pushEnabled;
  if (updates.messageNotif !== undefined) row.message_notif = updates.messageNotif;
  if (updates.likesNotif !== undefined) row.likes_notif = updates.likesNotif;
  if (updates.soundEnabled !== undefined) row.sound_enabled = updates.soundEnabled;
  if (updates.syncContacts !== undefined) row.sync_contacts = updates.syncContacts;
  if (updates.syncCalendar !== undefined) row.sync_calendar = updates.syncCalendar;
  if (updates.privateAccount !== undefined) row.private_account = updates.privateAccount;
  if (updates.activityStatus !== undefined) row.activity_status = updates.activityStatus;
  if (updates.blockedUserIds !== undefined) row.blocked_user_ids = updates.blockedUserIds;
  // mfaEnabled is never written here — it's managed via supabase.auth.mfa.*
  // --------------------------------------
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
