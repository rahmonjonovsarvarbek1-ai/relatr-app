import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from '../components/Avatar';
import Chip from '../components/Chip';
import { useNavigation } from '@react-navigation/native';
import { daysSince, formatTimeAgo } from '../utils/dateUtils';
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

const FriendsListScreen: React.FC = () => {
  const { friends } = useApp();
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(RelationshipCategory | 'All')>('All');

  const filtered = useMemo(() => {
    return friends
      .filter((f) => (category === 'All' ? true : f.category === category))
      .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [friends, query, category]);

  const needsReconnect = useMemo(() => {
    return friends.filter((f) => {
      if (!f.reconnectFrequencyDays) return false;
      const since = daysSince(f.lastContacted);
      return since !== null && since >= f.reconnectFrequencyDays;
    });
  }, [friends]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.header}>Friends</Text>
          <Text style={styles.subheader}>{friends.length} people you care about</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddFriend')}
        >
          <Ionicons name="add" size={26} color={colors.bg} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          placeholder="Search friends..."
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={{ paddingHorizontal: spacing.lg }}
      >
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {needsReconnect.length > 0 && category === 'All' && !query && (
          <View style={styles.reconnectBanner}>
            <Ionicons name="sparkles" size={16} color={colors.gold} />
            <Text style={styles.reconnectText}>
              Time to reconnect with {needsReconnect.length} {needsReconnect.length === 1 ? 'person' : 'people'}
            </Text>
          </View>
        )}

        {filtered.map((f) => {
          const since = daysSince(f.lastContacted);
          const overdue = f.reconnectFrequencyDays && since !== null && since >= f.reconnectFrequencyDays;
          return (
            <TouchableOpacity
              key={f.id}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('FriendProfile', { friendId: f.id })}
              style={styles.friendRow}
            >
              <Avatar emoji={f.emoji} color={f.avatarColor} size={50} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.friendName}>{f.name}</Text>
                  {f.favorite && <Ionicons name="star" size={13} color={colors.gold} style={{ marginLeft: 6 }} />}
                </View>
                <Text style={styles.friendMeta}>{f.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.lastContact, overdue ? { color: colors.gold } : null]}>
                  {f.lastContacted ? formatTimeAgo(f.lastContacted) : 'No contact yet'}
                </Text>
                {overdue && <Text style={styles.overdueTag}>Reconnect →</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 && (
          <Text style={styles.empty}>No friends found. Try a different search or category.</Text>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm,
    ...typography.body,
  },
  categoryScroll: { marginTop: spacing.md, flexGrow: 0 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  friendName: { ...typography.bodyBold, color: colors.text },
  friendMeta: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  lastContact: { ...typography.small, color: colors.textFaint },
  overdueTag: { ...typography.small, color: colors.gold, fontWeight: '700', marginTop: 2 },
  empty: { ...typography.body, color: colors.textFaint, marginTop: spacing.lg, textAlign: 'center' },
});

export default FriendsListScreen;
