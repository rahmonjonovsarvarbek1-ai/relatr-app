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
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography, avatarPalette } from '../theme/theme';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { Ionicons } from '@expo/vector-icons';
import { formatFullDate } from '../utils/dateUtils';
import DateFields from '../components/DateFields';

const EMOJIS = ['🌿', '😊', '🌸', '🎸', '📚', '🏀', '✈️', '🎮', '🎨', '☕', '🔥', '💫'];

// Full-screen settings — which "page" is currently shown inside the settings modal
type SettingsPage = 'main' | 'notifications' | 'calendar' | 'privacy' | 'about';

const ProfileScreen: React.FC = () => {
  const { profile, friends, updateProfile } = useApp();
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

  // Local demo toggles for the settings tools (wire these up to your
  // Supabase user_settings table / AppContext when ready)
  const [pushEnabled, setPushEnabled] = useState(true);
  const [messageNotif, setMessageNotif] = useState(true);
  const [likesNotif, setLikesNotif] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [syncContacts, setSyncContacts] = useState(false);
  const [syncCalendar, setSyncCalendar] = useState(false);

  const [privateAccount, setPrivateAccount] = useState(false);
  const [activityStatus, setActivityStatus] = useState(true);

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
      interests: interestsText.split(',').map((s) => s.trim()).filter(Boolean),
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

  const confirmLogOut = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => {
        // TODO: wire to your auth sign-out call
        closeSettings();
      } },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          // TODO: wire to your account-deletion flow
        } },
      ]
    );
  };

  const stats = {
    total: friends.length,
    favorites: friends.filter((f) => f.favorite).length,
    categories: new Set(friends.map((f) => f.category)).size,
  };

  const metaLine = [profile.city, profile.school].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Top bar — chapda lock, o'ngda ... menyu (endi full-screen sozlamalarni ochadi) */}
        <View style={styles.topBar}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />
          <TouchableOpacity onPress={openSettings} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.username}>{profile.username}</Text>
            {!!metaLine && <Text style={styles.meta}>{metaLine}</Text>}
          </View>
          <Avatar emoji={profile.emoji} color={profile.avatarColor} size={68} />
        </View>

        {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {/* Stat card — engil card ko'rinish, oldingi oddiy matn o'rniga */}
        <View style={styles.statCard}>
          <StatBlock value={stats.total} label="Friends" />
          <View style={styles.statDivider} />
          <StatBlock value={stats.favorites} label="Favorites" />
          <View style={styles.statDivider} />
          <StatBlock value={stats.categories} label="Categories" />
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
            {profile.interests.map((i) => (
              <Chip key={i} label={i} />
            ))}
          </View>
        )}

        <View style={styles.divider} />

        {profile.birthday && <DetailRow icon="gift-outline" label={`Birthday · ${formatFullDate(profile.birthday)}`} />}

        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.settingsGroup}>
          <SettingRow icon="notifications-outline" label="Notifications" onPress={() => { setSettingsPage('notifications'); setSettingsOpen(true); }} />
          <SettingRow icon="cloud-upload-outline" label="Contact & Calendar Sync" onPress={() => { setSettingsPage('calendar'); setSettingsOpen(true); }} />
          <SettingRow icon="lock-closed-outline" label="Privacy" onPress={() => { setSettingsPage('privacy'); setSettingsOpen(true); }} last />
        </View>
        <View style={styles.settingsGroup}>
          <SettingRow icon="information-circle-outline" label="About" onPress={() => { setSettingsPage('about'); setSettingsOpen(true); }} last />
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {/* ---------------- EDIT PROFILE MODAL ---------------- */}
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
                <Avatar emoji={emoji} color={color} size={72} />
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

              {/* Birthday — endi to'liq ishlaydi: checkbox yoqilganda sana tanlash maydonlari chiqadi */}
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

      {/* ---------------- FULL-SCREEN SETTINGS ---------------- */}
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
                <ToggleRow label="Push notifications" value={pushEnabled} onChange={setPushEnabled} />
                <ToggleRow label="Messages" value={messageNotif} onChange={setMessageNotif} />
                <ToggleRow label="Likes & comments" value={likesNotif} onChange={setLikesNotif} />
                <ToggleRow label="Sound" value={soundEnabled} onChange={setSoundEnabled} last />
              </View>
            )}

            {settingsPage === 'calendar' && (
              <View style={styles.settingsGroup}>
                <ToggleRow label="Sync contacts" value={syncContacts} onChange={setSyncContacts} />
                <ToggleRow label="Sync calendar" value={syncCalendar} onChange={setSyncCalendar} last />
              </View>
            )}

            {settingsPage === 'privacy' && (
              <>
                <View style={styles.settingsGroup}>
                  <ToggleRow label="Private account" value={privateAccount} onChange={setPrivateAccount} />
                  <ToggleRow label="Show activity status" value={activityStatus} onChange={setActivityStatus} last />
                </View>
                <View style={styles.settingsGroup}>
                  <SettingRow icon="shield-checkmark-outline" label="Two-Factor Authentication" onPress={() => {}} />
                  <SettingRow icon="key-outline" label="Change password" onPress={() => {}} />
                  <SettingRow icon="ban-outline" label="Blocked users" onPress={() => {}} last />
                </View>
              </>
            )}

            {settingsPage === 'about' && (
              <View style={styles.settingsGroup}>
                <DetailRow icon="apps-outline" label="Version 1.0.0" />
                <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => {}} />
                <SettingRow icon="shield-outline" label="Privacy Policy" onPress={() => {}} last />
              </View>
            )}

            <View style={{ height: spacing.xxl }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ icon: any; label: string }> = ({ icon, label }) => (
  <View style={styles.detailRow}>
    <Ionicons name={icon} size={15} color={colors.textDim} />
    <Text style={styles.detailText}>{label}</Text>
  </View>
);

const SettingRow: React.FC<{
  icon: any;
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

const StatBlock: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <View style={styles.statBlock}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

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
  statBlock: { flex: 1, alignItems: 'center' },
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

  // Full-screen settings modal
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
  settingsScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});

export default ProfileScreen;