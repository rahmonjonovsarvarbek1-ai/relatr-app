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
} from 'react-native';
import * as Location from 'expo-location';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';
import Avatar from '../components/Avatar';
import { Card, SectionHeader } from '../components/Card';
import SpecialDayThumb from '../components/SpecialDayThumb';
import {
  daysUntilNextOccurrence,
  formatRelativeDay,
  formatShortDate,
  getAgeTurning,
  MONTH_NAMES,
} from '../utils/dateUtils';
import {
  buildUpcoming,
  dedupeSpecialDays,
  startOfToday,
  toDetailParams,
} from '../utils/specialDays';
import type { UpcomingSpecialDay } from '../utils/specialDays';
import { supabase } from '../utils/supabase';
import { worldSpecialDayFromRow } from '../utils/mappers';
import { FriendshipRow, WorldHolidayRow, WorldSpecialDay } from '../types';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabKey = 'friends' | 'world';

// How many special days the "World Special Days" tab previews before the
// user opens the full-screen list.
const WORLD_PREVIEW_COUNT = 3;
const REALTIME_DEBOUNCE_MS = 600; // a sync writes many rows; refetch once, not per row
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // don't force a server-side sync on every pull

interface FriendUpcomingItem {
  key: string;
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
// current user. Excludes self and anyone already connected either way.
// Collapsible via a show/hide toggle.
//
// Our own coordinates are written to `profiles` before querying, so that
// others can find us too. They are deliberately rounded to ~1 km: other
// users can read these columns, so exact positions must not be stored.
// ---------------------------------------------------------------------

interface NearbyProfile {
  id: string;
  name: string;
  username: string;
  emoji: string;
  avatarColor?: string;
  avatarUrl?: string;
  distanceKm: number;
}

const EARTH_RADIUS_KM = 6371;
const NEARBY_RADIUS_KM = 50;
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** ~1.1 km precision (2 decimals) — enough for "N km away", not enough to find a doorstep. */
const roundCoord = (n: number): number => Math.round(n * 100) / 100;

// Haversine distance in km between two lat/lng points.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

type FriendshipPair = Pick<FriendshipRow, 'user_id' | 'friend_id' | 'status'>;

interface ProfileCandidateRow {
  id: string;
  name: string;
  username: string;
  emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  latitude: number | null;
  longitude: number | null;
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
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // NOTE: must not depend on theme colours — a theme switch would otherwise
  // re-request location and rewrite the profile row.
  const load = useCallback(async () => {
    if (!meId) return;
    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    try {
      // 1) Location permission (no prompt if it was already granted).
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        if (isMountedRef.current) {
          setPermissionDenied(true);
          setLoading(false);
        }
        return;
      }

      // 2) Current position: a recent cached fix is instant, otherwise ask the GPS.
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));

      if (!isMountedRef.current) return;

      const myLat = roundCoord(pos.coords.latitude);
      const myLng = roundCoord(pos.coords.longitude);

      // 3) Publish our (rounded) position so others can find us as well.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ latitude: myLat, longitude: myLng })
        .eq('id', meId);
      if (updateError) console.error('profiles location update error:', updateError);

      // 4) Nearby profiles + friendship state.
      const box = boundingBox(myLat, myLng, NEARBY_RADIUS_KM);

      const [{ data: candidates, error: candError }, { data: friendRows, error: friendError }] =
        await Promise.all([
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
            .select('user_id, friend_id, status')
            .or(`user_id.eq.${meId},friend_id.eq.${meId}`),
        ]);

      if (!isMountedRef.current) return;

      if (candError || friendError) {
        console.error('nearby load error:', candError ?? friendError);
        setError('Could not load nearby people.');
        setNearby([]);
        setLoading(false);
        return;
      }

      // Anyone already connected or with a pending request either way
      // shouldn't clutter "nearby suggestions" — that's what the
      // Contacts flow on ProfileScreen is for.
      const excluded = new Set<string>();
      ((friendRows as FriendshipPair[] | null) ?? []).forEach((f) => {
        excluded.add(f.user_id === meId ? f.friend_id : f.user_id);
      });

