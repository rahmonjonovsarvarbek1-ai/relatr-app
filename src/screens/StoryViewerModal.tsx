import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  StyleSheet,
  FlatList,
} from 'react-native';
import { X, Heart, MapPin, AtSign, Eye, ChevronUp } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import Avatar from '../components/Avatar';
import StoryMedia from './StoryMedia';
import StoryFrame, { useStoryFrameMetrics } from './StoryFrame';
import type { FriendStoryGroup, StoryRow, StoryMentionSticker } from '../types/storyTypes';
import type { StoryViewerEntry } from '../types/storyTypes';
import { supabase } from '../utils/supabase';

const IMAGE_DURATION_MS = 5000;
const MAX_VIDEO_DURATION_MS = 60000; // safety cap in case a video never fires onEnd

type Props = {
  group: FriendStoryGroup;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onToggleLike: (story: StoryRow) => void;
};

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const StoryViewerModal: React.FC<Props> = ({ group, onClose, onViewed, onToggleLike }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { frameW, frameH, insets } = useStoryFrameMetrics();

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mentions, setMentions] = useState<StoryMentionSticker[]>([]);
  const [viewers, setViewers] = useState<StoryViewerEntry[]>([]);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const elapsedRef = useRef(0); // ms already played in the current story, for resume-after-pause
  const startedAtRef = useRef(0);
  const current = group.stories[index];

  // -----------------------------------------------------------
  // Load who was tagged in the current story (composer's mention
  // stickers), so viewers see the same @chips the poster placed,
  // at the same relative position.
  // -----------------------------------------------------------
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    supabase
      .from('story_mentions')
      .select('id, friend_id, x, y, profiles:friend_id (name)')
      .eq('story_id', current.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMentions(
          (data as any[]).map((m) => ({
            id: m.id,
            friendId: m.friend_id,
            friendName: m.profiles?.name ?? 'Friend',
            x: m.x,
            y: m.y,
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  // -----------------------------------------------------------
  // Load the viewer list — only meaningful (and only fetched) for
  // stories the current user posted themselves.
  // -----------------------------------------------------------
  useEffect(() => {
    if (!current || !group.isMine) {
      setViewers([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('story_views')
      .select('id, viewer_id, viewed_at, profiles:viewer_id (name, emoji, color)')
      .eq('story_id', current.id)
      .order('viewed_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setViewers(
          (data as any[]).map((v) => ({
            id: v.id,
            friendId: v.viewer_id,
            friendName: v.profiles?.name ?? 'Someone',
            emoji: v.profiles?.emoji ?? null,
            color: v.profiles?.color ?? null,
            viewedAt: v.viewed_at,
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [current?.id, group.isMine]);

  const runTimer = (fromMs: number) => {
    if (!current) return;
    const duration = current.media_type === 'video' ? MAX_VIDEO_DURATION_MS : IMAGE_DURATION_MS;
    const remaining = Math.max(duration - fromMs, 0);
    const startValue = fromMs / duration;
    progress.setValue(startValue);
    startedAtRef.current = Date.now() - fromMs;

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished && current.media_type !== 'video') goNext();
    });
  };

  useEffect(() => {
    if (!current) return;
    onViewed(current.id);
    elapsedRef.current = 0;
    setPaused(false);
    setViewersSheetOpen(false);
    runTimer(0);
    return () => animRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  const pauseTimer = () => {
    animRef.current?.stop();
    elapsedRef.current = Date.now() - startedAtRef.current;
    setPaused(true);
  };

  const resumeTimer = () => {
    if (viewersSheetOpen) return;
    setPaused(false);
    runTimer(elapsedRef.current);
  };

  const goNext = () => {
    if (index < group.stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
  };

  const handleToggleLike = async (story: StoryRow) => {
    try {
      await onToggleLike(story);
    } catch {
      Alert.alert('Xatolik', 'Layk holatini yangilab bo\u2018lmadi. Qaytadan urinib ko\u2018ring.');
    }
  };

  const openViewers = () => {
    pauseTimer();
    setViewersSheetOpen(true);
  };

  const closeViewers = () => {
    setViewersSheetOpen(false);
    resumeTimer();
  };

  if (!current) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StoryFrame width={frameW} height={frameH}>
        <View style={styles.progressRow}>
          {group.stories.map((s: StoryRow, i: number) => (
            <View key={s.id} style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width:
                      i < index
                        ? '100%'
                        : i === index
                        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : '0%',
                  },
                ]}
              />
            </View>
          ))}
        </View>

        {/* Poster identity — who this story belongs to, shown on every
            frame of the group, Relatr-styled as a pill rather than the
            bare avatar-row look of other apps. */}
        <View style={styles.posterPill}>
          <Avatar emoji={group.emoji} color={group.color} size={30} />
          <View style={styles.posterTextCol}>
            <Text style={styles.posterName} numberOfLines={1}>
              {group.friendName}
            </Text>
            <Text style={styles.posterTime}>{timeAgo(current.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <X size={18} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Long-press anywhere on the media to pause; release to resume. */}
        <TouchableWithoutFeedback onPressIn={pauseTimer} onPressOut={resumeTimer}>
          <View style={StyleSheet.absoluteFill}>
            <StoryMedia
              uri={current.media_url}
              mediaType={current.media_type}
              width={frameW}
              height={frameH}
              onEnd={current.media_type === 'video' ? goNext : undefined}
              paused={paused}
              zoomEnabled
            />
          </View>
        </TouchableWithoutFeedback>

        {/* Location sticker, placed at the same relative spot the
            poster dropped it at in the composer. */}
        {current.location_label && (
          <View
            style={[
              styles.stickerPos,
              {
                left: (current.location_x ?? 0.5) * frameW - 80,
                top: (current.location_y ?? 0.22) * frameH,
              },
            ]}
          >
            <View style={styles.locationChip}>
              <MapPin size={13} color="#fff" strokeWidth={2.5} />
              <Text style={styles.locationChipText}>{current.location_label}</Text>
            </View>
          </View>
        )}

        {/* Mention chips */}
        {mentions.map((m) => (
          <View
            key={m.id}
            style={[styles.stickerPos, { left: m.x * frameW - 70, top: m.y * frameH }]}
          >
            <View style={styles.mentionChip}>
              <AtSign size={12} color={colors.primary} strokeWidth={2.5} />
              <Text style={styles.mentionChipText}>{m.friendName}</Text>
            </View>
          </View>
        ))}

        {/* Text stickers — font/color/background chosen in the composer */}
        {(current.text_stickers ?? []).map((t) => (
          <View
            key={t.id}
            style={[styles.stickerPos, { left: t.x * frameW - 90, top: t.y * frameH, width: 180 }]}
          >
            <View
              style={[
                t.bgMode === 'solid' && [
                  styles.textBgSolid,
                  { backgroundColor: t.color === '#000000' ? '#fff' : '#000' },
                ],
                t.bgMode === 'soft' && styles.textBgSoft,
              ]}
            >
              <Text
                style={{
                  fontFamily: t.fontFamily,
                  color: t.bgMode === 'solid' ? (t.color === '#000000' ? '#000' : '#fff') : t.color,
                  fontSize: 22,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {t.text}
              </Text>
            </View>
          </View>
        ))}

        {/* Legacy plain caption — kept for older stories that predate
            the sticker system and only ever set `caption`. */}
        {current.caption && (current.text_stickers ?? []).length === 0 ? (
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{current.caption}</Text>
          </View>
        ) : null}

        {/* Bottom bar: like (for others' stories) or viewer count (for own). */}
        {!group.isMine ? (
          <View style={styles.likeBar}>
            <TouchableOpacity style={styles.likeBtn} onPress={() => handleToggleLike(current)}>
              <Heart
                size={26}
                color={current.liked_by_me ? colors.danger ?? '#ff3b30' : '#fff'}
                fill={current.liked_by_me ? colors.danger ?? '#ff3b30' : 'transparent'}
                strokeWidth={2}
              />
              {!!current.like_count && <Text style={styles.likeCountText}>{current.like_count}</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.viewersBar} onPress={openViewers} activeOpacity={0.85}>
            <ChevronUp size={16} color="#fff" strokeWidth={2.5} />
            <Eye size={15} color="#fff" strokeWidth={2.5} />
            <Text style={styles.viewersCountText}>
              {current.viewer_count ?? 0} ko\u2018rdi
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={styles.tapZoneLeft} onPress={goPrev} />
          <TouchableOpacity style={styles.tapZoneRight} onPress={goNext} />
        </View>
      </StoryFrame>

      {/* Viewers bottom sheet — own stories only */}
      <Modal
        visible={viewersSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={closeViewers}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeViewers}>
          <View style={[styles.viewersSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Eye size={16} color={colors.text} strokeWidth={2.5} />
              <Text style={styles.sheetTitle}>
                {viewers.length} kishi ko\u2018rdi
              </Text>
            </View>
            <FlatList
              data={viewers}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ paddingVertical: spacing.sm }}
              ListEmptyComponent={
                <Text style={styles.sheetEmptyText}>Hozircha hech kim ko\u2018rmagan</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.viewerRow}>
                  <Avatar emoji={item.emoji ?? undefined} color={item.color ?? undefined} size={32} />
                  <Text style={styles.viewerRowName} numberOfLines={1}>
                    {item.friendName}
                  </Text>
                  <Text style={styles.viewerRowTime}>{timeAgo(item.viewedAt)}</Text>
                </View>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    progressRow: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    progressTrack: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.3)',
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: '#fff' },

    posterPill: {
      position: 'absolute',
      top: spacing.md + 10,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    posterTextCol: { flex: 1 },
    posterName: { color: '#fff', fontWeight: '700', fontSize: 13 },
    posterTime: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
    closeBtn: { padding: 6 },

    stickerPos: { position: 'absolute' },
    locationChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.45)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    locationChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    mentionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.92)',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: 999,
      alignSelf: 'flex-start',
    },
    mentionChipText: { fontWeight: '700', fontSize: 13, color: '#111' },
    textBgSolid: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    textBgSoft: {
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    captionWrap: {
      position: 'absolute',
      bottom: 90,
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    captionText: { color: '#fff', ...typography.body },

    likeBar: {
      position: 'absolute',
      bottom: 24,
      right: spacing.lg,
      alignItems: 'center',
    },
    likeBtn: { alignItems: 'center', gap: 2 },
    likeCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    viewersBar: {
      position: 'absolute',
      bottom: 14,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
    },
    viewersCountText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    tapZones: { ...StyleSheet.absoluteFill, flexDirection: 'row', top: 60 },
    tapZoneLeft: { flex: 1 },
    tapZoneRight: { flex: 2 },

    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    viewersSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '65%',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textFaint,
      alignSelf: 'center',
      marginBottom: spacing.sm,
      opacity: 0.4,
    },
    sheetHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingBottom: spacing.sm,
    },
    sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
    sheetEmptyText: { color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.lg },
    viewerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    viewerRowName: { flex: 1, color: colors.text, fontWeight: '600' },
    viewerRowTime: { color: colors.textFaint, fontSize: 12 },
  });

export default StoryViewerModal;