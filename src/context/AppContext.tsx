import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Friend, UserProfile, Note, ImportantDate } from '../types';
import { seedFriends, seedProfile } from '../data/seed';

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

const FRIENDS_KEY = 'relatr:friends';
const PROFILE_KEY = 'relatr:profile';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [profile, setProfile] = useState<UserProfile>(seedProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedFriends, storedProfile] = await Promise.all([
          AsyncStorage.getItem(FRIENDS_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);
        setFriends(storedFriends ? JSON.parse(storedFriends) : seedFriends);
        setProfile(storedProfile ? JSON.parse(storedProfile) : seedProfile);
      } catch (e) {
        setFriends(seedFriends);
        setProfile(seedProfile);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loading) AsyncStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
  }, [friends, loading]);

  useEffect(() => {
    if (!loading) AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile, loading]);

  const addFriend = useCallback((friend: Friend) => {
    setFriends((prev) => [friend, ...prev]);
  }, []);

  const updateFriend = useCallback((id: string, updates: Partial<Friend>) => {
    setFriends((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }, []);

  const deleteFriend = useCallback((id: string) => {
    setFriends((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addNote = useCallback((friendId: string, note: Note) => {
    setFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, notes: [note, ...f.notes] } : f))
    );
  }, []);

  const deleteNote = useCallback((friendId: string, noteId: string) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === friendId ? { ...f, notes: f.notes.filter((n) => n.id !== noteId) } : f
      )
    );
  }, []);

  const addImportantDate = useCallback((friendId: string, date: ImportantDate) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === friendId ? { ...f, importantDates: [...f.importantDates, date] } : f
      )
    );
  }, []);

  const updateImportantDate = useCallback(
    (friendId: string, dateId: string, updates: Partial<ImportantDate>) => {
      setFriends((prev) =>
        prev.map((f) =>
          f.id === friendId
            ? {
                ...f,
                importantDates: f.importantDates.map((d) =>
                  d.id === dateId ? { ...d, ...updates } : d
                ),
              }
            : f
        )
      );
    },
    []
  );

  const deleteImportantDate = useCallback((friendId: string, dateId: string) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === friendId
          ? { ...f, importantDates: f.importantDates.filter((d) => d.id !== dateId) }
          : f
      )
    );
  }, []);

  const markContacted = useCallback((friendId: string) => {
    setFriends((prev) =>
      prev.map((f) =>
        f.id === friendId ? { ...f, lastContacted: new Date().toISOString() } : f
      )
    );
  }, []);

  const toggleFavorite = useCallback((friendId: string) => {
    setFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, favorite: !f.favorite } : f))
    );
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);

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