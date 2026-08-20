import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
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
import { colors, radius, spacing, typography, avatarPalette } from '../theme/theme';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { Ionicons } from '@expo/vector-icons';
import { formatFullDate } from '../utils/dateUtils';
import DateFields from '../components/DateFields';
import { useAuth } from '../context/AuthContext';
import { useProfileSettings } from '../hooks/useProfileSettings';
import { requestNotificationPermissionsAsync } from '../utils/notifications';

type BlockedUserSummary = { id: string; name: string; username: string };

const EMOJIS = ['🌿', '😊', '🌸', '🎸', '📚', '🏀', '✈️', '🎮', '🎨', '☕', '🔥', '💫'];

type SettingsPage = 'main' | 'notifications' | 'calendar' | 'privacy' | 'about' | 'blocked' | '2fa' | 'password';
type StatKind = 'friends' | 'favorites' | 'categories' | null;

const TERMS_URL = 'https://mongom.app/terms'; // haqiqiy URL bilan almashtiring
const PRIVACY_URL = 'https://mongom.app/privacy'; // haqiqiy URL bilan almashtiring

const ProfileScreen: React.FC = () => {
  const { profile, friends, updateProfile } = useApp();
  const { signOut } = useAuth();
  const settings = useProfileSettings();
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

  // ---- Settings modal state ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('main');

  // ---- Stats detail modal state (Friends / Favorites / Categories) ----
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
    setEditing(true);
  };

  const saveEdit = () => {
    updateProfile({
      name: name.trim() || profile.name,
      username: username.trim() || profile.username,
      bio: bio.trim(),
      emoji,
      avatarColor: color,
      city: city.trim() || undefined,
      school: school.trim() || undefined,
      instagram: instagram.trim() || undefined,
      interests: interestsText.split(',').map((s: string) => s.trim()).filter(Boolean),
      birthday: hasBirthday ? birthdayISO : undefined,
    });
    setEditing(false);
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
    categories: new Set(friends.map((f) => f.category)).size,
  };

  const metaLine = [profile.city, profile.school].filter(Boolean).join(' · ');

  // ---- Stat modal data resolution ----
  const categoryList = Array.from(new Set(friends.map((f) => f.category))).filter(Boolean) as string[];

  const getStatModalTitle = () => {
    if (statModal === 'friends') return `Friends (${stats.total})`;
    if (statModal === 'favorites') return `Favorites (${stats.favorites})`;
    if (statModal === 'categories') return `Categories (${stats.categories})`;
    return '';
  };

  const renderStatModalContent = () => {
    if (statModal === 'categories') {
      return (
        <FlatList
          data={categoryList}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.statListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.statEmptyWrap}>
              <Text style={styles.statEmptyText}>No categories yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const count = friends.filter((f) => f.category === item).length;
            return (
              <View style={styles.statRow}>
                <View style={styles.categoryDot} />
                <Text style={styles.statRowText}>{item}</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.statRowCount}>{count}</Text>
              </View>
            );
          }}
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
          <View style={styles.statRow}>
            <Avatar emoji={item.emoji ?? '🙂'} color={item.avatarColor ?? colors.primary} size={40} />
            <View style={{ marginLeft: spacing.sm, flex: 1 }}>
              <Text style={styles.statRowText}>{item.name}</Text>
              {!!item.category && <Text style={styles.statRowSub}>{item.category}</Text>}
            </View>
            {item.favorite && <Ionicons name="star" size={16} color={colors.primary} />}
          </View>
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
            onPress={() => setStatModal('friends')}
          >
            <StatBlockInner value={stats.total} label="Friends" />
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statBlock}
            activeOpacity={0.65}
            onPress={() => setStatModal('favorites')}
          >
            <StatBlockInner value={stats.favorites} label="Favorites" />
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statBlock}
            activeOpacity={0.65}
            onPress={() => setStatModal('categories')}
          >
            <StatBlockInner value={stats.categories} label="Categories" />
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

        {profile.birthday && <DetailRow icon="gift-outline" label={`Birthday · ${formatFullDate(profile.birthday)}`} />}

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.settingsGroup}>
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => goToPage('notifications')} />
          <SettingRow icon="cloud-upload-outline" label="Contact & Calendar Sync" onPress={() => goToPage('calendar')} />
          <SettingRow icon="lock-closed-outline" label="Privacy" onPress={() => goToPage('privacy')} last />
        </View>
        <View style={styles.settingsGroup}>
          <SettingRow icon="information-circle-outline" label="About" onPress={() => goToPage('about')} last />
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* STAT DETAIL FULL-SCREEN MODAL (Friends / Favorites / Categories) */}
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
                <TouchableOpacity onPress={() => setEditing(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Edit profile</Text>
                <TouchableOpacity onPress={saveEdit}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              </View>

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
              <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholderTextColor={colors.textFaint} autoCapitalize="none" />

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

              <TouchableOpacity style={styles.saveBtn} onPress={saveEdit}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
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
                  <SettingRow icon="notifications-outline" label="Notifications" onPress={() => setSettingsPage('notifications')} />
                  <SettingRow icon="cloud-upload-outline" label="Contact & Calendar Sync" onPress={() => setSettingsPage('calendar')} />
                  <SettingRow icon="lock-closed-outline" label="Privacy" onPress={() => setSettingsPage('privacy')} last />
                </View>

                <Text style={styles.sectionLabel}>SUPPORT</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="information-circle-outline" label="About" onPress={() => setSettingsPage('about')} last />
                </View>

                <Text style={styles.sectionLabel}>ACCOUNT</Text>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="log-out-outline" label="Log out" onPress={confirmLogOut} danger />
                  <SettingRow icon="trash-outline" label="Delete account" onPress={confirmDeleteAccount} danger last />
                </View>
              </>
            )}

            {settingsPage === 'notifications' && (
              <View style={styles.settingsGroup}>
                <ToggleRow label="Push notifications" value={profile.pushEnabled} onChange={setPushEnabled} />
                <ToggleRow label="Messages" value={profile.messageNotif} onChange={setMessageNotif} />
                <ToggleRow label="Likes & comments" value={profile.likesNotif} onChange={setLikesNotif} />
                <ToggleRow label="Sound" value={profile.soundEnabled} onChange={setSoundEnabled} last />
              </View>
            )}

            {settingsPage === 'calendar' && (
              <View style={styles.settingsGroup}>
                <ToggleRow label="Sync contacts" value={profile.syncContacts} onChange={setSyncContacts} />
                <ToggleRow label="Sync calendar" value={profile.syncCalendar} onChange={setSyncCalendar} last />
              </View>
            )}

            {settingsPage === 'privacy' && (
              <>
                <View style={styles.settingsGroup}>
                  <ToggleRow label="Private account" value={profile.privateAccount} onChange={setPrivateAccount} />
                  <ToggleRow label="Show activity status" value={profile.activityStatus} onChange={setActivityStatus} last />
                </View>
                <View style={styles.settingsGroup}>
                  <SettingRow
                    icon="shield-checkmark-outline"
                    label={`Two-Factor Authentication${profile.mfaEnabled ? ' · On' : ''}`}
                    onPress={() => goToPage('2fa')}
                  />
                  <SettingRow icon="key-outline" label="Change password" onPress={() => goToPage('password')} />
                  <SettingRow icon="ban-outline" label="Blocked users" onPress={() => goToPage('blocked')} last />
                </View>
              </>
            )}

            {settingsPage === 'about' && (
              <View style={styles.settingsGroup}>
                <DetailRow icon="apps-outline" label="Version 1.0.0" />
                <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
                <SettingRow icon="shield-outline" label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} last />
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

const DetailRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string }> = ({ icon, label }) => (
  <View style={styles.detailRow}>
    <Ionicons name={icon} size={15} color={colors.textDim} />
    <Text style={styles.detailText}>{label}</Text>
  </View>
);

const SettingRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}> = ({ icon, label, onPress, danger, last }) => (
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

const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}> = ({ label, value, onChange, last }) => (
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

const StatBlockInner: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.statBlockInner}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
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
  input: { backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, padding: spacing.md, ...typography.body },
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
  statRowText: { ...typography.body, color: colors.text },
  statRowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  statRowCount: { ...typography.bodyBold, color: colors.primary },
  statEmptyWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  statEmptyText: { ...typography.body, color: colors.textFaint },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
});

export default ProfileScreen;