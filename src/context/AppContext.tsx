import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Friend, UserProfile, Note, ImportantDate, FriendRow, NoteRow, ImportantDateRow, ProfileRow } from '../types';
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
} from '../utils/mappers';

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
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [profile, setProfile] = useState<UserProfile>(() => emptyProfile(''));
  const [loading, setLoading] = useState(true);

  // Raw row caches so realtime patches (which only give us one row at a
  // time) can be merged back into full Friend objects without refetching
  // everything.
  const friendRows = useRef<Map<string, FriendRow>>(new Map());
  const noteRows = useRef<Map<string, NoteRow[]>>(new Map()); // friendId -> notes
  const dateRows = useRef<Map<string, ImportantDateRow[]>>(new Map()); // friendId -> dates

  const rebuildFriends = useCallback(() => {
    const list: Friend[] = Array.from(friendRows.current.values())
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((row) =>
        friendFromRow(row, noteRows.current.get(row.id) ?? [], dateRows.current.get(row.id) ?? [])
      );
    setFriends(list);
  }, []);

  // ---------------------------------------------------------------------
  // Initial load + realtime subscriptions
  // ---------------------------------------------------------------------
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
      const [friendsRes, notesRes, datesRes, profileRes] = await Promise.all([
        supabase.from('friends').select('*').eq('owner_id', userId),
        supabase.from('notes').select('*').eq('owner_id', userId),
        supabase.from('important_dates').select('*').eq('owner_id', userId),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ]);

      if (cancelled) return;

      friendRows.current.clear();
      noteRows.current.clear();
      dateRows.current.clear();

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

      if (profileRes.data) {
        setProfile(profileFromRow(profileRes.data as ProfileRow));
      } else {
        setProfile(emptyProfile(userId));
      }

      rebuildFriends();
      setLoading(false);
    })();

    // -- Realtime subscriptions ------------------------------------------------
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
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') {
            setProfile(profileFromRow(payload.new as ProfileRow));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, rebuildFriends]);

  // ---------------------------------------------------------------------
  // Mutations — all optimistic: update local caches immediately, then
  // write through to Supabase. The realtime subscription above will
  // reconcile with the server's version shortly after (including for
  // any other device signed into the same account).
  // ---------------------------------------------------------------------

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
      rebuildFriends();

      supabase
        .from('friends')
        .insert(friendToInsertRow(friend, userId))
        .then(async ({ error }) => {
          if (error) {
            console.error('addFriend error:', error.message);
            return;
          }
          // Persist any importantDates/notes that came bundled on creation
          // (e.g. a birthday added from the Add Friend form).
          if (friend.importantDates.length) {
            await supabase
              .from('important_dates')
              .insert(
                friend.importantDates.map((d) => importantDateToInsertRow(friend.id, userId, d))
              );
          }
          if (friend.notes.length) {
            await supabase
              .from('notes')
              .insert(friend.notes.map((n) => noteToInsertRow(friend.id, userId, n)));
          }
        });
    },
    [userId, rebuildFriends]
  );

  const updateFriend = useCallback(
    (id: string, updates: Partial<Friend>) => {
      if (!userId) return;
      const existing = friendRows.current.get(id);
      if (existing) {
        friendRows.current.set(id, { ...existing, ...(friendUpdatesToRow(updates) as Partial<FriendRow>) });
        rebuildFriends();
      }
      supabase
        .from('friends')
        .update(friendUpdatesToRow(updates))
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('updateFriend error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const deleteFriend = useCallback(
    (id: string) => {
      if (!userId) return;
      friendRows.current.delete(id);
      noteRows.current.delete(id);
      dateRows.current.delete(id);
      rebuildFriends();
      // important_dates and notes cascade-delete in Postgres via FK.
      supabase
        .from('friends')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('deleteFriend error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const addNote = useCallback(
    (friendId: string, note: Note) => {
      if (!userId) return;
      const list = (noteRows.current.get(friendId) ?? []).slice();
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
          if (error) console.error('addNote error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const deleteNote = useCallback(
    (friendId: string, noteId: string) => {
      if (!userId) return;
      const list = (noteRows.current.get(friendId) ?? []).filter((n) => n.id !== noteId);
      noteRows.current.set(friendId, list);
      rebuildFriends();

      supabase
        .from('notes')
        .delete()
        .eq('id', noteId)
        .then(({ error }) => {
          if (error) console.error('deleteNote error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const addImportantDate = useCallback(
    (friendId: string, date: ImportantDate) => {
      if (!userId) return;
      const list = (dateRows.current.get(friendId) ?? []).slice();
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

      supabase
        .from('important_dates')
        .insert(importantDateToInsertRow(friendId, userId, date))
        .then(({ error }) => {
          if (error) console.error('addImportantDate error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const updateImportantDate = useCallback(
    (friendId: string, dateId: string, updates: Partial<ImportantDate>) => {
      if (!userId) return;
      const list = (dateRows.current.get(friendId) ?? []).map((d) =>
        d.id === dateId ? { ...d, ...(importantDateUpdatesToRow(updates) as Partial<ImportantDateRow>) } : d
      );
      dateRows.current.set(friendId, list);
      rebuildFriends();

      supabase
        .from('important_dates')
        .update(importantDateUpdatesToRow(updates))
        .eq('id', dateId)
        .then(({ error }) => {
          if (error) console.error('updateImportantDate error:', error.message);
        });
    },
    [userId, rebuildFriends]
  );

  const deleteImportantDate = useCallback(
    (friendId: string, dateId: string) => {
      if (!userId) return;
      const list = (dateRows.current.get(friendId) ?? []).filter((d) => d.id !== dateId);
      dateRows.current.set(friendId, list);
      rebuildFriends();

      supabase
        .from('important_dates')
        .delete()
        .eq('id', dateId)
        .then(({ error }) => {
          if (error) console.error('deleteImportantDate error:', error.message);
        });
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
      setProfile((prev) => ({ ...prev, ...updates }));

      supabase
        .from('profiles')
        .update(profileUpdatesToRow(updates))
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.error('updateProfile error:', error.message);
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
