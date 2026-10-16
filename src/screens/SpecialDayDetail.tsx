import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { formatRelativeDay, MONTH_NAMES } from '../utils/dateUtils';
import SpecialDayIcon from '../components/SpecialDayIcon';
import { supabase } from '../utils/supabase';
import { categoryLabel, daysUntilDate } from '../utils/specialDays';
import type { SpecialDayParams } from '../utils/specialDays';
import type { SpecialDayDetails } from '../types';

const HERO_HEIGHT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_WITH_CONTENT_MS = 30 * DAY_MS;
const TTL_EMPTY_MS = 3 * DAY_MS; // retry sooner if nothing was found last time
const COLLAPSED_CHARS = 280;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const hasContent = (d: SpecialDayDetails) => !!(d.summary || d.description || d.image_urls?.length);
const isStale = (d: SpecialDayDetails) =>
  Date.now() - new Date(d.fetched_at).getTime() > (hasContent(d) ? TTL_WITH_CONTENT_MS : TTL_EMPTY_MS);

/** Returns the value only if it is a real YYYY-MM-DD date, otherwise null (e.g. "2026-NaN-NaN"). */
const validIsoDate = (value?: string | null): string | null =>
  value && ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;

/** Logs the real reason an Edge Function call failed (status + response body). */
const logFunctionError = async (name: string, e: unknown) => {
  if (e instanceof FunctionsHttpError) {
    let body = '';
    try {
      body = await e.context.text();
    } catch {
      /* body not readable */
    }
    console.error(`[${name}] HTTP ${e.context.status}:`, body);
  } else if (e instanceof FunctionsRelayError) {
    console.error(`[${name}] relay error:`, e.message);
  } else if (e instanceof FunctionsFetchError) {
    console.error(`[${name}] network error:`, e.message);
  } else {
    console.error(`[${name}] unexpected error:`, e);
  }
};

const SpecialDayDetailScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const p = route.params as SpecialDayParams;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;

  const [details, setDetails] = useState<SpecialDayDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [pageIndex, setPageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);

  const pagerRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ---- Safe date handling -------------------------------------------------
  // Params may arrive with null month/day or a broken isoDate ("2026-NaN-NaN").
  // Fall back to whatever is valid and hide the pieces we can't show.
  const isoDate = useMemo(() => validIsoDate(p.isoDate), [p.isoDate]);
  const month = p.month ?? (isoDate ? Number(isoDate.slice(5, 7)) : null);
  const day = p.day ?? (isoDate ? Number(isoDate.slice(8, 10)) : null);
  const dateLabel = month && day && MONTH_NAMES[month - 1] ? `${MONTH_NAMES[month - 1]} ${day}` : null;

  const daysLeft = useMemo(() => (isoDate ? daysUntilDate(isoDate) : null), [isoDate]);
  const countdown =
    daysLeft === null
      ? null
      : daysLeft === 0
        ? 'Today'
        : daysLeft === 1
          ? 'Tomorrow'
          : formatRelativeDay(daysLeft);

  // ---- Data loading -------------------------------------------------------
  // 1) show cached details immediately, 2) refresh through the edge function
  //    when nothing is cached yet or the cache is stale.
  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);

      const { data: cached, error: cacheError } = await supabase
        .from('world_special_day_details')
        .select('*')
        .eq('holiday_id', p.dayId)
        .maybeSingle();
      if (!isMountedRef.current) return;
      if (cacheError) console.error('read special day cache error:', cacheError);

      const cachedRow = (cached as SpecialDayDetails | null) ?? null;
      if (cachedRow) setDetails(cachedRow);

      if (cachedRow && !force && !isStale(cachedRow)) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke('fetch-special-day-details', {
        body: { holidayId: p.dayId, name: p.name, force },
        });
        if (!isMountedRef.current) return;
        if (fnError) throw fnError;
        const fresh = (data as { details?: SpecialDayDetails } | null)?.details;
        if (fresh) setDetails(fresh);
        else if (!cachedRow) setError('No details came back. Try again in a moment.');
      } catch (e) {
        await logFunctionError('fetch-special-day-details', e);
        if (isMountedRef.current && !cachedRow) {
          setError('Could not load details. Check your connection and try again.');
        }
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
      },
    [p.dayId, p.name],
     );

     useEffect(() => {
     load(false);
     }, [load]);

  // ---- Reminder -----------------------------------------------------------
  useEffect(() => {
    if (!meId) return;
    supabase
      .from('special_day_reminders')
      .select('id')
      .eq('user_id', meId)
      .eq('holiday_id', p.dayId)
      .maybeSingle()
      .then(({ data }) => {
        if (isMountedRef.current) setReminderOn(!!data);
      });
  }, [meId, p.dayId]);

  const toggleReminder = useCallback(async () => {
    if (!meId || reminderBusy) return;
    const had = reminderOn;
    setReminderBusy(true);
    setReminderOn(!had);
    const { error: err } = had
      ? await supabase.from('special_day_reminders').delete().eq('holiday_id', p.dayId).eq('user_id', meId)
      : await supabase
          .from('special_day_reminders')
          .insert({ holiday_id: p.dayId, user_id: meId, remind_days_before: 1 });
    if (!isMountedRef.current) return;
    if (err) {
      console.error('toggle reminder error:', err);
      setReminderOn(had);
    }
    setReminderBusy(false);
  }, [meId, reminderBusy, reminderOn, p.dayId]);

  // ---- Images -------------------------------------------------------------
  const images = useMemo(
    () => (details?.image_urls ?? []).filter((u) => !failedImages.has(u)),
    [details, failedImages],
  );

  const markFailed = useCallback((uri: string) => {
    setFailedImages((prev) => new Set(prev).add(uri));
  }, []);

  const goToImage = (i: number) => {
    pagerRef.current?.scrollTo({ x: i * width, animated: true });
    setPageIndex(i);
  };

  const text = details?.description || details?.summary || '';
  const isLong = text.length > COLLAPSED_CHARS;
  const shownText = expanded || !isLong ? text : `${text.slice(0, COLLAPSED_CHARS).trimEnd()}…`;

  return (
    <View style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Hero: image pager, or an icon block until images arrive */}
        <View style={{ height: HERO_HEIGHT }}>
          {images.length > 0 ? (
            <>
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPageIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              >
                {images.map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={{ width, height: HERO_HEIGHT, backgroundColor: colors.cardAlt }}
                    resizeMode="cover"
                    onError={() => markFailed(uri)}
                    accessibilityLabel={`${p.name} photo`}
                  />
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View style={styles.dots} pointerEvents="none">
                  {images.map((uri, i) => (
                    <View key={uri} style={[styles.dot, i === pageIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.heroFallback}>
              <SpecialDayIcon icon={p.icon} category={p.category} size={120} />
              {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}
            </View>
          )}

          <View style={[styles.overlayRow, { top: insets.top + spacing.sm }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.roundBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleReminder}
              style={styles.roundBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={reminderOn ? 'Turn off reminder' : 'Remind me'}
            >
              <Ionicons
                name={reminderOn ? 'notifications' : 'notifications-outline'}
                size={21}
                color={reminderOn ? colors.gold : '#fff'}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.name}>{p.name}</Text>
          {!!p.localName && <Text style={styles.localName}>{p.localName}</Text>}

          <View style={styles.metaRow}>
            {dateLabel && (
              <View style={styles.metaPill}>
                <Ionicons name="calendar-outline" size={14} color={colors.textDim} />
                <Text style={styles.metaText}>{dateLabel}</Text>
              </View>
            )}
            <View style={styles.metaPill}>
              <Ionicons name="globe-outline" size={14} color={colors.textDim} />
              <Text style={styles.metaText}>{p.countryLabel}</Text>
            </View>
            <View style={styles.metaPill}>
              <Ionicons name="pricetag-outline" size={14} color={colors.textDim} />
              <Text style={styles.metaText}>{categoryLabel(p.category)}</Text>
            </View>
            {countdown && (
              <View style={[styles.metaPill, styles.metaPillAccent]}>
                <Text style={[styles.metaText, styles.metaTextAccent]}>{countdown}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.remindBtn, reminderOn && styles.remindBtnOn]}
            onPress={toggleReminder}
            activeOpacity={0.85}
            disabled={reminderBusy}
            accessibilityRole="button"
          >
            <Ionicons
              name={reminderOn ? 'notifications' : 'notifications-outline'}
              size={18}
              color={reminderOn ? colors.primary : colors.bg}
            />
            <Text style={[styles.remindText, reminderOn && styles.remindTextOn]}>
              {reminderOn ? 'Reminder on — 1 day before' : 'Remind me 1 day before'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>About</Text>

          {error ? (
            <View>
              <Text style={styles.muted}>{error}</Text>
              <TouchableOpacity onPress={() => load(true)} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : text ? (
            <>
              <Text style={styles.paragraph}>{shownText}</Text>
              {isLong && (
                <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                  <Text style={styles.link}>{expanded ? 'Show less' : 'Read more'}</Text>
                </TouchableOpacity>
              )}
              {details?.source_url && (
                <TouchableOpacity
                  style={styles.sourceRow}
                  onPress={() => Linking.openURL(details.source_url as string)}
                  accessibilityRole="link"
                >
                  <Ionicons name="open-outline" size={14} color={colors.textDim} />
                  <Text style={styles.sourceText}>Source: {details.source_name ?? 'Wikipedia'}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : loading ? (
            <Text style={styles.muted}>Looking up details about this day…</Text>
          ) : (
            <View>
              <Text style={styles.muted}>We couldn't find a write-up for this day yet.</Text>
              <TouchableOpacity onPress={() => load(true)} style={styles.retryBtn}>
                <Text style={styles.retryText}>Search again</Text>
              </TouchableOpacity>
            </View>
          )}

          {images.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {images.map((uri, i) => (
                  <TouchableOpacity
                    key={uri}
                    onPress={() => goToImage(i)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Show photo ${i + 1}`}
                  >
                    <Image
                      source={{ uri }}
                      style={[styles.thumb, i === pageIndex && styles.thumbActive]}
                      onError={() => markFailed(uri)}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    heroFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '18',
    },
    overlayRow: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    roundBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dots: {
      position: 'absolute',
      bottom: spacing.md,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
    dotActive: { width: 18, backgroundColor: '#fff' },

    body: { padding: spacing.lg },
    name: { ...typography.h1, color: colors.text },
    localName: { ...typography.body, color: colors.textFaint, marginTop: 2 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.cardAlt,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    metaPillAccent: { backgroundColor: colors.primary + '25' },
    metaText: { ...typography.caption, color: colors.textDim, fontWeight: '600' },
    metaTextAccent: { color: colors.primary, fontWeight: '700' },

    remindBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    remindBtnOn: { backgroundColor: 'transparent' },
    remindText: { ...typography.bodyBold, color: colors.bg },
    remindTextOn: { color: colors.primary },

    sectionTitle: {
      ...typography.bodyBold,
      color: colors.text,
      fontSize: 18,
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    paragraph: { ...typography.body, color: colors.text, lineHeight: 24 },
    muted: { ...typography.body, color: colors.textFaint },
    link: { ...typography.caption, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
    sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
    sourceText: { ...typography.caption, color: colors.textDim },

    thumb: {
      width: 120,
      height: 84,
      borderRadius: radius.md,
      marginRight: spacing.sm,
      backgroundColor: colors.cardAlt,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    thumbActive: { borderColor: colors.primary },

    retryBtn: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
    },
    retryText: { ...typography.caption, color: colors.bg, fontWeight: '700' },
  });

export default SpecialDayDetailScreen;