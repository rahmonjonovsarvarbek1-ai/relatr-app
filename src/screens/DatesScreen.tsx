import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { Card, SectionHeader } from '../components/Card';
import Chip from '../components/Chip';
import {
  daysUntilNextOccurrence,
  formatRelativeDay,
  formatShortDate,
  getAgeTurning,
  MONTH_NAMES,
} from '../utils/dateUtils';
import { supabase } from '../utils/supabase';
import { worldSpecialDayFromRow } from '../utils/mappers';
import { WorldHolidayRow, WorldSpecialDay } from '../types';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabKey = 'friends' | 'world';

interface FriendUpcomingItem {
  friendId: string;
  friendName: string;
  emoji: string;
  color: string;
  photoUri?: string;
  label: string;
  days: number;
  date: string;
  age: number | null;
}

// ---------------------------------------------------------------------
// Nearby real users — pulled from `profiles` by lat/lng proximity to the
// current user, replacing the old fake/mock suggestion list. Excludes
// self and anyone already an accepted friend/contact. Collapsible via a
// show/hide toggle, matching "agar hohlasa uni show yoki close qilsa
// boladigon" requirement.
// ---------------------------------------------------------------------

interface NearbyProfile {
  id: string;
  name: string;
  username: string;
  emoji: string;
  avatarColor: string;
  avatarUrl?: string;
  distanceKm: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Haversine distance in km between two lat/lng points.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// Rough bounding box (in degrees) for a given radius, used to keep the
// Supabase query cheap before the precise haversine filter/sort below.
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lngDelta = radiusKm / (111 * Math.cos(toRad(lat)) || 1);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

const NearbySuggestions: React.FC<{
  onOpenProfile: (userId: string, preview?: Partial<NearbyProfile>) => void;
}> = ({ onOpenProfile }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;

  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [nearby, setNearby] = useState<NearbyProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!meId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', meId)
        .maybeSingle();

      if (meError || !me || me.latitude == null || me.longitude == null) {
        // No location on file for the current user — nothing to
        // compute proximity against, so just show nothing quietly.
        setNearby([]);
        setLoading(false);
        return;
      }

      const RADIUS_KM = 50;
      const box = boundingBox(me.latitude, me.longitude, RADIUS_KM);

      const [{ data: candidates, error: candError }, { data: friendRows }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, username, emoji, avatar_color, avatar_url, latitude, longitude')
          .neq('id', meId)
          .gte('latitude', box.minLat)
          .lte('latitude', box.maxLat)
          .gte('longitude', box.minLng)
          .lte('longitude', box.maxLng)
          .limit(50),
        supabase
          .from('friendships')
          .select('requester_id, friend_id, status')
          .or(`requester_id.eq.${meId},friend_id.eq.${meId}`),
      ]);

      if (candError) {
        setError('Could not load nearby people.');
        setNearby([]);
        setLoading(false);
        return;
      }

      // Anyone already connected or with a pending request either way
      // shouldn't clutter "nearby suggestions" — that's what the
      // Contacts flow on ProfileScreen is for.
      const excluded = new Set<string>();
      (friendRows ?? []).forEach((f: any) => {
        excluded.add(f.requester_id === meId ? f.friend_id : f.requester_id);
      });

