// src/hooks/useProfileSettings.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { cancelAllScheduledNotificationsAsync } from '../utils/notifications';
import type { AppContact, FriendshipRow, ContactProfileRow } from '../types';

export type UsernameCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export interface BlockedUserSummary {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
}

// -----------------------------------------------------------------
// Hook to check username availability and format
// -----------------------------------------------------------------
export function useUsernameCheck(currentUsername: string) {
  const [usernameStatus, setUsernameStatus] = useState<UsernameCheckStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const validateFormat = (value: string): boolean => {
    // 3-20 chars, lowercase letters/numbers/._ , must start with a letter
    const re = /^[a-z][a-z0-9._]{2,19}$/;
    return re.test(value);
  };

  const checkUsername = useCallback(
    (value: string) => {
      const normalized = value.trim().toLowerCase();

      if (debounceRef.current) clearTimeout(debounceRef.current);

      // If it's the user's current username, no need to check
      if (normalized === currentUsername.toLowerCase()) {
        setUsernameStatus('idle');
        return;
      }

      if (!normalized) {
        setUsernameStatus('idle');
        return;
      }

      if (!validateFormat(normalized)) {
        setUsernameStatus('invalid');
        return;
      }

      setUsernameStatus('checking');
      const myRequestId = ++requestIdRef.current;

      debounceRef.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase.rpc('is_username_available', {
            p_username: normalized,
          });

          // Avoid race conditions
          if (myRequestId !== requestIdRef.current) return;

          if (error) {
            console.error('Username check error:', error);
            setUsernameStatus('idle');
            return;
          }

          setUsernameStatus(data ? 'available' : 'taken');
        } catch (e) {
          if (myRequestId !== requestIdRef.current) return;
          console.error('Username check exception:', e);
          setUsernameStatus('idle');
        }
      }, 400); // 400ms debounce
    },
    [currentUsername]
  );

  const resetUsernameCheck = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setUsernameStatus('idle');
  }, []);

  return { usernameStatus, checkUsername, resetUsernameCheck, validateFormat };
}

// -----------------------------------------------------------------
// Maps a friendship row + the OTHER user's minimal profile into an
// AppContact.
// -----------------------------------------------------------------
function toAppContact(
  row: FriendshipRow,
  otherProfile: ContactProfileRow,
  meId: string
): AppContact {
  return {
    id: row.id,
    userId: otherProfile.id,
    name: otherProfile.name,
    username: otherProfile.username,
    emoji: otherProfile.emoji ?? '🙂',
    avatarColor: otherProfile.avatar_color ?? '#8B5FE0',
    avatarUrl: otherProfile.avatar_url ?? undefined,
    status: row.status,
    isIncoming: row.status === 'pending' && row.friend_id === meId,
    createdAt: row.created_at,
  };
}

