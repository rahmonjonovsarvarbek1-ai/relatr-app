import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import { X, Heart, MapPin, AtSign } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import Avatar from '../components/Avatar';
import StoryMedia from './StoryMedia';
import type { FriendStoryGroup, StoryRow, StoryMentionSticker } from '../types/storyTypes';
import { supabase } from '../utils/supabase';

const IMAGE_DURATION_MS = 5000;
const MAX_VIDEO_DURATION_MS = 60000; // safety cap in case a video never fires onEnd

type Props = {
  group: FriendStoryGroup;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onToggleLike: (story: StoryRow) => void;
  screenW: number;
  screenH: number;
};

const StoryViewerModal: React.FC<Props> = ({
  group,
  onClose,
  onViewed,
  onToggleLike,
  screenW,
  screenH,
}) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mentions, setMentions] = useState<StoryMentionSticker[]>([]);
  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const elapsedRef = useRef(0); // ms already played in the current story, for resume-after-pause
  const startedAtRef = useRef(0);
  const current = group.stories[index];

  // -----------------------------------------------------------
  // Load who was tagged in the current story (own composer's
  // mention stickers), so viewers see the same @chips the poster
  // placed, at the same relative position.
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
      Alert.alert('Error', 'Could not update like. Please try again.');
    }
  };

  if (!current) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewerContainer, { width: screenW, height: screenH }]}>
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

        <View style={styles.viewerHeader}>
          <Avatar emoji={group.emoji} color={group.color} size={34} />
          <Text style={styles.viewerName}>{group.friendName}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Long-press anywhere on the media to pause; release to resume.
            This replaces Instagram's identical gesture with the same
            underlying idea, since it's the expected mental model for
            "hold to pause a story" — but layered on top of Relatr's
            own tap-zone navigation below rather than replacing it. */}
        <TouchableWithoutFeedback onPressIn={pauseTimer} onPressOut={resumeTimer}>
          <View style={StyleSheet.absoluteFillObject}>
            <StoryMedia
              uri={current.media_url}
              mediaType={current.media_type}
              width={screenW}
              height={screenH}
              onEnd={current.media_type === 'video' ? goNext : undefined}
              paused={paused}
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
                left: (current.location_x ?? 0.5) * screenW - 80,
                top: (current.location_y ?? 0.18) * screenH,
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
            style={[
              styles.stickerPos,
              { left: m.x * screenW - 70, top: m.y * screenH },
            ]}
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
            style={[
              styles.stickerPos,
              { left: t.x * screenW - 90, top: t.y * screenH, width: 180 },
            ]}
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

        {!group.isMine && (
          <View style={styles.likeBar}>
            <TouchableOpacity style={styles.likeBtn} onPress={() => handleToggleLike(current)}>
              <Heart
                size={26}
                color={current.liked_by_me ? colors.danger ?? '#ff3b30' : '#fff'}
                fill={current.liked_by_me ? colors.danger ?? '#ff3b30' : 'transparent'}
                strokeWidth={2}
              />
              {!!current.like_count && (
                <Text style={styles.likeCountText}>{current.like_count}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity style={styles.tapZoneLeft} onPress={goPrev} />
          <TouchableOpacity style={styles.tapZoneRight} onPress={goNext} />
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    viewerContainer: { flex: 1, backgroundColor: '#000' },
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
    viewerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    viewerName: { color: '#fff', fontWeight: '700', flex: 1 },
    closeBtn: { padding: spacing.sm },
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
      bottom: 100,
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    captionText: { color: '#fff', ...typography.body },
    likeBar: {
      position: 'absolute',
      bottom: 34,
      right: spacing.lg,
      alignItems: 'center',
    },
    likeBtn: { alignItems: 'center', gap: 2 },
    likeCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', top: 60 },
    tapZoneLeft: { flex: 1 },
    tapZoneRight: { flex: 2 },
  });

export default StoryViewerModal;