      const withDistance: NearbyProfile[] = (candidates ?? [])
        .filter((c: any) => c.latitude != null && c.longitude != null && !excluded.has(c.id))
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          username: c.username,
          emoji: c.emoji ?? '🙂',
          avatarColor: c.avatar_color ?? colors.primary,
          avatarUrl: c.avatar_url ?? undefined,
          distanceKm: haversineKm(me.latitude, me.longitude, c.latitude, c.longitude),
        }))
        .filter((c) => c.distanceKm <= RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 15);

      setNearby(withDistance);
    } finally {
      setLoading(false);
    }
  }, [meId, colors.primary]);

  useEffect(() => {
    load();
  }, [load]);

  if (!meId) return null;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <View style={styles.nearbyHeaderRow}>
        <SectionHeader title="Nearby" subtitle="People close to you" />
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          style={styles.nearbyToggleBtn}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide nearby suggestions' : 'Show nearby suggestions'}
        >
          <Text style={styles.nearbyToggleText}>{visible ? 'Hide' : 'Show'}</Text>
          <Ionicons
            name={visible ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textDim}
          />
        </TouchableOpacity>
      </View>

      {visible && (
        <>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />
          ) : error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : nearby.length === 0 ? (
            <Text style={styles.empty}>No one nearby yet.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: spacing.xs }}
            >
              {nearby.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.nearbyCard}
                  activeOpacity={0.8}
                  onPress={() => onOpenProfile(p.id, p)}
                >
                  {p.avatarUrl ? (
                    <Image source={{ uri: p.avatarUrl }} style={styles.nearbyAvatarImage} />
                  ) : (
                    <Avatar emoji={p.emoji} color={p.avatarColor} size={52} />
                  )}
                  <Text style={styles.nearbyName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.nearbyDistance}>
                    {p.distanceKm < 1 ? '<1 km' : `${Math.round(p.distanceKm)} km`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
};

const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: 'GLOBAL', label: 'Global' },
  { code: 'UZ', label: 'Uzbekistan' },
  { code: 'US', label: 'USA' },
  { code: 'GB', label: 'UK' },
  { code: 'RU', label: 'Russia' },
  { code: 'TR', label: 'Turkey' },
];

const DatesScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { friends } = useApp();
  const navigation = useNavigation<any>();

  const [tab, setTab] = useState<TabKey>('friends');
  const [worldSpecialDays, setWorldSpecialDays] = useState<WorldSpecialDay[]>([]);
  const [isLoadingWorld, setIsLoadingWorld] = useState(true);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countryFilter, setCountryFilter] = useState('GLOBAL');
  const [worldSearch, setWorldSearch] = useState('');

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchWorldHolidays = useCallback(async () => {
    const { data, error } = await supabase.from('world_holidays').select('*');
    if (!isMountedRef.current) return;

    if (error) {
      setWorldError('Failed to load special days. Please try again.');
      return;
    }
    setWorldError(null);
    setWorldSpecialDays((data as WorldHolidayRow[] | null ?? []).map(worldSpecialDayFromRow));
  }, []);

  const syncFromNager = useCallback(async (): Promise<void> => {
    try {
      const { error } = await supabase.functions.invoke('sync-world-holidays', {
        body: { year: new Date().getFullYear() },
      });
      if (!isMountedRef.current) return;
      if (error) {
        console.error('sync-world-holidays returned error:', error.message);
        setSyncWarning('Some special days may be out of date.');
      } else {
        setSyncWarning(null);
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      console.error('sync-world-holidays invoke error:', e);
      setSyncWarning('Some special days may be out of date.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoadingWorld(true);
      await fetchWorldHolidays();
      if (cancelled) return;
      await syncFromNager();
      if (cancelled) return;
      setIsLoadingWorld(false);
    })();

    const channel = supabase
      .channel('world-holidays')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_holidays' },
        () => {
          if (!cancelled) fetchWorldHolidays();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchWorldHolidays, syncFromNager]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await supabase.functions.invoke('sync-world-holidays', {
        body: { year: new Date().getFullYear(), force: true },
      });
    } catch (e) {
      console.error('manual sync error:', e);
    }
    await fetchWorldHolidays();
    setIsRefreshing(false);
  }, [fetchWorldHolidays]);

  const friendUpcoming = useMemo<FriendUpcomingItem[]>(() => {
    const rows: FriendUpcomingItem[] = [];
    friends.forEach((f) => {
      f.importantDates.forEach((d) => {
        rows.push({
          friendId: f.id,
          friendName: f.name,
          emoji: f.emoji,
          color: f.avatarColor,
          photoUri: f.photoUri,
          label: d.label,
          days: daysUntilNextOccurrence(d.date),
          date: d.date,
          age: d.type === 'Birthday' && d.yearKnown ? getAgeTurning(d.date) : null,
        });
      });
    });
    return rows.sort((a, b) => a.days - b.days);
  }, [friends]);

  const worldFiltered = useMemo(() => {
    const q = worldSearch.trim().toLowerCase();
    return worldSpecialDays.filter((w) => {
      const countryCode = (w as WorldSpecialDay & { countryCode?: string }).countryCode ?? 'GLOBAL';

      const matchesCountry =
        countryFilter === 'GLOBAL' || countryCode === 'GLOBAL' || countryCode === countryFilter;
      if (!matchesCountry) return false;

      if (!q) return true;
      return w.name.toLowerCase().includes(q);
    });
  }, [worldSpecialDays, countryFilter, worldSearch]);

  const worldUpcoming = useMemo(() => {
    return worldFiltered
      .map((w) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const thisYear = new Date(currentYear, w.month - 1, w.day);
        thisYear.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const year = thisYear < today ? currentYear + 1 : currentYear;
        const isoGuess = `${year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
        return { ...w, days: daysUntilNextOccurrence(isoGuess), isoGuess };
      })
      .sort((a, b) => a.days - b.days);
  }, [worldFiltered]);

  const soonest = friendUpcoming.slice(0, 3);

  const goToFriendProfile = useCallback(
    (friendId: string) => {
      navigation.navigate('FriendsTab', {
        screen: 'FriendProfile',
        params: { friendId },
      });
    },
    [navigation],
  );

  // Opens ContactProfileScreen for a nearby (not-yet-friend) user found
  // via NearbySuggestions. Passing the preview fields avoids a flash of
  // "not connected" while ContactProfileScreen re-fetches fresh state.
  const goToContactProfile = useCallback(
    (userId: string, preview?: { name?: string; username?: string; emoji?: string; avatarColor?: string; avatarUrl?: string }) => {
      navigation.navigate('ContactProfile', {
        userId,
        name: preview?.name,
        username: preview?.username,
        emoji: preview?.emoji,
        avatarColor: preview?.avatarColor,
        avatarUrl: preview?.avatarUrl,
      });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text style={styles.header}>Dates</Text>
        <Text style={styles.subheader}>Never miss a moment that matters</Text>

        {soonest.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <SectionHeader title="Coming up" subtitle="Your nearest important dates" />
            {soonest.map((item) => (
              <TouchableOpacity
                key={`${item.friendId}-${item.label}-${item.date}`}
                onPress={() => goToFriendProfile(item.friendId)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${item.friendName}, ${item.label}, ${formatShortDate(item.date)}`}
              >
                <Card style={styles.upcomingCard}>
                  {item.photoUri ? (
                    <Image source={{ uri: item.photoUri }} style={styles.upcomingPhoto} />
                  ) : (
                    <Avatar emoji={item.emoji} color={item.color} size={46} />
                  )}
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.upcomingName} numberOfLines={1}>
                      {item.friendName}
                      {item.age ? ` turns ${item.age}` : ''}
                    </Text>
                    <Text style={styles.upcomingLabel} numberOfLines={1}>
                      {item.label} · {formatShortDate(item.date)}
                    </Text>
                  </View>
                  <View style={[styles.badge, item.days === 0 && styles.badgeToday]}>
                    <Text style={[styles.badgeText, item.days === 0 && styles.badgeTextToday]}>
                      {item.days === 0 ? 'Today 🎉' : formatRelativeDay(item.days)}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <NearbySuggestions onOpenProfile={goToContactProfile} />

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'friends' && styles.tabBtnActive]}
            onPress={() => setTab('friends')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'friends' }}
          >
            <Text style={[styles.tabBtnText, tab === 'friends' && styles.tabBtnTextActive]}>
              Friends' Dates
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'world' && styles.tabBtnActive]}
            onPress={() => setTab('world')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'world' }}
          >
            <Text style={[styles.tabBtnText, tab === 'world' && styles.tabBtnTextActive]}>
              World Special Days
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'friends' ? (
          <View>
            {friendUpcoming.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🎉</Text>
                <Text style={styles.empty}>No important dates added yet. Add one from a friend's profile.</Text>
              </View>
            ) : (
              friendUpcoming.map((item) => (
                <TouchableOpacity
                  key={`${item.friendId}-${item.label}-${item.date}`}
                  onPress={() => goToFriendProfile(item.friendId)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <View style={styles.row}>
                    {item.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={styles.rowPhoto} />
                    ) : (
                      <Avatar emoji={item.emoji} color={item.color} size={40} />
                    )}
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.friendName}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {item.label} · {formatShortDate(item.date)}
                      </Text>
                    </View>
                    <Text style={[styles.rowDays, item.days === 0 && styles.rowDaysToday]}>
                      {item.days === 0 ? 'Today' : formatRelativeDay(item.days)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : (
          <View>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.textFaint} />
              <TextInput
                placeholder="Search special days"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                value={worldSearch}
                onChangeText={setWorldSearch}
                accessibilityLabel="Search special days"
                returnKeyType="search"
              />
              {worldSearch.length > 0 && (
                <TouchableOpacity onPress={() => setWorldSearch('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginBottom: spacing.sm }}
              contentContainerStyle={{ paddingVertical: spacing.xs }}
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

            {syncWarning && !isLoadingWorld && (
              <Text style={styles.warning}>{syncWarning}</Text>
            )}

            {isLoadingWorld ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : worldError ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.empty}>{worldError}</Text>
                <TouchableOpacity onPress={onRefresh} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : worldUpcoming.length === 0 ? (
              <Text style={styles.empty}>No world special days found.</Text>
            ) : (
              worldUpcoming.map((w) => (
                <View key={w.id} style={styles.row}>
                  <View style={styles.worldEmojiWrap}>
                    <Text style={{ fontSize: 22 }}>{w.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {w.name}
                    </Text>
                    <Text style={styles.rowSub}>
                      {MONTH_NAMES[w.month - 1]} {w.day}
                    </Text>
                  </View>
                  <Text style={[styles.rowDays, w.days === 0 && styles.rowDaysToday]}>
                    {w.days === 0 ? 'Today' : formatRelativeDay(w.days)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  header: { ...typography.h1, color: colors.text },
  subheader: { ...typography.body, color: colors.textFaint, marginTop: 4 },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  upcomingPhoto: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.cardAlt },
  upcomingName: { ...typography.bodyBold, color: colors.text },
  upcomingLabel: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  badge: {
    backgroundColor: colors.primary + '25',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeToday: { backgroundColor: colors.gold + '30' },
  badgeText: { ...typography.small, color: colors.primary, fontWeight: '700' },
  badgeTextToday: { color: colors.gold },
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
  rowPhoto: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt },
  rowTitle: { ...typography.bodyBold, color: colors.text },
  rowSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  rowDays: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  rowDaysToday: { color: colors.gold },
  worldEmojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    ...typography.body,
  },
  warning: {
    ...typography.caption,
    color: colors.gold,
    marginBottom: spacing.sm,
  },
  empty: {
    ...typography.body,
    color: colors.textFaint,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyEmoji: { fontSize: 32, marginBottom: spacing.sm },
  loaderWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  retryText: { ...typography.caption, color: colors.bg, fontWeight: '700' },
  nearbyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearbyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  nearbyToggleText: { ...typography.caption, color: colors.textDim, fontWeight: '600' },
  nearbyCard: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 72,
  },
  nearbyAvatarImage: { width: 52, height: 52, borderRadius: 26 },
  nearbyName: {
    ...typography.small,
    color: colors.text,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  nearbyDistance: {
    ...typography.small,
    color: colors.textFaint,
    marginTop: 1,
    textAlign: 'center',
  },
});

export default DatesScreen;