export function useProfileSettings() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserSummary[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  // ---------------------------------------------------------
  // App Contacts (username-based, real Relatr users)
  // ---------------------------------------------------------
  const [contacts, setContacts] = useState<AppContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  const loadContacts = useCallback(async () => {
  if (!userId) return;
  setContactsLoading(true);
  try {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, created_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('loadContacts error:', error.message);
      return;
    }

    const otherIds = Array.from(
      new Set((rows ?? []).map((r) => (r.user_id === userId ? r.friend_id : r.user_id)))
    );

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, username, emoji, avatar_color, avatar_url')
      .in('id', otherIds.length > 0 ? otherIds : ['00000000-0000-0000-0000-000000000000']);

    if (profilesError) {
      console.error('loadContacts profiles error:', profilesError.message);
      return;
    }

    const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

    const list: AppContact[] = (rows ?? []).map((row) => {
      const otherId = row.user_id === userId ? row.friend_id : row.user_id;
      const otherProfile = profileMap.get(otherId) as ContactProfileRow;
      return toAppContact(row as FriendshipRow, otherProfile, userId);
    });

    list.sort((a, b) => {
      const rank = (c: AppContact) =>
        c.status === 'pending' && c.isIncoming ? 0 : c.status === 'accepted' ? 1 : 2;
      return rank(a) - rank(b);
    });

    setContacts(list);
    } finally {
    setContactsLoading(false);
    }
    }, [userId]);

  useEffect(() => {
    if (!userId) {
      setContacts([]);
      return;
    }
    loadContacts();

    const channel = supabase
      .channel(`friendships-${userId}-${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => loadContacts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadContacts]);

  const acceptContactRequest = useCallback(
    async (friendshipId: string) => {
      const previous = contacts;
      setContacts((prev) =>
        prev.map((c) => (c.id === friendshipId ? { ...c, status: 'accepted', isIncoming: false } : c))
      );
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) {
        console.error('acceptContactRequest error:', error.message);
        setContacts(previous);
        Alert.alert('Error', 'Could not accept this request.');
      }
    },
    [contacts]
  );

  const declineContactRequest = useCallback(
    async (friendshipId: string) => {
      const previous = contacts;
      setContacts((prev) => prev.filter((c) => c.id !== friendshipId));
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) {
        console.error('declineContactRequest error:', error.message);
        setContacts(previous);
        Alert.alert('Error', 'Could not decline this request.');
      }
    },
    [contacts]
  );

  const removeContact = useCallback(
    async (friendshipId: string) => {
      const previous = contacts;
      setContacts((prev) => prev.filter((c) => c.id !== friendshipId));
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (error) {
        console.error('removeContact error:', error.message);
        setContacts(previous);
        Alert.alert('Error', 'Could not remove this contact.');
      }
    },
    [contacts]
  );

  // ---------------------------------------------------------
  // MFA status
  // ---------------------------------------------------------
  const refreshMfaStatus = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.error('listFactors error:', error.message);
      return;
    }
    setMfaEnabled((data?.totp ?? []).some((f) => f.status === 'verified'));
  }, []);

  useEffect(() => {
    if (userId) refreshMfaStatus();
  }, [userId, refreshMfaStatus]);

  // ---------------------------------------------------------
  // Profile photo
  // ---------------------------------------------------------
  const pickAndUploadAvatar = useCallback(
    async (onDone: (publicUrl: string) => void) => {
      if (!userId) return;

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to set a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      try {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();

        const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
        const mime =
          ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const path = `${userId}/avatar_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, arrayBuffer, {
            contentType: mime,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
        const publicUrl = publicUrlData.publicUrl;

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', userId);

        if (updateError) throw updateError;

        onDone(publicUrl);
      } catch (e) {
        console.error('avatar upload error:', e);
        Alert.alert('Upload failed', 'Could not upload your photo. Please try again.');
      } finally {
        setUploadingPhoto(false);
      }
    },
    [userId]
  );

  const removeAvatar = useCallback(
    async (onDone: () => void) => {
      if (!userId) return;
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
      if (error) {
        console.error('removeAvatar error:', error.message);
        Alert.alert('Error', 'Could not remove photo.');
        return;
      }
      onDone();
    },
    [userId]
  );

  // ---------------------------------------------------------
  // Password change
  // ---------------------------------------------------------
  const changePassword = useCallback(async (newPassword: string): Promise<{ error?: string }> => {
    if (newPassword.length < 8) {
      return { error: 'Password must be at least 8 characters.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  }, []);

  // ---------------------------------------------------------
  // 2FA (TOTP) enrollment
  // ---------------------------------------------------------
  const startMfaEnrollment = useCallback(async (): Promise<{
    factorId?: string;
    qrCodeSvg?: string;
    secret?: string;
    error?: string;
  }> => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) return { error: error.message };
      return {
        factorId: data.id,
        qrCodeSvg: data.totp.qr_code,
        secret: data.totp.secret,
      };
    } finally {
      setMfaLoading(false);
    }
  }, []);

  const verifyMfaEnrollment = useCallback(
    async (factorId: string, code: string): Promise<{ error?: string }> => {
      setMfaLoading(true);
      try {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId,
        });
        if (challengeError) return { error: challengeError.message };

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code,
        });
        if (verifyError) return { error: verifyError.message };

        await refreshMfaStatus();
        return {};
      } finally {
        setMfaLoading(false);
      }
    },
    [refreshMfaStatus]
  );

  const disableMfa = useCallback(async (): Promise<{ error?: string }> => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return { error: error.message };
      const factor = (data?.totp ?? []).find((f) => f.status === 'verified');
      if (!factor) return {};

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) return { error: unenrollError.message };

      await refreshMfaStatus();
      return {};
    } finally {
      setMfaLoading(false);
    }
  }, [refreshMfaStatus]);

  // ---------------------------------------------------------
  // Blocked users
  // ---------------------------------------------------------
  const loadBlockedUsers = useCallback(async () => {
    if (!userId) return;
    setBlockedLoading(true);
    try {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_id, profiles:blocked_id(id, name, username, avatar_url)')
        .eq('blocker_id', userId);

      if (error) {
        console.error('loadBlockedUsers error:', error.message);
        return;
      }

      const list: BlockedUserSummary[] = (data ?? [])
        .map((row: any) => row.profiles)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          username: p.username,
          avatarUrl: p.avatar_url ?? undefined,
        }));

      setBlockedUsers(list);
    } finally {
      setBlockedLoading(false);
    }
  }, [userId]);

  const unblockUser = useCallback(
    async (blockedId: string) => {
      if (!userId) return;
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId));
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', blockedId);
      if (error) {
        console.error('unblockUser error:', error.message);
        loadBlockedUsers();
      }
    },
    [userId, loadBlockedUsers]
  );

  // ---------------------------------------------------------
  // Contacts / Calendar sync toggles
  // ---------------------------------------------------------
  const requestContactsSync = useCallback(async (): Promise<boolean> => {
    const Contacts = require('expo-contacts');
    const { status } = await Contacts.requestPermissionsAsync();
    return status === 'granted';
  }, []);

  const requestCalendarSync = useCallback(async (): Promise<boolean> => {
    const Calendar = require('expo-calendar');
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  }, []);

  // ---------------------------------------------------------
  // Account deletion
  // ---------------------------------------------------------
  const deleteAccount = useCallback(async (): Promise<{ error?: string }> => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) return { error: error.message };
    cancelAllScheduledNotificationsAsync();
    return {};
  }, []);

  return {
    uploadingPhoto,
    pickAndUploadAvatar,
    removeAvatar,

    changePassword,

    mfaEnabled,
    mfaLoading,
    startMfaEnrollment,
    verifyMfaEnrollment,
    disableMfa,

    blockedUsers,
    blockedLoading,
    loadBlockedUsers,
    unblockUser,

    contacts,
    contactsLoading,
    loadContacts,
    acceptContactRequest,
    declineContactRequest,
    removeContact,

    requestContactsSync,
    requestCalendarSync,

    deleteAccount,
  };
}