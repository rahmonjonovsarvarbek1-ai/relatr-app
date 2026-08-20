import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography, avatarPalette } from '../theme/theme';
import Chip from '../components/Chip';
import AvatarPicker from '../components/AvatarPicker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RelationshipCategory, ImportantDate } from '../types';
import DateFields from '../components/DateFields';
import { newId } from '../utils/id';
import { daysUntilNextOccurrence, formatRelativeDay, getAgeTurning } from '../utils/dateUtils';

const CATEGORIES: RelationshipCategory[] = [
  'Best Friend',
  'Close Friend',
  'Friend',
  'Classmate',
  'Roommate',
  'Family',
  'Coworker',
  'Acquaintance',
  'Situationship',
];

const EMOJIS = ['😊', '🌸', '🎸', '📚', '🏀', '✈️', '🎮', '🎨', '⚽', '🎬', '🐶', '☕', '🌿', '🔥', '💫', '🎧'];

const AddFriendScreen: React.FC = () => {
  const { friends, addFriend, updateFriend, addImportantDate, updateImportantDate, deleteImportantDate } = useApp();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editingFriendId: string | undefined = route.params?.friendId;
  const existingFriend = editingFriendId ? friends.find((f) => f.id === editingFriendId) : undefined;
  const isEditing = !!existingFriend;

  const existingBirthday = existingFriend?.importantDates.find((d) => d.type === 'Birthday');

  const [name, setName] = useState(existingFriend?.name ?? '');
  const [nickname, setNickname] = useState(existingFriend?.nickname ?? '');
  const [category, setCategory] = useState<RelationshipCategory>(existingFriend?.category ?? 'Friend');
  const [emoji, setEmoji] = useState(existingFriend?.emoji ?? '😊');
  const [color, setColor] = useState(existingFriend?.avatarColor ?? avatarPalette[0]);
  const [photoUri, setPhotoUri] = useState<string | undefined>(existingFriend?.photoUri);
  const [city, setCity] = useState(existingFriend?.city ?? '');
  const [school, setSchool] = useState(existingFriend?.school ?? '');
  const [phone, setPhone] = useState(existingFriend?.phone ?? '');
  const [instagram, setInstagram] = useState(existingFriend?.instagram ?? '');
  const [interestsText, setInterestsText] = useState(existingFriend?.interests.join(', ') ?? '');
  const [reconnectDays, setReconnectDays] = useState(
    existingFriend?.reconnectFrequencyDays ? String(existingFriend.reconnectFrequencyDays) : '30'
  );
  const [isArchived, setIsArchived] = useState(existingFriend?.isArchived ?? false);

  const [hasBirthday, setHasBirthday] = useState(!!existingBirthday);
  const [birthdayISO, setBirthdayISO] = useState(existingBirthday?.date ?? new Date().toISOString());
  const [birthdayYearKnown, setBirthdayYearKnown] = useState(existingBirthday?.yearKnown ?? false);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);

    const interests = interestsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (isEditing && existingFriend) {
        // Keep the friend's importantDates list (source of truth for birthdays,
        // same as FriendProfileScreen) in sync with the toggle/fields above.
        if (hasBirthday) {
          if (existingBirthday) {
            updateImportantDate(existingFriend.id, existingBirthday.id, {
              date: birthdayISO,
              yearKnown: birthdayYearKnown,
            });
          } else {
            addImportantDate(existingFriend.id, {
              id: newId(),
              label: 'Birthday',
              type: 'Birthday',
              date: birthdayISO,
              yearKnown: birthdayYearKnown,
            });
          }
        } else if (existingBirthday) {
          deleteImportantDate(existingFriend.id, existingBirthday.id);
        }

        updateFriend(existingFriend.id, {
          name: name.trim(),
          nickname: nickname.trim() || undefined,
          avatarColor: color,
          emoji,
          photoUri,
          category,
          phone: phone.trim() || undefined,
          instagram: instagram.trim() || undefined,
          city: city.trim() || undefined,
          school: school.trim() || undefined,
          interests,
          reconnectFrequencyDays: reconnectDays ? parseInt(reconnectDays, 10) : undefined,
          isArchived,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const importantDates: ImportantDate[] = hasBirthday
          ? [
              {
                id: newId(),
                label: 'Birthday',
                type: 'Birthday',
                date: birthdayISO,
                yearKnown: birthdayYearKnown,
              },
            ]
          : [];

        addFriend({
          id: newId(),
          name: name.trim(),
          nickname: nickname.trim() || undefined,
          avatarColor: color,
          emoji,
          photoUri,
          category,
          phone: phone.trim() || undefined,
          instagram: instagram.trim() || undefined,
          city: city.trim() || undefined,
          school: school.trim() || undefined,
          interests,
          importantDates,
          notes: [],
          lastContacted: undefined,
          reconnectFrequencyDays: reconnectDays ? parseInt(reconnectDays, 10) : undefined,
          favorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          socialLinks: [],
          isArchived: false,
        });
      }

      // This was the missing piece: without navigating away, the screen
      // just sat there after Save with no visible confirmation.
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const canSave = !!name.trim() && !saving;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{isEditing ? 'Edit Friend' : 'New Friend'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={!canSave} hitSlop={10}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
          <AvatarPicker photoUri={photoUri} emoji={emoji} color={color} size={88} onChangePhoto={setPhotoUri} />
        </View>

        <Text style={styles.label}>Emoji (used if no photo)</Text>
        <View style={styles.wrapRow}>
          {EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[styles.emojiOption, emoji === e && styles.emojiOptionActive]}
              onPress={() => setEmoji(e)}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
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

        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={colors.textFaint}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Nickname</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor={colors.textFaint}
          value={nickname}
          onChangeText={setNickname}
        />

        <Text style={styles.label}>Relationship</Text>
        <View style={styles.wrapRow}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <Text style={styles.label}>Birthday</Text>
        <TouchableOpacity
          style={styles.birthdayToggle}
          onPress={() => setHasBirthday((v) => !v)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={[styles.checkbox, hasBirthday && styles.checkboxActive]}>
            {hasBirthday && <View style={styles.checkboxDot} />}
          </View>
          <Text style={styles.birthdayToggleText}>Track {name.trim() ? `${name.trim()}'s` : 'their'} birthday</Text>
        </TouchableOpacity>

        {hasBirthday && (
          <View style={styles.birthdayFieldsWrap}>
            <DateFields
              value={birthdayISO}
              yearKnown={birthdayYearKnown}
              onChange={(iso, known) => {
                setBirthdayISO(iso);
                setBirthdayYearKnown(known);
              }}
            />
            {birthdayYearKnown && getAgeTurning(birthdayISO) != null ? (
              <View style={styles.ageBadge}>
                <Ionicons name="balloon-outline" size={14} color={colors.primary} />
                <Text style={styles.ageBadgeText}>
                  Turns {getAgeTurning(birthdayISO)} this year · {formatRelativeDay(daysUntilNextOccurrence(birthdayISO))}
                </Text>
              </View>
            ) : (
              <View style={styles.ageBadge}>
                <Ionicons name="calendar-outline" size={14} color={colors.textDim} />
                <Text style={styles.ageBadgeText}>
                  {formatRelativeDay(daysUntilNextOccurrence(birthdayISO))} · year not set, so age isn't shown
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Austin, TX"
          placeholderTextColor={colors.textFaint}
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>School</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. UT Austin"
          placeholderTextColor={colors.textFaint}
          value={school}
          onChangeText={setSchool}
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor={colors.textFaint}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Instagram</Text>
        <TextInput
          style={styles.input}
          placeholder="@username"
          placeholderTextColor={colors.textFaint}
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Interests</Text>
        <TextInput
          style={styles.input}
          placeholder="Comma separated, e.g. Coffee, Hiking, Music"
          placeholderTextColor={colors.textFaint}
          value={interestsText}
          onChangeText={setInterestsText}
        />

        <Text style={styles.label}>Reconnect reminder (days)</Text>
        <TextInput
          style={styles.input}
          placeholder="30"
          placeholderTextColor={colors.textFaint}
          value={reconnectDays}
          onChangeText={setReconnectDays}
          keyboardType="number-pad"
        />

        {isEditing && (
          <>
            <Text style={styles.label}>Archive</Text>
            <TouchableOpacity
              style={styles.archiveToggleRow}
              onPress={() => setIsArchived((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.archiveTitle}>{isArchived ? 'Archived' : 'Active'}</Text>
                <Text style={styles.archiveSubtitle}>
                  {isArchived
                    ? 'Hidden from the main list until unarchived.'
                    : 'Archive to hide without deleting.'}
                </Text>
              </View>
              <Ionicons
                name={isArchived ? 'archive' : 'archive-outline'}
                size={20}
                color={isArchived ? colors.primary : colors.textDim}
              />
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topTitle: { ...typography.h3, color: colors.text },
  saveText: { ...typography.bodyBold, color: colors.primary },
  saveTextDisabled: { color: colors.textFaint },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  label: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    ...typography.body,
  },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  emojiOptionActive: { borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  colorOptionActive: { borderWidth: 3, borderColor: colors.text },
  birthdayToggle: { flexDirection: 'row', alignItems: 'center' },
  birthdayToggleText: { ...typography.body, color: colors.text, marginLeft: spacing.sm },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  checkboxDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.bg },
  birthdayFieldsWrap: { marginTop: spacing.xs, marginBottom: spacing.sm },
  ageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  ageBadgeText: { ...typography.caption, color: colors.text, marginLeft: spacing.xs, flex: 1 },
  archiveToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  archiveTitle: { ...typography.bodyBold, color: colors.text },
  archiveSubtitle: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
});

export default AddFriendScreen;