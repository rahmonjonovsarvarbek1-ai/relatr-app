import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  FlatList,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { radius, spacing, typography, avatarPalette } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { formatFullDate } from '../utils/dateUtils';
import DateFields from '../components/DateFields';
import { useAuth } from '../context/AuthContext';
import { useProfileSettings } from '../hooks/useProfileSettings';
import { requestNotificationPermissionsAsync } from '../utils/notifications';
import type { AppContact } from '../types';
// To'g'risi:
import { supabase } from '../utils/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

type BlockedUserSummary = { id: string; name: string; username: string };

const EMOJIS = ['🌿', '😊', '🌸', '🎸', '📚', '🏀', '✈️', '🎮', '🎨', '☕', '🔥', '💫'];

type SettingsPage = 'main' | 'notifications' | 'calendar' | 'privacy' | 'about' | 'blocked' | '2fa' | 'password';
type StatKind = 'friends' | 'favorites' | 'contacts' | null;
type UsernameCheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const TERMS_URL = 'https://mongom.app/terms'; // haqiqiy URL bilan almashtiring
const PRIVACY_URL = 'https://mongom.app/privacy'; // haqiqiy URL bilan almashtiring

const USERNAME_REGEX = /^[a-z][a-z0-9._]{2,19}$/;
const USERNAME_DEBOUNCE_MS = 400;

const ProfileScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { profile, friends, updateProfile } = useApp();
  const { signOut } = useAuth();
  const settings = useProfileSettings();
  const navigation = useNavigation<any>();
  const [editing, setEditing] = useState(false);

  // ---- Edit profile form state ----
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [emoji, setEmoji] = useState(profile.emoji);
  const [color, setColor] = useState(profile.avatarColor);
  const [city, setCity] = useState(profile.city ?? '');
  const [school, setSchool] = useState(profile.school ?? '');
  const [instagram, setInstagram] = useState(profile.instagram ?? '');
  const [interestsText, setInterestsText] = useState(profile.interests.join(', '));
  const [hasBirthday, setHasBirthday] = useState(!!profile.birthday);
  const [birthdayISO, setBirthdayISO] = useState(profile.birthday ?? new Date().toISOString());

  // ---- Username availability check state ----
  const [usernameStatus, setUsernameStatus] = useState<UsernameCheckStatus>('idle');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameRequestIdRef = useRef(0);

  // ---- Save state (loading / error for the whole edit form) ----
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- Settings modal state ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('main');

  // ---- Stats detail modal state (Friends / Favorites / Contacts) ----
  const [statModal, setStatModal] = useState<StatKind>(null);

  // ---- 2FA enrollment sub-state ----
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);

  // ---- Password change sub-state ----
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, []);

  // ---- Username availability check ----
  const checkUsernameAvailability = useCallback(
    (value: string) => {
      const normalized = value.trim().toLowerCase();

      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);

      // O'zining joriy username'i bo'lsa — tekshirish shart emas
      if (normalized === profile.username.toLowerCase()) {
        setUsernameStatus('idle');
        return;
      }

      if (!normalized) {
        setUsernameStatus('idle');
        return;
      }

      if (!USERNAME_REGEX.test(normalized)) {
        setUsernameStatus('invalid');
        return;
      }

      setUsernameStatus('checking');
      const myRequestId = ++usernameRequestIdRef.current;

      usernameDebounceRef.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase.rpc('is_username_available', {
            p_username: normalized,
          });

          // Eski so'rov natijasi kelib qolsa e'tiborsiz qoldiramiz
          if (myRequestId !== usernameRequestIdRef.current) return;

          if (error) {
            console.error('Username check error:', error);
            setUsernameStatus('idle');
            return;
          }

          setUsernameStatus(data ? 'available' : 'taken');
        } catch (e) {
          if (myRequestId !== usernameRequestIdRef.current) return;
          console.error('Username check exception:', e);
          setUsernameStatus('idle');
        }
      }, USERNAME_DEBOUNCE_MS);
    },
    [profile.username]
  );

  const resetUsernameCheck = () => {
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    usernameRequestIdRef.current += 1;
    setUsernameStatus('idle');
  };

  const openEdit = () => {
    setName(profile.name);
    setUsername(profile.username);
    setBio(profile.bio);
    setEmoji(profile.emoji);
    setColor(profile.avatarColor);
    setCity(profile.city ?? '');
    setSchool(profile.school ?? '');
    setInstagram(profile.instagram ?? '');
    setInterestsText(profile.interests.join(', '));
    setHasBirthday(!!profile.birthday);
    setBirthdayISO(profile.birthday ?? new Date().toISOString());
    resetUsernameCheck();
    setSaveError(null);
    setEditing(true);
  };

  const closeEdit = () => {
    resetUsernameCheck();
    setSaveError(null);
    setEditing(false);
  };

  const isUsernameBlocking =
    usernameStatus === 'taken' || usernameStatus === 'checking' || usernameStatus === 'invalid';

  const saveEdit = async () => {
    setSaveError(null);

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedName) {
      setSaveError('Name cannot be empty.');
      return;
    }

    if (!trimmedUsername) {
      setSaveError('Username cannot be empty.');
      return;
    }

    // Username o'zgargan bo'lsa — status'ni tekshiramiz
    if (trimmedUsername !== profile.username.toLowerCase()) {
      if (usernameStatus === 'taken') {
        setSaveError('This username is already taken.');
        return;
      }
      if (usernameStatus === 'invalid') {
        setSaveError(
          'Username must be 3–20 characters, start with a letter, and contain only letters, numbers, "." or "_".'
        );
        return;
      }
      if (usernameStatus === 'checking') {
        setSaveError('Still checking username availability, please wait...');
        return;
      }
      if (usernameStatus === 'idle') {
        // Foydalanuvchi tekshiruv tugashini kutmasdan bosgan bo'lishi mumkin
        setSaveError('Please wait for the username check to complete.');
        checkUsernameAvailability(trimmedUsername);
        return;
      }
    }

    setSaving(true);
    try {
      const result: any = await updateProfile({
        name: trimmedName,
        username: trimmedUsername,
        bio: bio.trim(),
        emoji,
        avatarColor: color,
        city: city.trim() || undefined,
        school: school.trim() || undefined,
        instagram: instagram.trim() || undefined,
        interests: interestsText.split(',').map((s: string) => s.trim()).filter(Boolean),
        birthday: hasBirthday ? birthdayISO : undefined,
      });

      // updateProfile ba'zi loyihalarda { error } qaytaradi, ba'zilarida hech narsa
      // qaytarmasligi mumkin — ikkalasini ham qo'llab-quvvatlaymiz.
      const error = result?.error;
      if (error) {
        const message =
          typeof error === 'string'
            ? error
            : error?.message?.includes('duplicate') || error?.code === '23505'
            ? 'This username was just taken. Please choose another.'
            : error?.message || 'Could not save changes. Please try again.';
        setSaveError(message);
        setSaving(false);
        return;
      }

      setSaving(false);
      setEditing(false);
    } catch (e: any) {
      setSaving(false);
      setSaveError(e?.message || 'Something went wrong while saving.');
    }
  };

  const openSettings = () => {
    setSettingsPage('main');
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setSettingsPage('main');
  };

  const goToPage = (page: SettingsPage) => {
    setSettingsPage(page);
    if (page === 'blocked') settings.loadBlockedUsers();
    if (page === '2fa') {
      setMfaFactorId(null);
      setMfaQr(null);
      setMfaSecret(null);
      setMfaCode('');
      setMfaError(null);
    }
    if (page === 'password') {
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
    }
    setSettingsOpen(true);
  };

  const confirmLogOut = () => {
    closeSettings();

    const handleLogout = async () => {
      await signOut();
      // Agar avtomatik yo'naltirilmasa, navigatsiyani qo'lda bering:
      // router.replace('/login'); yoki navigation.navigate('Login');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        handleLogout();
      }
    } else {
      setTimeout(() => {
        Alert.alert('Log out', 'Are you sure you want to log out?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', style: 'destructive', onPress: handleLogout },
        ]);
      }, 300);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await settings.deleteAccount();
            if (error) {
              Alert.alert('Could not delete account', error);
              return;
            }
            closeSettings();
            await signOut();
          },
        },
      ]
    );
  };

  // ---- Avatar handlers ----
  const handlePickAvatar = () => {
    settings.pickAndUploadAvatar((publicUrl: any) => {
      updateProfile({ avatarUrl: publicUrl });
    });
  };

  const handleRemoveAvatar = () => {
    Alert.alert('Remove photo', 'Remove your profile photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => settings.removeAvatar(() => updateProfile({ avatarUrl: undefined })),
      },
    ]);
  };

  // ---- Notification / privacy / sync toggles (all write straight to Supabase via updateProfile) ----
  const setPushEnabled = async (v: boolean) => {
    if (v) {
      const granted = await requestNotificationPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'Please enable notifications for Relatr in your device Settings to get birthday reminders.'
        );
        return;
      }
    }
    updateProfile({ pushEnabled: v });
  };
  const setMessageNotif = (v: boolean) => updateProfile({ messageNotif: v });
  const setLikesNotif = (v: boolean) => updateProfile({ likesNotif: v });
  const setSoundEnabled = (v: boolean) => updateProfile({ soundEnabled: v });

  const setSyncContacts = async (v: boolean) => {
    if (v) {
      const granted = await settings.requestContactsSync();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable contacts access in your device settings to sync contacts.');
        return;
      }
    }
    updateProfile({ syncContacts: v });
  };

  const setSyncCalendar = async (v: boolean) => {
    if (v) {
      const granted = await settings.requestCalendarSync();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable calendar access in your device settings to sync your calendar.');
        return;
      }
    }
    updateProfile({ syncCalendar: v });
  };

  const setPrivateAccount = (v: boolean) => updateProfile({ privateAccount: v });
  const setActivityStatus = (v: boolean) => updateProfile({ activityStatus: v });

  // ---- 2FA handlers ----
  const beginMfaEnrollment = async () => {
    setMfaError(null);
    const res = await settings.startMfaEnrollment();
    if (res.error) {
      setMfaError(res.error);
      return;
    }
    setMfaFactorId(res.factorId ?? null);
    setMfaQr(res.qrCodeSvg ?? null);
    setMfaSecret(res.secret ?? null);
  };

  const confirmMfaCode = async () => {
    if (!mfaFactorId) return;
    setMfaError(null);
    const res = await settings.verifyMfaEnrollment(mfaFactorId, mfaCode.trim());
    if (res.error) {
      setMfaError(res.error);
      return;
    }
    setMfaFactorId(null);
    setMfaQr(null);
    setMfaSecret(null);
    setMfaCode('');
    Alert.alert('Two-factor enabled', 'Your account is now protected with an authenticator app.');
  };

  const handleDisableMfa = () => {
    Alert.alert('Turn off two-factor authentication?', 'Your account will be less secure.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          const res = await settings.disableMfa();
          if (res.error) Alert.alert('Error', res.error);
        },
      },
    ]);
  };

  // ---- Password handlers ----
  const submitPasswordChange = async () => {
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    const res = await settings.changePassword(newPassword);
    setPasswordSaving(false);
    if (res.error) {
      setPasswordError(res.error);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Your password has been changed.');
    setSettingsPage('privacy');
  };

  const stats = {
    total: friends.length,
    favorites: friends.filter((f) => f.favorite).length,
    contacts: settings.contacts.filter((c) => c.status === 'accepted').length,
  };

  const pendingIncomingCount = settings.contacts.filter(
    (c) => c.status === 'pending' && c.isIncoming
  ).length;

  const metaLine = [profile.city, profile.school].filter(Boolean).join(' · ');

  const getStatModalTitle = () => {
    if (statModal === 'friends') return `Friends (${stats.total})`;
    if (statModal === 'favorites') return `Favorites (${stats.favorites})`;
    if (statModal === 'contacts') return `Contacts (${stats.contacts})`;
    return '';
  };

  const openStatModal = (kind: StatKind) => {
    if (kind === 'contacts') settings.loadContacts();
    setStatModal(kind);
  };

  // Navigate to a friend's FriendProfileScreen (same route name used by the
  // Dates screen) and close the stat modal behind it.
  const openFriendProfile = (friendId: string) => {
    setStatModal(null);
    navigation.navigate('FriendProfile', { friendId });
  };

  // ---------------------------------------------------------------------
  // Navigate to ContactProfileScreen for a given contact.
  // ContactProfileScreen expects `userId` = the OTHER PERSON's profile id
  // (see its ContactProfileParams type). We pass along whatever we
  // already know (name/username/emoji/avatar) so the target screen can
  // render instantly without a network round trip, while it still
  // re-resolves the real friendship state itself.
  //
  // IMPORTANT: `contact.id` here must be the other user's profile id
  // (AppContact.id), NOT the friendships row id. If your useProfileSettings
  // hook keys AppContact by the friendship row instead, expose the
  // underlying profile id as e.g. `contact.userId` and use that below.
  // ---------------------------------------------------------------------
  const openContactProfile = (contact: AppContact) => {
    setStatModal(null);
    navigation.navigate('ContactProfile', {
      userId: contact.id,
      name: contact.name,
      username: contact.username,
      emoji: contact.emoji,
      avatarColor: contact.avatarColor,
      avatarUrl: contact.avatarUrl,
    });
  };

  const renderStatModalContent = () => {
    if (statModal === 'contacts') {
      return (
        <FlatList
          data={settings.contacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.statListContent}
          showsVerticalScrollIndicator={false}
          refreshing={settings.contactsLoading}
          onRefresh={settings.loadContacts}
          ListEmptyComponent={
            <View style={styles.statEmptyWrap}>
              <Text style={styles.statEmptyText}>
                {settings.contactsLoading ? 'Loading...' : 'No contacts yet. Find people by username in Stories.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              colors={colors}
              settings={settings}
              onPress={openContactProfile}
            />
          )}
        />
      );
    }

    const dataSource = statModal === 'favorites' ? friends.filter((f) => f.favorite) : friends;

    return (
      <FlatList
        data={dataSource}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.statListContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.statEmptyWrap}>
            <Text style={styles.statEmptyText}>
              {statModal === 'favorites' ? 'No favorites yet.' : 'No friends yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.statRow}
            activeOpacity={0.6}
            onPress={() => openFriendProfile(item.id)}
          >
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.statRowPhoto} />
            ) : (
              <Avatar emoji={item.emoji ?? '🙂'} color={item.avatarColor ?? colors.primary} size={40} />
            )}
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={styles.statRowText}>{item.name}</Text>
              {!!item.category && <Text style={styles.statRowSub}>{item.category}</Text>}
            </View>
            {item.favorite && <Ionicons name="star" size={16} color={colors.primary} style={{ marginRight: spacing.xs }} />}
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />
          <TouchableOpacity onPress={openSettings} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.username}>{profile.username}</Text>
            {!!metaLine && <Text style={styles.meta}>{metaLine}</Text>}
          </View>

          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} disabled={settings.uploadingPhoto}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Avatar emoji={profile.emoji} color={profile.avatarColor} size={68} />
            )}
            <View style={styles.avatarEditBadge}>
              {settings.uploadingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={13} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {profile.avatarUrl && (
          <TouchableOpacity onPress={handleRemoveAvatar} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
            <Text style={styles.removePhotoText}>Remove photo</Text>
          </TouchableOpacity>
        )}

        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.statCard}>
          <TouchableOpacity
            style={styles.statBlock}
            activeOpacity={0.65}
            onPress={() => openStatModal('friends')}
          >
            <StatBlockInner value={stats.total} label="Friends" colors={colors} />
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statBlock}
            activeOpacity={0.65}
            onPress={() => openStatModal('favorites')}
          >
            <StatBlockInner value={stats.favorites} label="Favorites" colors={colors} />
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statBlock}
            activeOpacity={0.65}
            onPress={() => openStatModal('contacts')}
          >
            <StatBlockInner
              value={stats.contacts}
              label="Contacts"
              colors={colors}
              badge={pendingIncomingCount > 0 ? pendingIncomingCount : undefined}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.editBtn} onPress={openEdit} activeOpacity={0.7}>
          <Ionicons name="create-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={styles.editBtnText}>Edit profile</Text>
        </TouchableOpacity>

        {profile.instagram ? (
          <View style={styles.igRow}>
            <Ionicons name="logo-instagram" size={14} color={colors.textDim} />
            <Text style={styles.igText}>{profile.instagram}</Text>
          </View>
        ) : null}

        {profile.interests.length > 0 && (
          <View style={styles.interestsRow}>
            {profile.interests.map((i: string) => (
              <Chip key={i} label={i} />
            ))}
          </View>
        )}

        <View style={styles.divider} />

        {profile.birthday && (
          <DetailRow icon="gift-outline" label={`Birthday · ${formatFullDate(profile.birthday)}`} colors={colors} />
        )}

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.settingsGroup}>
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => goToPage('notifications')} colors={colors} />
          <SettingRow icon="cloud-upload-outline" label="Contact & Calendar Sync" onPress={() => goToPage('calendar')} colors={colors} />
          <SettingRow icon="lock-closed-outline" label="Privacy" onPress={() => goToPage('privacy')} colors={colors} />
          <SettingRow icon="information-circle-outline" label="About" onPress={() => goToPage('about')} colors={colors} last />
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* STAT DETAIL FULL-SCREEN MODAL (Friends / Favorites / Contacts) */}
      <Modal
        visible={statModal !== null}
        animationType="slide"
        onRequestClose={() => setStatModal(null)}
      >
        <SafeAreaView style={styles.settingsSafe}>
          <View style={styles.settingsTopBar}>
            <TouchableOpacity onPress={() => setStatModal(null)} hitSlop={10} style={styles.settingsBackBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>{getStatModalTitle()}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            {renderStatModalContent()}
          </View>
        </SafeAreaView>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={editing} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalTopRow}>
                <TouchableOpacity onPress={closeEdit} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <TouchableOpacity onPress={saveEdit} disabled={isUsernameBlocking || saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.doneText,
                        isUsernameBlocking && { opacity: 0.4 },
                      ]}
                    >
                      Done
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {!!saveError && (
                <Text style={[styles.errorText, { textAlign: 'center', marginTop: spacing.sm }]}>
                  {saveError}
                </Text>
              )}

              <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
                <TouchableOpacity onPress={handlePickAvatar} disabled={settings.uploadingPhoto}>
                  {profile.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImageLarge} resizeMode="cover" />
                  ) : (
                    <Avatar emoji={emoji} color={color} size={72} />
                  )}
                  <View style={styles.avatarEditBadge}>
                    {settings.uploadingPhoto ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="camera" size={13} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Emoji</Text>
              <View style={styles.wrapRow}>
                {EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiOption, emoji === e && styles.emojiOptionActive]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Color</Text>
              <View style={styles.wrapRow}>
                {avatarPalette.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setColor(c)}
                    style={[styles.colorOption, { backgroundColor: c }, color === c && styles.colorOptionActive]}
                  />
                ))}
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Username</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[
                    styles.input,
                    usernameStatus === 'taken' && styles.inputError,
                    usernameStatus === 'invalid' && styles.inputError,
                    usernameStatus === 'available' && styles.inputSuccess,
                  ]}
                  value={username}
                  onChangeText={(v) => {
                    const cleaned = v.replace(/[^a-z0-9_.]/gi, '').toLowerCase();
                    setUsername(cleaned);
                    checkUsernameAvailability(cleaned);
                  }}
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="unique_username"
                  maxLength={20}
                />
                {usernameStatus === 'checking' && (
                  <ActivityIndicator
                    size="small"
                    color={colors.textFaint}
                    style={styles.usernameStatusIcon}
                  />
                )}
                {usernameStatus === 'available' && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#34C759"
                    style={styles.usernameStatusIcon}
                  />
                )}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color="#FF3B30"
                    style={styles.usernameStatusIcon}
                  />
                )}
              </View>

              {usernameStatus === 'checking' && (
                <Text style={styles.helperText}>Checking availability...</Text>
              )}
              {usernameStatus === 'available' && (
                <Text style={[styles.helperText, { color: '#34C759' }]}>✓ Username available</Text>
              )}
              {usernameStatus === 'taken' && (
                <Text style={styles.errorText}>This username is already taken.</Text>
              )}
              {usernameStatus === 'invalid' && (
                <Text style={styles.errorText}>
                  3–20 characters, must start with a letter, only letters/numbers/./_ allowed.
                </Text>
              )}
              {usernameStatus === 'idle' && (
                <Text style={styles.helperText}>
                  Others find you by this username in Stories search. Must be unique — letters, numbers, "." and "_" only.
                </Text>
              )}

              <Text style={styles.label}>Bio</Text>
              <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Birthday</Text>
              <TouchableOpacity style={styles.birthdayToggle} onPress={() => setHasBirthday((v) => !v)} activeOpacity={0.7}>
                <View style={[styles.checkbox, hasBirthday && styles.checkboxActive]}>
                  {hasBirthday && <View style={styles.checkboxDot} />}
                </View>
                <Text style={styles.birthdayToggleText}>Track my birthday</Text>
              </TouchableOpacity>
              {hasBirthday && (
                <View style={styles.birthdayFieldsWrap}>
                  <DateFields value={birthdayISO} yearKnown={true} onChange={(iso: string) => setBirthdayISO(iso)} />
                </View>
              )}

              <Text style={styles.label}>City</Text>
              <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>School</Text>
              <TextInput style={styles.input} value={school} onChangeText={setSchool} placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Instagram</Text>
              <TextInput style={styles.input} value={instagram} onChangeText={setInstagram} placeholderTextColor={colors.textFaint} autoCapitalize="none" />

              <Text style={styles.label}>Interests (comma separated)</Text>
              <TextInput style={styles.input} value={interestsText} onChangeText={setInterestsText} placeholderTextColor={colors.textFaint} />

              <TouchableOpacity
                style={[styles.saveBtn, (isUsernameBlocking || saving) && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={isUsernameBlocking || saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
              <View style={{ height: spacing.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* FULL-SCREEN SETTINGS MODAL */}
      <Modal visible={settingsOpen} animationType="slide" onRequestClose={closeSettings}>
        <SafeAreaView style={styles.settingsSafe}>
          <View style={styles.settingsTopBar}>
            <TouchableOpacity
              onPress={() => (settingsPage === 'main' ? closeSettings() : setSettingsPage('main'))}
              hitSlop={10}
              style={styles.settingsBackBtn}
            >
              <Ionicons name={settingsPage === 'main' ? 'close' : 'chevron-back'} size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>
              {settingsPage === 'main' && 'Settings'}
              {settingsPage === 'notifications' && 'Notifications'}
              {settingsPage === 'calendar' && 'Contact & Calendar Sync'}
              {settingsPage === 'privacy' && 'Privacy'}
              {settingsPage === 'about' && 'About'}
              {settingsPage === 'blocked' && 'Blocked Users'}
              {settingsPage === '2fa' && 'Two-Factor Authentication'}
              {settingsPage === 'password' && 'Change Password'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
            {settingsPage === 'main' && (
              <>
                <Text style={styles.sectionLabel}>PREFERENCES</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="notifications-outline" label="Notifications" onPress={() => setSettingsPage('notifications')} colors={colors} />
                  <SettingRow icon="cloud-upload-outline" label="Contact & Calendar Sync" onPress={() => setSettingsPage('calendar')} colors={colors} />
                  <SettingRow icon="lock-closed-outline" label="Privacy" onPress={() => setSettingsPage('privacy')} colors={colors} last />
                </View>

                <Text style={styles.sectionLabel}>SUPPORT</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="information-circle-outline" label="About" onPress={() => setSettingsPage('about')} colors={colors} last />
                </View>

                <Text style={styles.sectionLabel}>ACCOUNT</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="log-out-outline" label="Log out" onPress={confirmLogOut} colors={colors} danger />
                  <SettingRow icon="trash-outline" label="Delete account" onPress={confirmDeleteAccount} colors={colors} danger last />
                </View>
              </>
            )}

            {settingsPage === 'notifications' && (
              <View style={styles.settingsGroup}>
                <ToggleRow label="Push notifications" value={profile.pushEnabled} onChange={setPushEnabled} colors={colors} />
                <ToggleRow label="Messages" value={profile.messageNotif} onChange={setMessageNotif} colors={colors} />
                <ToggleRow label="Likes & comments" value={profile.likesNotif} onChange={setLikesNotif} colors={colors} />
                <ToggleRow label="Sound" value={profile.soundEnabled} onChange={setSoundEnabled} colors={colors} last />
              </View>
            )}

            {settingsPage === 'calendar' && (
              <View style={styles.settingsGroup}>
                <ToggleRow label="Sync contacts" value={profile.syncContacts} onChange={setSyncContacts} colors={colors} />
                <ToggleRow label="Sync calendar" value={profile.syncCalendar} onChange={setSyncCalendar} colors={colors} last />
              </View>
            )}

            {settingsPage === 'privacy' && (
              <>
                <View style={styles.settingsGroup}>
                  <ToggleRow label="Private account" value={profile.privateAccount} onChange={setPrivateAccount} colors={colors} />
                  <ToggleRow label="Show activity status" value={profile.activityStatus} onChange={setActivityStatus} colors={colors} last />
                </View>
                <View style={styles.settingsGroup}>
                  <SettingRow
                    icon="shield-checkmark-outline"
                    label={`Two-Factor Authentication${profile.mfaEnabled ? ' · On' : ''}`}
                    onPress={() => goToPage('2fa')}
                    colors={colors}
                  />
                  <SettingRow icon="key-outline" label="Change password" onPress={() => goToPage('password')} colors={colors} />
                  <SettingRow icon="ban-outline" label="Blocked users" onPress={() => goToPage('blocked')} colors={colors} last />
                </View>
              </>
            )}

            {settingsPage === 'about' && (
              <View style={styles.settingsGroup}>
                <DetailRow icon="apps-outline" label="Version 1.0.0" colors={colors} />
                <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} colors={colors} />
                <SettingRow icon="shield-outline" label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} colors={colors} last />
              </View>
            )}

            {settingsPage === 'blocked' && (
              <View style={styles.settingsGroup}>
                {settings.blockedLoading ? (
                  <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : settings.blockedUsers.length === 0 ? (
                  <View style={{ padding: spacing.lg }}>
                    <Text style={{ ...typography.body, color: colors.textFaint }}>No blocked users.</Text>
                  </View>
                ) : (
                  settings.blockedUsers.map((u: BlockedUserSummary, idx: number) => (
                    <View
                      key={u.id}
                      style={[styles.settingRow, idx !== settings.blockedUsers.length - 1 && styles.settingRowBorder]}
                    >
                      <Avatar emoji="🙂" color={colors.primary} size={28} />
                      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                        <Text style={styles.settingText}>{u.name}</Text>
                        <Text style={{ ...typography.caption, color: colors.textFaint }}>{u.username}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert('Unblock', `Unblock ${u.name}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Unblock', onPress: () => settings.unblockUser(u.id) },
                          ])
                        }
                      >
                        <Text style={{ ...typography.bodyBold, color: colors.primary }}>Unblock</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}

            {settingsPage === '2fa' && (
              <View>
                {profile.mfaEnabled ? (
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingRow}>
                      <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                      <Text style={[styles.settingText, { marginLeft: spacing.sm }]}>
                        Two-factor authentication is on
                      </Text>
                    </View>
                  </View>
                ) : mfaQr ? (
                  <View style={{ paddingHorizontal: spacing.md }}>
                    <Text style={{ ...typography.body, color: colors.text, marginBottom: spacing.md }}>
                      Scan this QR code with Google Authenticator, Authy, or a similar app.
                    </Text>
                    {/* mfaQr Supabase'dan SVG data-URI ko'rinishida keladi */}
                    <Image source={{ uri: mfaQr }} style={styles.qrImage} />
                    {!!mfaSecret && (
                      <Text style={{ ...typography.caption, color: colors.textFaint, marginTop: spacing.sm }}>
                        Can't scan? Enter this code manually: {mfaSecret}
                      </Text>
                    )}
                    <Text style={styles.label}>Enter the 6-digit code</Text>
                    <TextInput
                      style={styles.input}
                      value={mfaCode}
                      onChangeText={setMfaCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="123456"
                      placeholderTextColor={colors.textFaint}
                    />
                    {!!mfaError && <Text style={styles.errorText}>{mfaError}</Text>}
                    <TouchableOpacity
                      style={[styles.saveBtn, settings.mfaLoading && { opacity: 0.6 }]}
                      onPress={confirmMfaCode}
                      disabled={settings.mfaLoading || mfaCode.trim().length !== 6}
                    >
                      {settings.mfaLoading ? (
                        <ActivityIndicator color={colors.bg} />
                      ) : (
                        <Text style={styles.saveBtnText}>Verify & Enable</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ paddingHorizontal: spacing.md }}>
                    <Text style={{ ...typography.body, color: colors.textDim, marginBottom: spacing.md }}>
                      Add an extra layer of security to your account using an authenticator app.
                    </Text>
                    {!!mfaError && <Text style={styles.errorText}>{mfaError}</Text>}
                    <TouchableOpacity
                      style={[styles.saveBtn, settings.mfaLoading && { opacity: 0.6 }]}
                      onPress={beginMfaEnrollment}
                      disabled={settings.mfaLoading}
                    >
                      {settings.mfaLoading ? (
                        <ActivityIndicator color={colors.bg} />
                      ) : (
                        <Text style={styles.saveBtnText}>Set up two-factor authentication</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {profile.mfaEnabled && (
                  <TouchableOpacity style={{ marginTop: spacing.lg, alignItems: 'center' }} onPress={handleDisableMfa}>
                    <Text style={{ ...typography.bodyBold, color: '#FF3B30' }}>Turn off two-factor authentication</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {settingsPage === 'password' && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textFaint}
                />
                <Text style={styles.label}>Confirm new password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  placeholderTextColor={colors.textFaint}
                />
                {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
                <TouchableOpacity
                  style={[styles.saveBtn, passwordSaving && { opacity: 0.6 }]}
                  onPress={submitPasswordChange}
                  disabled={passwordSaving || !newPassword || !confirmPassword}
                >
                  {passwordSaving ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.saveBtnText}>Update password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: spacing.xxl }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; colors: ColorScheme }> = ({
  icon,
  label,
  colors,
}) => {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={15} color={colors.textDim} />
      <Text style={styles.detailText}>{label}</Text>
    </View>
  );
};

const SettingRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
  colors: ColorScheme;
}> = ({ icon, label, onPress, danger, last, colors }) => {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.settingRow, !last && styles.settingRowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Ionicons name={icon} size={18} color={danger ? '#FF3B30' : colors.textDim} />
      <Text style={[styles.settingText, danger && styles.settingTextDanger]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {!danger && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
    </TouchableOpacity>
  );
};

const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  colors: ColorScheme;
}> = ({ label, value, onChange, last, colors }) => {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.settingRow, !last && styles.settingRowBorder]}>
      <Text style={styles.settingText}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
};

const StatBlockInner: React.FC<{ value: number; label: string; colors: ColorScheme; badge?: number }> = ({
  value,
  label,
  colors,
  badge,
}) => {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.statBlockInner}>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        {!!badge && (
          <View style={styles.statBadge}>
            <Text style={styles.statBadgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

// ---------------------------------------------------------------------
// Contact row — shows an accepted contact plainly, or a pending incoming
// request with Accept/Decline actions inline (per product decision: one
// list, not a separate requests tab).
//
// The whole row is now tappable and opens ContactProfileScreen via the
// `onPress` prop. The inline Accept/Decline/Remove controls stop event
// propagation so tapping them does not also trigger navigation.
// ---------------------------------------------------------------------
const ContactRow: React.FC<{
  contact: AppContact;
  colors: ColorScheme;
  settings: ReturnType<typeof useProfileSettings>;
  onPress: (contact: AppContact) => void;
}> = ({ contact, colors, settings, onPress }) => {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPendingIncoming = contact.status === 'pending' && contact.isIncoming;
  const isPendingOutgoing = contact.status === 'pending' && !contact.isIncoming;

  return (
    <TouchableOpacity
      style={styles.statRow}
      activeOpacity={0.6}
      onPress={() => onPress(contact)}
    >
      {contact.avatarUrl ? (
        <Image source={{ uri: contact.avatarUrl }} style={styles.statRowPhoto} />
      ) : (
        <Avatar emoji={contact.emoji} color={contact.avatarColor} size={40} />
      )}
      <View style={{ marginLeft: spacing.sm, flex: 1 }}>
        <Text style={styles.statRowText}>{contact.name}</Text>
        <Text style={styles.statRowSub}>
          @{contact.username}
          {isPendingOutgoing ? ' · Requested' : ''}
        </Text>
      </View>

      {isPendingIncoming ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <TouchableOpacity
            style={styles.contactAcceptBtn}
            onPress={(e) => {
              e.stopPropagation();
              settings.acceptContactRequest(contact.id);
            }}
          >
            <Text style={styles.contactAcceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.contactDeclineBtn}
            onPress={(e) => {
              e.stopPropagation();
              settings.declineContactRequest(contact.id);
            }}
          >
            <Ionicons name="close" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        </View>
      ) : isPendingOutgoing ? (
        <Ionicons name="time-outline" size={16} color={colors.textFaint} />
      ) : (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert('Remove contact', `Remove @${contact.username} from your contacts?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => settings.removeContact(contact.id) },
            ]);
          }}
          hitSlop={8}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120 },

    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },

    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginTop: spacing.sm,
    },
    name: { ...typography.h2, color: colors.text, fontWeight: '700' },
    username: { ...typography.body, color: colors.textDim, marginTop: 2 },
    meta: { ...typography.caption, color: colors.textFaint, marginTop: 4 },

    avatarImage: { width: 68, height: 68, borderRadius: 34 },
    avatarImageLarge: { width: 72, height: 72, borderRadius: 36 },
    avatarEditBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    removePhotoText: { ...typography.caption, color: '#FF3B30' },

    bio: { ...typography.body, color: colors.text, marginTop: spacing.md, lineHeight: 20 },

    statCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
    },
    statBlock: { flex: 1 },
    statBlockInner: { alignItems: 'center' },
    statValue: { ...typography.h3, color: colors.text, fontWeight: '700' },
    statLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    statDivider: { width: StyleSheet.hairlineWidth, height: '70%', backgroundColor: colors.border },
    statBadge: {
      position: 'absolute',
      top: -4,
      right: -12,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: '#FF3B30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },

    editBtn: {
      flexDirection: 'row',
      marginTop: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editBtnText: { ...typography.bodyBold, color: colors.text },

    igRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
    igText: { ...typography.caption, color: colors.textDim, marginLeft: 6 },

    interestsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: spacing.lg },

    detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    detailText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },

    sectionLabel: {
      ...typography.caption,
      color: colors.textFaint,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginTop: spacing.xl,
      marginBottom: spacing.xs,
      marginLeft: 2,
    },
    settingsGroup: {
      backgroundColor: colors.cardAlt,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.md },
    settingRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    settingText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
    settingTextDanger: { color: '#FF3B30' },

    modalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '90%' },
    modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { ...typography.h3, color: colors.text },
    cancelText: { ...typography.body, color: colors.textDim },
    doneText: { ...typography.bodyBold, color: colors.primary },

    label: { ...typography.caption, color: colors.textDim, marginTop: spacing.md, marginBottom: spacing.xs, fontWeight: '600' },
    helperText: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
    input: { backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: spacing.md, ...typography.body },
    inputError: { borderColor: '#FF3B30' },
    inputSuccess: { borderColor: '#34C759' },
    usernameStatusIcon: { position: 'absolute', right: spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
    emojiOption: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginBottom: spacing.sm },
    emojiOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
    colorOption: { width: 32, height: 32, borderRadius: 16, marginRight: spacing.sm, marginBottom: spacing.sm },
    colorOptionActive: { borderWidth: 3, borderColor: colors.text },

    birthdayToggle: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.sm },
    checkbox: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.border, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
    checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkboxDot: { width: 8, height: 8, borderRadius: 2, backgroundColor: colors.bg },
    birthdayToggleText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
    birthdayFieldsWrap: { marginTop: spacing.xs, marginBottom: spacing.sm },

    saveBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.lg },
    saveBtnText: { ...typography.bodyBold, color: colors.bg },

    errorText: { ...typography.caption, color: '#FF3B30', marginTop: spacing.xs },

    qrImage: { width: 200, height: 200, alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: radius.md },

    settingsSafe: { flex: 1, backgroundColor: colors.bg },
    settingsTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    settingsBackBtn: { width: 24 },
    settingsTitle: { ...typography.h3, color: colors.text, fontWeight: '700' },
    settingsScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 60 },

    statListContent: { paddingBottom: 60 },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    statRowPhoto: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt },
    statRowText: { ...typography.body, color: colors.text },
    statRowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    statRowCount: { ...typography.bodyBold, color: colors.primary },
    statEmptyWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
    statEmptyText: { ...typography.body, color: colors.textFaint, textAlign: 'center' },

    contactAcceptBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: 6,
    },
    contactAcceptBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
    contactDeclineBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default ProfileScreen;