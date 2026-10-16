import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { SectionHeader } from '../components/Card';
import Chip from '../components/Chip';
import { formatRelativeDay, MONTH_NAMES } from '../utils/dateUtils';
import {
  COUNTRY_OPTIONS,
  UpcomingSpecialDay,
  countryLabel,
  dedupeSpecialDays,
  toDetailParams,
  withNextDate,
} from '../utils/specialDays';
import { supabase } from '../utils/supabase';
import { worldSpecialDayFromRow } from '../utils/mappers';
import { WorldHolidayRow, WorldSpecialDay } from '../types';

interface DaySection {
  key: string;
  title: string;
  subtitle: string;
  data: UpcomingSpecialDay[];
}

const WorldSpecialDaysScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;

  const [days, setDays] = useState<WorldSpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countryFilter, setCountryFilter] = useState('GLOBAL');
  const [search, setSearch] = useState('');
  const [reminders, setReminders] = useState<Set<string>>(new Set());

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchDays = useCallback(async () => {
    const { data, error: err } = await supabase.from('world_holidays').select('*');
    if (!isMountedRef.current) return;
    if (err) {
      setError('Could not load special days. Check your connection and try again.');
      return;
    }
    setError(null);
    setDays(((data as WorldHolidayRow[] | null) ?? []).map(worldSpecialDayFromRow));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await fetchDays();
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase
      .channel('world-special-days-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'world_holidays' }, () => {
        if (!cancelled) fetchDays();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchDays]);

  // Reload reminders every time the screen regains focus, so a bell toggled
  // on the detail screen is reflected here when the user comes back.
  const loadReminders = useCallback(async () => {
    if (!meId) return;
    const { data, error: err } = await supabase
      .from('special_day_reminders')
      .select('holiday_id')
      .eq('user_id', meId);
    if (err || !isMountedRef.current) return;
    setReminders(new Set((data ?? []).map((r: { holiday_id: string }) => String(r.holiday_id))));
  }, [meId]);

  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [loadReminders]),
  );

  const flipLocal = useCallback((id: string, on: boolean) => {
    setReminders((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleReminder = useCallback(
    async (id: string) => {
      if (!meId) return;
      const had = reminders.has(id);
      flipLocal(id, !had);
      const { error: err } = had
        ? await supabase.from('special_day_reminders').delete().eq('holiday_id', id).eq('user_id', meId)
        : await supabase
            .from('special_day_reminders')
            .insert({ holiday_id: id, user_id: meId, remind_days_before: 1 });
      if (err) {
        console.error('toggle reminder error:', err);
        if (isMountedRef.current) flipLocal(id, had); // roll back
      }
    },
    [meId, reminders, flipLocal],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await supabase.functions.invoke('sync-world-holidays', {
        body: { year: new Date().getFullYear(), force: true },
      });
    } catch (e) {
      console.error('manual sync error:', e);
    }
    await Promise.all([fetchDays(), loadReminders()]);
    if (isMountedRef.current) setRefreshing(false);
  }, [fetchDays, loadReminders]);

  const upcoming = useMemo<UpcomingSpecialDay[]>(() => {
    const q = search.trim().toLowerCase();
    const filtered = days.filter((w) => {
      const code = w.countryCode ?? 'GLOBAL';
      if (!(countryFilter === 'GLOBAL' || code === 'GLOBAL' || code === countryFilter)) return false;
      return !q || w.name.toLowerCase().includes(q);
    });
    const list = countryFilter === 'GLOBAL' ? dedupeSpecialDays(filtered) : filtered;
    return list.map(withNextDate).sort((a, b) => a.days - b.days);
  }, [days, countryFilter, search]);

  const next = upcoming[0];

  const sections = useMemo<DaySection[]>(() => {
    const rest = upcoming.slice(1);
    const defs: { key: string; title: string; subtitle: string; test: (d: number) => boolean }[] = [
      { key: 'today', title: 'Today', subtitle: 'Happening right now', test: (d) => d === 0 },
      { key: 'week', title: 'This week', subtitle: 'In the next 7 days', test: (d) => d >= 1 && d <= 7 },
      { key: 'month', title: 'This month', subtitle: 'In the next 30 days', test: (d) => d >= 8 && d <= 30 },
      { key: 'later', title: 'Later this year', subtitle: 'Plan ahead', test: (d) => d > 30 },
    ];
    return defs
      .map((s) => ({ key: s.key, title: s.title, subtitle: s.subtitle, data: rest.filter((r) => s.test(r.days)) }))
      .filter((s) => s.data.length > 0);
  }, [upcoming]);

  const openDetail = useCallback(
    (d: UpcomingSpecialDay) => navigation.navigate('SpecialDayDetail', toDetailParams(d)),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: UpcomingSpecialDay }) => {
      const on = reminders.has(String(item.id));
      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.8}
          onPress={() => openDetail(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${MONTH_NAMES[item.month - 1]} ${item.day}`}
        >
          <View style={styles.emojiWrap}>
            <Text style={styles.rowEmoji}>{item.emoji}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {MONTH_NAMES[item.month - 1]} {item.day} · {countryLabel(item.countryCode)}
            </Text>
          </View>
          <Text style={[styles.rowDays, item.days <= 7 && styles.rowDaysSoon]}>
            {formatRelativeDay(item.days)}
          </Text>
          <TouchableOpacity
            onPress={() => toggleReminder(String(item.id))}
            hitSlop={10}
            style={styles.bellBtn}
            accessibilityRole="button"
            accessibilityLabel={on ? `Turn off reminder for ${item.name}` : `Remind me about ${item.name}`}
          >
            <Ionicons
              name={on ? 'notifications' : 'notifications-outline'}
              size={20}
              color={on ? colors.gold : colors.textFaint}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [reminders, styles, colors.gold, colors.textFaint, openDetail, toggleReminder],
  );

  const header = next ? (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => openDetail(next)}
      style={[styles.hero, next.days === 0 && styles.heroToday]}
      accessibilityRole="button"
      accessibilityLabel={`Next special day: ${next.name}`}
    >
      <Text style={styles.heroEmoji}>{next.emoji}</Text>
      <View style={styles.heroBody}>
        <Text style={styles.heroLabel}>{next.days === 0 ? 'Today' : 'Coming up next'}</Text>
        <Text style={styles.heroName} numberOfLines={2}>
          {next.name}
        </Text>
        <Text style={styles.heroDate}>
          {MONTH_NAMES[next.month - 1]} {next.day} · {countryLabel(next.countryCode)}
        </Text>
      </View>
      {next.days > 0 && (
        <View style={styles.heroCount}>
          <Text style={styles.heroCountNum}>{next.days}</Text>
          <Text style={styles.heroCountUnit}>{next.days === 1 ? 'day' : 'days'}</Text>
        </View>
      )}
    </TouchableOpacity>
  ) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>World special days</Text>
          <Text style={styles.subtitle}>Holidays and celebrations around the world</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          placeholder="Search special days"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search special days"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {COUNTRY_OPTIONS.map((c) => (
          <Chip
            key={c.code}
            label={c.label}
            active={countryFilter === c.code}
            onPress={() => setCountryFilter(c.code)}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title={section.title} subtitle={section.subtitle} />
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !next ? (
              <Text style={styles.empty}>
                {search ? `No special days match "${search}".` : 'No special days found for this country.'}
              </Text>
            ) : null
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    title: { ...typography.h1, color: colors.text },
    subtitle: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: spacing.lg,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      paddingVertical: spacing.sm,
      paddingLeft: spacing.sm,
      ...typography.body,
    },
    chipsScroll: { flexGrow: 0, marginTop: spacing.sm },
    chipsContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
    sectionHeaderWrap: { marginTop: spacing.lg, marginBottom: spacing.xs },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '18',
      borderWidth: 1,
      borderColor: colors.primary + '55',
      borderRadius: radius.md,
      padding: spacing.lg,
      marginTop: spacing.md,
    },
    heroToday: { backgroundColor: colors.gold + '22', borderColor: colors.gold },
    heroEmoji: { fontSize: 46, marginRight: spacing.md },
    heroBody: { flex: 1 },
    heroLabel: { ...typography.caption, color: colors.textDim, fontWeight: '600' },
    heroName: { ...typography.bodyBold, color: colors.text, fontSize: 19, marginTop: 2 },
    heroDate: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
    heroCount: { alignItems: 'center', marginLeft: spacing.md },
    heroCountNum: { color: colors.primary, fontSize: 44, fontWeight: '800', lineHeight: 48 },
    heroCountUnit: { ...typography.caption, color: colors.textDim },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    emojiWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowEmoji: { fontSize: 22 },
    rowBody: { flex: 1, marginLeft: spacing.sm },
    rowTitle: { ...typography.bodyBold, color: colors.text },
    rowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
    rowDays: { ...typography.caption, color: colors.textDim, fontWeight: '700', marginLeft: spacing.sm },
    rowDaysSoon: { color: colors.primary },
    bellBtn: { paddingLeft: spacing.md, paddingVertical: 6 },

    empty: {
      ...typography.body,
      color: colors.textFaint,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
    },
    retryText: { ...typography.caption, color: colors.bg, fontWeight: '700' },
  });

export default WorldSpecialDaysScreen;