// src/hooks/useProfileSettings.ts

import { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { cancelAllScheduledNotificationsAsync } from '../utils/notifications';

export interface BlockedUserSummary {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
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
  // Profile photo (Web va Mobile uchun moslashtirilgan)
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
        mediaTypes: ['images'], // Deprecated ogohlantirishini to'g'rilaydi
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploadingPhoto(true);

      try {
        // FileSystem o'rniga fetch() ishlatilmoqda — Web va Mobilda xatosiz ishlaydi
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

    requestContactsSync,
    requestCalendarSync,

    deleteAccount,
  };
}