import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from '../components/Avatar';
import { Card, SectionHeader } from '../components/Card';
import {
  daysUntilNextOccurrence,
  formatRelativeDay,
  formatShortDate,
  getAgeTurning,
  MONTH_NAMES,
} from '../utils/dateUtils';
import { worldSpecialDays } from '../data/seed';
import { useNavigation } from '@react-navigation/native';

const DatesScreen: React.FC = () => {
  const { friends } = useApp();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<'friends' | 'world'>('friends');

  const friendUpcoming = useMemo(() => {
    const rows: { friendId: string; friendName: string; emoji: string; color: string; label: string; days: number; date: string; age: number | null }[] = [];
    friends.forEach((f) => {
      f.importantDates.forEach((d) => {
        rows.push({
          friendId: f.id,
          friendName: f.name,
          emoji: f.emoji,
          color: f.avatarColor,
          label: d.label,
          days: daysUntilNextOccurrence(d.date),
          date: d.date,
          age: d.type === 'Birthday' && d.yearKnown ? getAgeTurning(d.date) : null,
        });
      });
    });
    return rows.sort((a, b) => a.days - b.days);
  }, [friends]);

  const worldUpcoming = useMemo(() => {
    const now = new Date();
    return worldSpecialDays
      .map((w) => {
        const isoGuess = `${now.getFullYear()}-${String(w.month).padStart(2, '0')}-${String(
          w.day
        ).padStart(2, '0')}`;
        return { ...w, days: daysUntilNextOccurrence(isoGuess), isoGuess };
      })
      .sort((a, b) => a.days - b.days);
  }, []);

  const soonest = friendUpcoming.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Dates</Text>
        <Text style={styles.subheader}>Never miss a moment that matters</Text>

        {soonest.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Coming up" subtitle="Your nearest important dates" />
            {soonest.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => navigation.navigate('FriendsTab', { screen: 'FriendProfile', params: { friendId: item.friendId } })}
                activeOpacity={0.8}
              >
                <Card style={styles.upcomingCard}>
                  <Avatar emoji={item.emoji} color={item.color} size={46} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.upcomingName}>
                      {item.friendName}
                      {item.age ? ` turns ${item.age}` : ''}
                    </Text>
                    <Text style={styles.upcomingLabel}>
                      {item.label} · {formatShortDate(item.date)}
                    </Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{formatRelativeDay(item.days)}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'friends' && styles.tabBtnActive]}
            onPress={() => setTab('friends')}
          >
            <Text style={[styles.tabBtnText, tab === 'friends' && styles.tabBtnTextActive]}>
              Friends' Dates
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'world' && styles.tabBtnActive]}
            onPress={() => setTab('world')}
          >
            <Text style={[styles.tabBtnText, tab === 'world' && styles.tabBtnTextActive]}>
              World Special Days
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'friends' ? (
          <View>
            {friendUpcoming.length === 0 && (
              <Text style={styles.empty}>No important dates added yet. Add one from a friend's profile.</Text>
            )}
            {friendUpcoming.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => navigation.navigate('FriendsTab', { screen: 'FriendProfile', params: { friendId: item.friendId } })}
                activeOpacity={0.8}
              >
                <View style={styles.row}>
                  <Avatar emoji={item.emoji} color={item.color} size={40} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.rowTitle}>{item.friendName}</Text>
                    <Text style={styles.rowSub}>
                      {item.label} · {formatShortDate(item.date)}
                    </Text>
                  </View>
                  <Text style={styles.rowDays}>{formatRelativeDay(item.days)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View>
            {worldUpcoming.map((w) => (
              <View key={w.id} style={styles.row}>
                <View style={styles.worldEmojiWrap}>
                  <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.rowTitle}>{w.name}</Text>
                  <Text style={styles.rowSub}>
                    {MONTH_NAMES[w.month - 1]} {w.day}
                  </Text>
                </View>
                <Text style={styles.rowDays}>{formatRelativeDay(w.days)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  header: { ...typography.h1, color: colors.text },
  subheader: { ...typography.body, color: colors.textFaint, marginTop: 4 },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  upcomingName: { ...typography.bodyBold, color: colors.text },
  upcomingLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  badge: {
    backgroundColor: colors.primary + '25',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeText: { ...typography.small, color: colors.primary, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    padding: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: colors.primary },
  tabBtnText: { ...typography.caption, color: colors.textDim, fontWeight: '600' },
  tabBtnTextActive: { color: colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { ...typography.bodyBold, color: colors.text },
  rowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  rowDays: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  worldEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { ...typography.body, color: colors.textFaint, marginTop: spacing.md },
});

export default DatesScreen;