      const withDistance: NearbyProfile[] = ((candidates as ProfileCandidateRow[] | null) ?? [])
        .filter((c) => c.latitude != null && c.longitude != null && !excluded.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          username: c.username,
          emoji: c.emoji ?? '🙂',
          avatarColor: c.avatar_color ?? undefined,
          avatarUrl: c.avatar_url ?? undefined,
          distanceKm: haversineKm(myLat, myLng, c.latitude as number, c.longitude as number),
        }))
        .filter((c) => c.distanceKm <= NEARBY_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 15);

      setNearby(withDistance);
    } catch (e) {
      if (!isMountedRef.current) return;
      console.error('NearbySuggestions load error:', e);
      setError('Could not load nearby people.');
      setNearby([]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [meId]);

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
          <Ionicons name={visible ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      {visible && (
        <>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />
          ) : permissionDenied ? (
            <View>
              <Text style={styles.empty}>
                Yaqin atrofdagilarni ko'rish uchun joylashuvga ruxsat bering.
              </Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn} accessibilityRole="button">
                <Text style={styles.retryText}>Qayta urinish</Text>
              </TouchableOpacity>
            </View>
          ) : error ? (
            <View>
              <Text style={styles.empty}>{error}</Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn} accessibilityRole="button">
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
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
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${p.distanceKm < 1 ? 'less than 1' : Math.round(p.distanceKm)} km away`}
                >
                  {p.avatarUrl ? (
                    <Image source={{ uri: p.avatarUrl }} style={styles.nearbyAvatarImage} />
                  ) : (
                    <Avatar emoji={p.emoji} color={p.avatarColor ?? colors.primary} size={52} />
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
  // Re-evaluated on focus so countdowns stay correct if the app stays open past midnight.
  const [todayMs, setTodayMs] = useState(() => startOfToday().getTime());

  const isMountedRef = useRef(true);
  const lastForcedSyncRef = useRef(0);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTodayMs(startOfToday().getTime());
    }, []),
  );

  const fetchWorldHolidays = useCallback(async () => {
    const { data, error } = await supabase.from('world_holidays').select('*');
    if (!isMountedRef.current) return;

    if (error) {
      console.error('load world_holidays error:', error);
      setWorldError('Failed to load special days. Please try again.');
      return;
    }
    setWorldError(null);
    setWorldSpecialDays(
      ((data as WorldHolidayRow[] | null) ?? []).map((row) => worldSpecialDayFromRow(row)),
    );
  }, []);

  // Regular background sync. No `year`/`force`: the server applies its own
  // cooldown, so opening this screen repeatedly doesn't hammer the Nager API.
  const syncFromNager = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-world-holidays', { body: {} });
      if (!isMountedRef.current) return;
      if (error) {
        console.error('sync-world-holidays returned error:', error.message);
        setSyncWarning('Some special days may be out of date.');
        return;
      }
      setSyncWarning(null);
      if (!(data as { skipped?: boolean } | null)?.skipped) await fetchWorldHolidays();
    } catch (e) {
      if (!isMountedRef.current) return;
      console.error('sync-world-holidays invoke error:', e);
      setSyncWarning('Some special days may be out of date.');
    }
  }, [fetchWorldHolidays]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      setIsLoadingWorld(true);
      await fetchWorldHolidays();
      if (isMountedRef.current) setIsLoadingWorld(false); // the UI is usable now...
      await syncFromNager(); // ...the sync continues in the background
    })();

    const channel = supabase
      .channel('world-holidays')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'world_holidays' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fetchWorldHolidays, REALTIME_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchWorldHolidays, syncFromNager]);

  const retryWorld = useCallback(async () => {
    setIsLoadingWorld(true);
    await fetchWorldHolidays();
    if (isMountedRef.current) setIsLoadingWorld(false);
  }, [fetchWorldHolidays]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    if (Date.now() - lastForcedSyncRef.current > SYNC_COOLDOWN_MS) {
      try {
        const { error } = await supabase.functions.invoke('sync-world-holidays', {
          body: { force: true },
        });
        if (error) console.error('manual sync error:', error.message);
        else lastForcedSyncRef.current = Date.now();
      } catch (e) {
        console.error('manual sync error:', e);
      }
    }
    await fetchWorldHolidays();
    if (isMountedRef.current) {
      setTodayMs(startOfToday().getTime());
      setIsRefreshing(false);
    }
  }, [fetchWorldHolidays]);

  const friendUpcoming = useMemo<FriendUpcomingItem[]>(() => {
    const rows: FriendUpcomingItem[] = [];
    friends.forEach((f) => {
      f.importantDates.forEach((d) => {
        rows.push({
          key: `${f.id}-${d.id}`,
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
    // todayMs: recompute countdowns after midnight
  }, [friends, todayMs]);

  // The full list (search, country filter, sections) lives in the
  // WorldSpecialDays screen; here we only need the nearest few.
  const worldPreview = useMemo<UpcomingSpecialDay[]>(
    () =>
      buildUpcoming(dedupeSpecialDays(worldSpecialDays), new Date(todayMs)).slice(
        0,
        WORLD_PREVIEW_COUNT,
      ),
    [worldSpecialDays, todayMs],
  );

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

  const openWorldScreen = useCallback(() => {
    navigation.navigate('WorldSpecialDays');
  }, [navigation]);

  const openSpecialDay = useCallback(
    (d: UpcomingSpecialDay) => {
      navigation.navigate('SpecialDayDetail', toDetailParams(d));
    },
    [navigation],
  );

  // Opens ContactProfileScreen for a nearby (not-yet-friend) user found
  // via NearbySuggestions. Passing the preview fields avoids a flash of
  // "not connected" while ContactProfileScreen re-fetches fresh state.
  const goToContactProfile = useCallback(
    (
      userId: string,
      preview?: {
        name?: string;
        username?: string;
        emoji?: string;
        avatarColor?: string;
        avatarUrl?: string;
      },
    ) => {
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
                key={item.key}
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
                  key={item.key}
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
            {syncWarning && !isLoadingWorld && <Text style={styles.warning}>{syncWarning}</Text>}

            {isLoadingWorld ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : worldError && worldSpecialDays.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.empty}>{worldError}</Text>
                <TouchableOpacity onPress={retryWorld} style={styles.retryBtn} accessibilityRole="button">
                  <Text style={styles.retryText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : worldPreview.length === 0 ? (
              <Text style={styles.empty}>No world special days found.</Text>
            ) : (
              <>
                {worldPreview.map((w) => (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.row}
                    onPress={() => openSpecialDay(w)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${w.name}, ${MONTH_NAMES[w.month - 1]} ${w.day}`}
                  >
                    <SpecialDayThumb
                      id={String(w.id)}
                      name={w.name}
                      icon={w.icon}
                      category={w.category}
                      size={40}
                    />
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
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={styles.seeAllBtn}
                  onPress={openWorldScreen}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="See all world special days"
                >
                  <Text style={styles.retryText}>See all special days</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.bg} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
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
      alignSelf: 'center',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
    },
    retryText: { ...typography.caption, color: colors.bg, fontWeight: '700' },
    seeAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      alignSelf: 'center',
      marginTop: spacing.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
    },
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

