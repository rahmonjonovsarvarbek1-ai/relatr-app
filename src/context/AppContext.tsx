import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Alert } from 'react-native';
import { Friend, UserProfile, Note, ImportantDate, FriendRow, NoteRow, ImportantDateRow, ProfileRow, SocialLink, SocialLinkRow } from '../types';
import { supabase } from '../utils/supabase';
import { useAuth } from './AuthContext';
import {
  friendFromRow,
  friendToInsertRow,
  friendUpdatesToRow,
  noteFromRow,
  noteToInsertRow,
  importantDateFromRow,
  importantDateToInsertRow,
  importantDateUpdatesToRow,
  profileFromRow,
  profileUpdatesToRow,
  socialLinkFromRow,
  socialLinkToInsertRow,
} from '../utils/mappers';
import {
  scheduleImportantDateNotifications,
  cancelImportantDateNotifications,
  cancelAllForFriend,
  rescheduleAllNotifications,
  cancelAllScheduledNotificationsAsync,
} from '../utils/notifications';

function notifyError(title: string, message?: string) {
  Alert.alert(title, message || 'Something went wrong. Please try again.');
}

interface AppContextValue {
  friends: Friend[];
  profile: UserProfile;
  loading: boolean;
  addFriend: (friend: Friend) => void;
  updateFriend: (id: string, updates: Partial<Friend>) => void;
  deleteFriend: (id: string) => void;
  addNote: (friendId: string, note: Note) => void;
  deleteNote: (friendId: string, noteId: string) => void;
  addImportantDate: (friendId: string, date: ImportantDate) => void;
  updateImportantDate: (friendId: string, dateId: string, updates: Partial<ImportantDate>) => void;
  deleteImportantDate: (friendId: string, dateId: string) => void;
  setSocialLinks: (friendId: string, links: SocialLink[]) => void;
  markContacted: (friendId: string) => void;
  toggleFavorite: (friendId: string) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const emptyProfile = (id: string): UserProfile => ({
  id,
  name: '',
  username: '',
  bio: '',
  emoji: '🌿',
  avatarColor: '#8B5FE0',
  interests: [],
  pushEnabled: true,
  messageNotif: true,
  likesNotif: true,
  soundEnabled: true,
  syncContacts: false,
  syncCalendar: false,
  privateAccount: false,
  activityStatus: true,
  blockedUserIds: [],
  mfaEnabled: false,
});

// MFA holatini Supabase Auth'dan olib kelish uchun kichik yordamchi.
// Har bir profil yuklanganda / realtime orqali yangilanganda chaqiriladi,
// chunki mfa_factors auth sxemasida yashaydi va profiles jadvaliga
// tegishli emas.
async function fetchMfaEnabled(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    console.error('listFactors error:', error.message);
    return false;
  }
  return (data?.totp ?? []).some((f) => f.status === 'verified');
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => emptyProfile(''));
  const [loading, setLoading] = useState(true);

  const friendRows = useRef<Map<string, FriendRow>>(new Map());
  const noteRows = useRef<Map<string, NoteRow[]>>(new Map());
  const dateRows = useRef<Map<string, ImportantDateRow[]>>(new Map());
  const socialLinkRows = useRef<Map<string, SocialLinkRow[]>>(new Map());

  const rebuildFriends = useCallback(() => {
    const list: Friend[] = Array.from(friendRows.current.values())
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((row) =>
        friendFromRow(
          row,
          noteRows.current.get(row.id) ?? [],
          dateRows.current.get(row.id) ?? [],
          socialLinkRows.current.get(row.id) ?? []
        )
      );
    setFriends(list);
  }, []);

  useEffect(() => {
    if (!userId) {
      friendRows.current.clear();
      noteRows.current.clear();
      dateRows.current.clear();
      setFriends([]);
      setProfile(emptyProfile(''));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const [friendsRes, notesRes, datesRes, socialLinksRes, profileRes, mfaEnabled] = await Promise.all([
        supabase.from('friends').select('*').eq('owner_id', userId),
        supabase.from('notes').select('*').eq('owner_id', userId),
        supabase.from('important_dates').select('*').eq('owner_id', userId),
        supabase.from('social_links').select('*').eq('owner_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        fetchMfaEnabled(),
      ]);

      if (cancelled) return;

      friendRows.current.clear();
      noteRows.current.clear();
      dateRows.current.clear();
      socialLinkRows.current.clear();

      (friendsRes.data as FriendRow[] | null)?.forEach((row) => {
        friendRows.current.set(row.id, row);
      });

      (notesRes.data as NoteRow[] | null)?.forEach((row) => {
        const list = noteRows.current.get(row.friend_id) ?? [];
        list.push(row);
        noteRows.current.set(row.friend_id, list);
      });
      noteRows.current.forEach((list) =>
        list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      );

      (datesRes.data as ImportantDateRow[] | null)?.forEach((row) => {
        const list = dateRows.current.get(row.friend_id) ?? [];
        list.push(row);
        dateRows.current.set(row.friend_id, list);
      });

      (socialLinksRes.data as SocialLinkRow[] | null)?.forEach((row) => {
        const list = socialLinkRows.current.get(row.friend_id) ?? [];
        list.push(row);
        socialLinkRows.current.set(row.friend_id, list);
      });

      if (profileRes.data) {
        setProfile({ ...profileFromRow(profileRes.data as ProfileRow), mfaEnabled });
      } else {
        setProfile(emptyProfile(userId));
      }

      rebuildFriends();
      setLoading(false);
    })();

    const channel = supabase
      .channel(`app-data-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends', filter: `owner_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as FriendRow).id;
            friendRows.current.delete(oldId);
            noteRows.current.delete(oldId);
            dateRows.current.delete(oldId);
            socialLinkRows.current.delete(oldId);
          } else {
            const row = payload.new as FriendRow;
            friendRows.current.set(row.id, row);
          }
          rebuildFriends();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `owner_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as NoteRow;
            const list = (noteRows.current.get(old.friend_id) ?? []).filter(
              (n) => n.id !== old.id
            );
            noteRows.current.set(old.friend_id, list);
          } else {
            const row = payload.new as NoteRow;
            const list = (noteRows.current.get(row.friend_id) ?? []).filter(
              (n) => n.id !== row.id
            );
            list.unshift(row);
            list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
            noteRows.current.set(row.friend_id, list);
          }
          rebuildFriends();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'important_dates',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as ImportantDateRow;
            const list = (dateRows.current.get(old.friend_id) ?? []).filter(
              (d) => d.id !== old.id
            );
            dateRows.current.set(old.friend_id, list);
          } else {
            const row = payload.new as ImportantDateRow;
            const list = (dateRows.current.get(row.friend_id) ?? []).filter(
              (d) => d.id !== row.id
            );
            list.push(row);
            dateRows.current.set(row.friend_id, list);
          }
          rebuildFriends();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'social_links',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as SocialLinkRow;
            const list = (socialLinkRows.current.get(old.friend_id) ?? []).filter(
              (s) => s.id !== old.id
            );
            socialLinkRows.current.set(old.friend_id, list);
          } else {
            const row = payload.new as SocialLinkRow;
            const list = (socialLinkRows.current.get(row.friend_id) ?? []).filter(
              (s) => s.id !== row.id
            );
            list.push(row);
            socialLinkRows.current.set(row.friend_id, list);
          }
          rebuildFriends();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        async (payload) => {
          if (payload.eventType !== 'DELETE') {
            const mfaEnabled = await fetchMfaEnabled();
            setProfile({ ...profileFromRow(payload.new as ProfileRow), mfaEnabled });
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, rebuildFriends]);

  // Full notification resync whenever the initial data finishes loading
  // (covers reinstalls / new devices where nothing has been scheduled yet)
  // and whenever the push-notifications toggle is switched on. Switching it
  // off is handled directly inside updateProfile.
  const didInitialResync = useRef(false);
  useEffect(() => {
    didInitialResync.current = false;
  }, [userId]);
  useEffect(() => {
    if (!userId || loading) return;
    if (!profile.pushEnabled) return;
    if (didInitialResync.current) return;
    didInitialResync.current = true;
    rescheduleAllNotifications(friends);
  }, [userId, loading, profile.pushEnabled, friends]);

  const addFriend = useCallback(
    (friend: Friend) => {
      if (!userId) return;
      friendRows.current.set(friend.id, {
        ...friendToInsertRow(friend, userId),
        created_at: friend.createdAt,
        updated_at: friend.createdAt,
      } as FriendRow);
      noteRows.current.set(friend.id, []);
      dateRows.current.set(friend.id, []);
      socialLinkRows.current.set(friend.id, []);
      rebuildFriends();

      supabase
        .from('friends')
        .insert(friendToInsertRow(friend, userId))
        .then(async ({ error }) => {
          if (error) {
            console.error('addFriend error:', error.message);
            friendRows.current.delete(friend.id);
            noteRows.current.delete(friend.id);
            dateRows.current.delete(friend.id);
            socialLinkRows.current.delete(friend.id);
            rebuildFriends();
            notifyError('Could not add friend', error.message);
            return;
          }
          if (friend.importantDates.length) {
            const { error: datesError } = await supabase
              .from('important_dates')
              .insert(
                friend.importantDates.map((d) => importantDateToInsertRow(friend.id, userId, d))
              );
            if (datesError) {
              console.error('addFriend (dates) error:', datesError.message);
              notifyError('Some dates were not saved', datesError.message);
            } else {
              friend.importantDates.forEach((d) => {
                scheduleImportantDateNotifications(friend, d);
              });
            }
          }
          if (friend.notes.length) {
            const { error: notesError } = await supabase
              .from('notes')
              .insert(friend.notes.map((n) => noteToInsertRow(friend.id, userId, n)));
            if (notesError) {
              console.error('addFriend (notes) error:', notesError.message);
              notifyError('Some notes were not saved', notesError.message);
            }
          }
        });
    },
    [userId, rebuildFriends]
  );

  const updateFriend = useCallback(
    (id: string, updates: Partial<Friend>) => {
      if (!userId) return;
      const existing = friendRows.current.get(id);
      if (!existing) return;

      friendRows.current.set(id, { ...existing, ...(friendUpdatesToRow(updates) as Partial<FriendRow>) });
      rebuildFriends();

      supabase
        .from('friends')
        .update(friendUpdatesToRow(updates))
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('updateFriend error:', error.message);
            friendRows.current.set(id, existing);
            rebuildFriends();
            notifyError('Could not save changes', error.message);
            return;
          }
          // Notification bodies include the friend's name, so if it changed,
          // refresh every scheduled notification for this friend's dates.
          if (updates.name !== undefined) {
            const updated = friendRows.current.get(id);
            const dates = dateRows.current.get(id) ?? [];
            if (updated) {
              dates.forEach((row) => {
                scheduleImportantDateNotifications(
                  { id, name: updated.name },
                  importantDateFromRow(row)
                );
              });
            }
          }
        });
    },
    [userId, rebuildFriends]
  );

  const deleteFriend = useCallback(
    (id: string) => {
      if (!userId) return;
      const existingFriend = friendRows.current.get(id);
      const existingNotes = noteRows.current.get(id);
      const existingDates = dateRows.current.get(id);
      const existingSocialLinks = socialLinkRows.current.get(id);
      if (!existingFriend) return;

      cancelAllForFriend({ importantDates: (existingDates ?? []).map(importantDateFromRow) });

      friendRows.current.delete(id);
      noteRows.current.delete(id);
      dateRows.current.delete(id);
      socialLinkRows.current.delete(id);
      rebuildFriends();

      supabase
        .from('friends')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            console.error('deleteFriend error:', error.message);
            friendRows.current.set(id, existingFriend);
            if (existingNotes) noteRows.current.set(id, existingNotes);
            if (existingDates) dateRows.current.set(id, existingDates);
            if (existingSocialLinks) socialLinkRows.current.set(id, existingSocialLinks);
            rebuildFriends();
            notifyError('Could not remove friend', error.message);
            // best-effort: restore notifications for the restored dates
            (existingDates ?? []).forEach((row) => {
              scheduleImportantDateNotifications(existingFriend, importantDateFromRow(row));
            });
          }
        });
    },
    [userId, rebuildFriends]
  );

  const addNote = useCallback(
    (friendId: string, note: Note) => {
      if (!userId) return;
      const previous = noteRows.current.get(friendId) ?? [];
      const list = previous.slice();
      list.unshift({
        id: note.id,
        friend_id: friendId,
        owner_id: userId,
        content: note.content,
        tag: note.tag ?? null,
        created_at: note.createdAt,
      });
      noteRows.current.set(friendId, list);
      rebuildFriends();

      supabase
        .from('notes')
        .insert(noteToInsertRow(friendId, userId, note))
        .then(({ error }) => {
          if (error) {
            console.error('addNote error:', error.message);
            noteRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not save note', error.message);
          }
        });
    },
    [userId, rebuildFriends]
  );

  const deleteNote = useCallback(
    (friendId: string, noteId: string) => {
      if (!userId) return;
      const previous = noteRows.current.get(friendId) ?? [];
      const list = previous.filter((n) => n.id !== noteId);
      noteRows.current.set(friendId, list);
      rebuildFriends();

      supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .then(({ error }) => {
          if (error) {
            console.error('deleteNote error:', error.message);
            noteRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not delete note', error.message);
          }
        });
    },
    [userId, rebuildFriends]
  );

  const addImportantDate = useCallback(
    (friendId: string, date: ImportantDate) => {
      if (!userId) return;
      const previous = dateRows.current.get(friendId) ?? [];
      const list = previous.slice();
      list.push({
        id: date.id,
        friend_id: friendId,
        owner_id: userId,
        label: date.label,
        type: date.type,
        date: date.date,
        year_known: date.yearKnown,
        created_at: new Date().toISOString(),
      });
      dateRows.current.set(friendId, list);
      rebuildFriends();

      const friendRow = friendRows.current.get(friendId);

      supabase
        .from('important_dates')
        .insert(importantDateToInsertRow(friendId, userId, date))
        .then(({ error }) => {
          if (error) {
            console.error('addImportantDate error:', error.message);
            dateRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not save date', error.message);
            return;
          }
          if (friendRow) {
            scheduleImportantDateNotifications({ id: friendId, name: friendRow.name }, date);
          }
        });
    },
    [userId, rebuildFriends]
  );

  const updateImportantDate = useCallback(
    (friendId: string, dateId: string, updates: Partial<ImportantDate>) => {
      if (!userId) return;
      const previous = dateRows.current.get(friendId) ?? [];
      const list = previous.map((d) =>
        d.id === dateId ? { ...d, ...(importantDateUpdatesToRow(updates) as Partial<ImportantDateRow>) } : d
      );
      dateRows.current.set(friendId, list);
      rebuildFriends();

      const friendRow = friendRows.current.get(friendId);

      supabase
        .from('important_dates')
        .update(importantDateUpdatesToRow(updates))
        .eq('id', dateId)
        .then(({ error }) => {
          if (error) {
            console.error('updateImportantDate error:', error.message);
            dateRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not save date', error.message);
            return;
          }
          if (friendRow) {
            const updatedRow = (dateRows.current.get(friendId) ?? []).find((d) => d.id === dateId);
            if (updatedRow) {
              scheduleImportantDateNotifications(
                { id: friendId, name: friendRow.name },
                importantDateFromRow(updatedRow)
              );
            }
          }
        });
    },
    [userId, rebuildFriends]
  );

  const deleteImportantDate = useCallback(
    (friendId: string, dateId: string) => {
      if (!userId) return;
      const previous = dateRows.current.get(friendId) ?? [];
      const list = previous.filter((d) => d.id !== dateId);
      dateRows.current.set(friendId, list);
      rebuildFriends();
      cancelImportantDateNotifications(dateId);

      supabase
        .from('important_dates')
        .delete()
        .eq('id', dateId)
        .then(({ error }) => {
          if (error) {
            console.error('deleteImportantDate error:', error.message);
            dateRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not delete date', error.message);
            const restored = previous.find((d) => d.id === dateId);
            const friendRow = friendRows.current.get(friendId);
            if (restored && friendRow) {
              scheduleImportantDateNotifications(
                { id: friendId, name: friendRow.name },
                importantDateFromRow(restored)
              );
            }
          }
        });
    },
    [userId, rebuildFriends]
  );

  const setSocialLinks = useCallback(
    (friendId: string, links: SocialLink[]) => {
      if (!userId) return;
      const previous = socialLinkRows.current.get(friendId) ?? [];
      const nextRows: SocialLinkRow[] = links.map((l) => ({
        id: l.id,
        friend_id: friendId,
        owner_id: userId,
        platform: l.platform,
        handle: l.handle,
        created_at: new Date().toISOString(),
      }));
      socialLinkRows.current.set(friendId, nextRows);
      rebuildFriends();

      // Replace-all: delete existing rows for this friend, then insert the
      // current list. Simple and matches how the edit screen treats
      // socialLinks as a single array field.
      (async () => {
        const { error: deleteError } = await supabase
          .from('social_links')
          .delete()
          .eq('friend_id', friendId);
        if (deleteError) {
          console.error('setSocialLinks (delete) error:', deleteError.message);
          socialLinkRows.current.set(friendId, previous);
          rebuildFriends();
          notifyError('Could not save social links', deleteError.message);
          return;
        }
        if (links.length) {
          const { error: insertError } = await supabase
            .from('social_links')
            .insert(links.map((l) => socialLinkToInsertRow(friendId, userId, l)));
          if (insertError) {
            console.error('setSocialLinks (insert) error:', insertError.message);
            socialLinkRows.current.set(friendId, previous);
            rebuildFriends();
            notifyError('Could not save social links', insertError.message);
          }
        }
      })();
    },
    [userId, rebuildFriends]
  );

  const markContacted = useCallback(
    (friendId: string) => {
      updateFriend(friendId, { lastContacted: new Date().toISOString() });
    },
    [updateFriend]
  );

  const toggleFavorite = useCallback(
    (friendId: string) => {
      const current = friendRows.current.get(friendId);
      updateFriend(friendId, { favorite: !current?.favorite });
    },
    [updateFriend]
  );

  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      if (!userId) return;
      let previous: UserProfile | undefined;
      setProfile((prev) => {
        previous = prev;
        return { ...prev, ...updates };
      });

      supabase
        .from('profiles')
        .update(profileUpdatesToRow(updates))
        .eq('id', userId)
        .then(({ error }) => {
          if (error) {
            console.error('updateProfile error:', error.message);
            if (previous) setProfile(previous);
            notifyError('Could not save profile', error.message);
            return;
          }
          if (updates.pushEnabled === true) {
            rescheduleAllNotifications(Array.from(friendRows.current.values()).map((row) =>
              friendFromRow(
                row,
                noteRows.current.get(row.id) ?? [],
                dateRows.current.get(row.id) ?? [],
                socialLinkRows.current.get(row.id) ?? []
              )
            ));
          } else if (updates.pushEnabled === false) {
            cancelAllScheduledNotificationsAsync();
          }
        });
    },
    [userId]
  );

  return (
    <AppContext.Provider
      value={{
        friends,
        profile,
        loading,
        addFriend,
        updateFriend,
        deleteFriend,
        addNote,
        deleteNote,
        addImportantDate,
        updateImportantDate,
        deleteImportantDate,
        setSocialLinks,
        markContacted,
        toggleFavorite,
        updateProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
