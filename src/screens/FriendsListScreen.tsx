import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Image,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { useNavigation } from '@react-navigation/native';
import { daysSince, formatTimeAgo, daysUntilNextOccurrence } from '../utils/dateUtils';
import { Ionicons } from '@expo/vector-icons';
import { RelationshipCategory } from '../types';

const CATEGORIES: (RelationshipCategory | 'All')[] = [
  'All',
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

type SortMode = 'recent' | 'name' | 'upcoming';

const FriendsListScreen: React.FC = () => {
  const { friends, updateFriend } = useApp();
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RelationshipCategory | 'All'>('All');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(() => friends.filter((f) => f.isArchived).length, [friends]);

  const visibleFriends = useMemo(
    () => friends.filter((f) => (showArchived ? true : !f.isArchived)),
    [friends, showArchived]
  );

  const filtered = useMemo(() => {
    const list = visibleFriends
      .filter((f) => (category === 'All' ? true : f.category === category))
      .filter((f) => {
        const q = query.toLowerCase().trim();
        if (!q) return true;
        return (
          f.name.toLowerCase().includes(q) ||
          f.nickname?.toLowerCase().includes(q) ||
          f.city?.toLowerCase().includes(q) ||
          f.interests.some((i) => i.toLowerCase().includes(q))
        );
      });

    return list.sort((a, b) => {
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;

      if (sortMode === 'name') return a.name.localeCompare(b.name);

      if (sortMode === 'upcoming') {
        const nextA = Math.min(
          ...a.importantDates.map((d) => daysUntilNextOccurrence(d.date)),
          9999
        );
        const nextB = Math.min(
          ...b.importantDates.map((d) => daysUntilNextOccurrence(d.date)),
          9999
        );
        return nextA - nextB;
      }

      const sinceA = daysSince(a.lastContacted);
      const sinceB = daysSince(b.lastContacted);
      if (sinceA === null && sinceB === null) return a.name.localeCompare(b.name);
      if (sinceA === null) return 1;
      if (sinceB === null) return -1;
      return sinceB - sinceA;
    });
  }, [visibleFriends, query, category, sortMode]);

  const needsReconnect = useMemo(() => {
    return visibleFriends.filter((f) => {
      if (f.isArchived) return false;
      if (!f.reconnectFrequencyDays) return false;
      const since = daysSince(f.lastContacted);
      return since !== null && since >= f.reconnectFrequencyDays;
    });
  }, [visibleFriends]);

  const upcomingBirthdays = useMemo(() => {
    return visibleFriends
      .filter((f) => !f.isArchived)
      .flatMap((f) =>
        f.importantDates
          .filter((d) => d.type === 'Birthday')
          .map((d) => ({ friend: f, days: daysUntilNextOccurrence(d.date) }))
      )
      .filter((x) => x.days <= 14)
      .sort((a, b) => a.days - b.days);
  }, [visibleFriends]);

  const unarchive = (id: string) => {
    updateFriend(id, { isArchived: false, updatedAt: new Date().toISOString() });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Friends</Text>
          <Text style={styles.subheader}>
            {visibleFriends.length} {visibleFriends.length === 1 ? 'person' : 'people'} you care about
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddFriend')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color={colors.bg} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          placeholder="Search name, city, interest..."
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* TUZATILGAN KATEGORIYA SCROLLVIEW QISMI */}
      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>
      </View>

      <View style={styles.sortRow}>
        <View style={{ flexDirection: 'row' }}>
          <SortPill label="Recent" active={sortMode === 'recent'} onPress={() => setSortMode('recent')} />
          <SortPill label="A–Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} />
          <SortPill label="Upcoming" active={sortMode === 'upcoming'} onPress={() => setSortMode('upcoming')} />
        </View>
        {archivedCount > 0 && (
          <TouchableOpacity
            onPress={() => setShowArchived((v) => !v)}
            style={styles.archiveToggle}
            hitSlop={8}
          >
            <Ionicons
              name={showArchived ? 'eye-outline' : 'eye-off-outline'}
              size={14}
              color={colors.textFaint}
            />
            <Text style={styles.archiveToggleText}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {upcomingBirthdays.length > 0 && category === 'All' && !query && (
          <View style={styles.birthdayBanner}>
            <Ionicons name="gift" size={16} color={colors.gold} />
            <Text style={styles.birthdayText}>
              {upcomingBirthdays[0].friend.name}'s birthday is{' '}
              {upcomingBirthdays[0].days === 0 ? 'today' : `in ${upcomingBirthdays[0].days} days`}
              {upcomingBirthdays.length > 1 ? ` (+${upcomingBirthdays.length - 1} more soon)` : ''}
            </Text>
          </View>
        )}

        {needsReconnect.length > 0 && category === 'All' && !query && (
          <View style={styles.reconnectBanner}>
            <Ionicons name="sparkles" size={16} color={colors.gold} />
            <Text style={styles.reconnectText}>
              Time to reconnect with {needsReconnect.length}{' '}
              {needsReconnect.length === 1 ? 'person' : 'people'}
            </Text>
          </View>
        )}

        {filtered.map((f) => {
          const since = daysSince(f.lastContacted);
          const overdue =
            !f.isArchived &&
            f.reconnectFrequencyDays &&
            since !== null &&
            since >= f.reconnectFrequencyDays;
          const nextBday = f.importantDates.find((d) => d.type === 'Birthday');
          const bdayDays = nextBday ? daysUntilNextOccurrence(nextBday.date) : null;

          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('FriendProfile', { friendId: f.id })}
              style={[styles.friendRow, f.isArchived && styles.friendRowArchived]}
            >
              {f.photoUri ? (
                <Image source={{ uri: f.photoUri }} style={styles.photoAvatar} />
              ) : (
                <Avatar emoji={f.emoji} color={f.avatarColor} size={50} />
              )}
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.friendName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.favorite && (
                    <Ionicons name="star" size={13} color={colors.gold} style={{ marginLeft: 6 }} />
                  )}
                  {f.isArchived && (
                    <View style={styles.archivedTag}>
                      <Text style={styles.archivedTagText}>Archived</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.friendMeta} numberOfLines={1}>
                  {f.category}
                  {f.city ? ` · ${f.city}` : ''}
                </Text>
                {!f.isArchived && bdayDays !== null && bdayDays <= 14 && (
                  <Text style={styles.bdaySoon}>
                    🎂 {bdayDays === 0 ? 'Birthday today!' : `Birthday in ${bdayDays}d`}
                  </Text>
                )}
              </View>
              {f.isArchived ? (
                <TouchableOpacity
                  onPress={() => unarchive(f.id)}
                  style={styles.unarchiveBtn}
                  hitSlop={8}
                >
                  <Ionicons name="arrow-undo-outline" size={14} color={colors.textDim} />
                  <Text style={styles.unarchiveBtnText}>Restore</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.lastContact, overdue ? styles.lastContactOverdue : null]}>
                    {f.lastContacted ? formatTimeAgo(f.lastContacted) : 'No contact yet'}
                  </Text>
                  {overdue && <Text style={styles.overdueTag}>Reconnect →</Text>}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 && (
          <Text style={styles.empty}>
            {showArchived
              ? 'No friends found. Try a different search or category.'
              : 'No active friends found. Try a different search, category, or show archived.'}
          </Text>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const SortPill: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.sortPill, active && styles.sortPillActive]}
    activeOpacity={0.8}
  >
    <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: { ...typography.h1, color: colors.text },
  subheader: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.sm,
    ...typography.body,
  },
  categoryContainer: {
    marginVertical: spacing.xs,
  },
  categoryScroll: {
    flexGrow: 0,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs, // Chip-lar balandligi qirqilmasligi uchun
    alignItems: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  sortPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginRight: spacing.xs,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortPillText: { ...typography.small, color: colors.textDim, fontWeight: '600' },
  sortPillTextActive: { color: colors.bg },
  archiveToggle: { flexDirection: 'row', alignItems: 'center' },
  archiveToggleText: { ...typography.small, color: colors.textFaint, marginLeft: 4 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold + '20',
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  birthdayText: { ...typography.caption, color: colors.gold, marginLeft: spacing.xs, fontWeight: '600', flex: 1 },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gold + '20',
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  reconnectText: { ...typography.caption, color: colors.gold, marginLeft: spacing.xs, fontWeight: '600' },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  friendRowArchived: { opacity: 0.55 },
  photoAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.cardAlt },
  friendName: { ...typography.bodyBold, color: colors.text, maxWidth: 160 },
  archivedTag: {
    marginLeft: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  archivedTagText: { ...typography.small, color: colors.textFaint },
  friendMeta: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  bdaySoon: { ...typography.small, color: colors.gold, marginTop: 2, fontWeight: '600' },
  lastContact: { ...typography.small, color: colors.textFaint },
  lastContactOverdue: { color: colors.gold },
  overdueTag: { ...typography.small, color: colors.gold, fontWeight: '700', marginTop: 2 },
  unarchiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  unarchiveBtnText: { ...typography.small, color: colors.textDim, fontWeight: '600', marginLeft: 4 },
  empty: { ...typography.body, color: colors.textFaint, marginTop: spacing.lg, textAlign: 'center' },
});

export default FriendsListScreen;
