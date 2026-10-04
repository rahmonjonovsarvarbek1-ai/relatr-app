import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Animated,
  TouchableOpacity,
  Alert,
  StyleSheet,
  FlatList,
  PanResponder,
  Linking,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import {
  X,
  Heart,
  MapPin,
  AtSign,
  Eye,
  ChevronUp,
  HelpCircle,
  Music as MusicIcon,
  Link2,
  Send,
  Users2,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import Avatar from '../components/Avatar';
import StoryMedia from './StoryMedia';
import { useStoryFrameMetrics } from './StoryFrame';
import type {
  FriendStoryGroup,
  StoryRow,
  StoryMentionSticker,
  StoryViewerEntry,
  StoryTextSticker,
} from '../types/storyTypes';
import { supabase } from '../utils/supabase';

// ----------------- Stiker tiplari -----------------
type StickerTransform = {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

type StoryPollSticker = StickerTransform & {
  question: string;
  optionA: string;
  optionB: string;
};

type StoryQuestionSticker = StickerTransform & {
  prompt: string;
};

type StoryMusicSticker = StickerTransform & {
  title: string;
  artist: string;
};

type StoryLinkSticker = StickerTransform & {
  url: string;
  label: string;
};

type StoryCountdownSticker = StickerTransform & {
  title: string;
  endsAt: string;
};

type StoryExtraStickers = {
  poll?: StoryPollSticker[];
  question?: StoryQuestionSticker[];
  music?: StoryMusicSticker[];
  link?: StoryLinkSticker[];
  countdown?: StoryCountdownSticker[];
};

const DEFAULT_IMAGE_DURATION_MS = 5000;
const MAX_VIDEO_DURATION_MS = 60000; // video onEnd bermasa xavfsizlik chegarasi
const FRIENDS_GREEN = '#22c55e';

type Props = {
  group: FriendStoryGroup;
  onClose: () => void;
  onViewed: (storyId: string) => void;
  onToggleLike: (story: StoryRow) => void | Promise<void>;
};

type PollRes = { a: number; b: number; mine: 'A' | 'B' | null };
type Answer = { id: string; name: string; text: string };

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'hozir';
  if (mins < 60) return `${mins} daq`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat`;
  return `${Math.floor(hours / 24)} kun`;
}

function formatRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return 'Tugadi';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d} kun ${h} soat`;
  if (h > 0) return `${h} soat ${m} daq`;
  if (m > 0) return `${m} daq ${s} soniya`;
  return `${s} soniya`;
}

const CountdownCard: React.FC<{ title: string; endsAt: string; styles: any }> = ({ title, endsAt, styles }) => {
  const [remaining, setRemaining] = useState(() => formatRemaining(endsAt));
  useEffect(() => {
    setRemaining(formatRemaining(endsAt));
    const t = setInterval(() => setRemaining(formatRemaining(endsAt)), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <View style={styles.countdownCard}>
      <Text style={styles.countdownTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.countdownValue}>{remaining}</Text>
    </View>
  );
};

/** Markaz nuqtasi bo'yicha joylashtiruvchi (composer bilan bir xil) */
const Placed: React.FC<{
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  frameW: number;
  frameH: number;
  interactive?: boolean;
  children: React.ReactNode;
}> = ({ x, y, scale = 1, rotation = 0, frameW, frameH, interactive, children }) => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      pointerEvents={interactive ? 'auto' : 'none'}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        maxWidth: frameW * 0.92,
        opacity: size ? 1 : 0,
        marginLeft: size ? -size.w / 2 : 0,
        marginTop: size ? -size.h / 2 : 0,
        transform: [{ translateX: x * frameW }, { translateY: y * frameH }, { scale }, { rotate: `${rotation}deg` }],
      }}
    >
      {children}
    </View>
  );
};

const StoryViewerModal: React.FC<Props> = ({ group, onClose, onViewed, onToggleLike }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { frameW, frameH, insets } = useStoryFrameMetrics();

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mentions, setMentions] = useState<StoryMentionSticker[]>([]);
  const [viewers, setViewers] = useState<StoryViewerEntry[]>([]);
  const [viewersSheetOpen, setViewersSheetOpen] = useState(false);
  const [pollRes, setPollRes] = useState<Record<string, PollRes>>({});
  const [qSheet, setQSheet] = useState<StoryQuestionSticker | null>(null);
  const [qText, setQText] = useState('');
  const [qSending, setQSending] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const elapsedRef = useRef(0);
  const startedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const blockedRef = useRef(false); // varaq/oyna ochiq bo'lsa timer davom etmaydi
  const current = group.stories[index];

  const extra = (current?.extra_stickers ?? null) as unknown as StoryExtraStickers | null;
  const centered = !!extra; // yangi composer formati (markaz bo'yicha)
  const likeColor: string = (colors as any).danger ?? '#ff3b30';

  blockedRef.current = viewersSheetOpen || !!qSheet;

  // ----------------- Ma'lumot yuklash -----------------
  useEffect(() => {
    setMentions([]);
    if (!current) return;
    let cancelled = false;
    supabase
      .from('story_mentions')
      .select('id, friend_id, x, y, profiles:friend_id (name)')
      .eq('story_id', current.id)
      .then(({ data }) => {
        if (cancelled) return;
        setMentions(
          ((data as any[]) ?? []).map((m) => ({
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

  useEffect(() => {
    setViewers([]);
    if (!current || !group.isMine) return;
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

  // So'rovnoma natijalari
  useEffect(() => {
    setPollRes({});
    if (!current || !extra?.poll?.length) return;
    let cancelled = false;
    (async () => {
      const [{ data: rows }, { data: u }] = await Promise.all([
        supabase.rpc('story_poll_results', { p_story_id: current.id }),
        supabase.auth.getUser(),
      ]);
      const uid = u?.user?.id;
      let mine: any[] = [];
      if (uid) {
        const { data } = await supabase
          .from('story_poll_votes')
          .select('poll_id, choice')
          .eq('story_id', current.id)
          .eq('voter_id', uid);
        mine = data ?? [];
      }
      if (cancelled) return;
      const map: Record<string, PollRes> = {};
      const slot = (id: string) => (map[id] ??= { a: 0, b: 0, mine: null });
      ((rows as any[]) ?? []).forEach((r) => {
        const m = slot(r.poll_id);
        if (r.choice === 'A') m.a = Number(r.votes);
        else m.b = Number(r.votes);
      });
      mine.forEach((r) => {
        slot(r.poll_id).mine = r.choice;
      });
      setPollRes(map);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // ----------------- Timer -----------------
  const runTimer = (fromMs: number) => {
    if (!current) return;
    const duration =
      current.media_type === 'video'
        ? MAX_VIDEO_DURATION_MS
        : current.duration_sec
        ? current.duration_sec * 1000
        : DEFAULT_IMAGE_DURATION_MS;
    const safeDuration = duration > 0 ? duration : DEFAULT_IMAGE_DURATION_MS;
    const remaining = Math.max(safeDuration - fromMs, 0);
    progress.setValue(Math.min(fromMs / safeDuration, 1));
    startedAtRef.current = Date.now() - fromMs;

    const anim = Animated.timing(progress, { toValue: 1, duration: remaining, useNativeDriver: false });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished && current.media_type !== 'video') goNext();
    });
  };

  useEffect(() => {
    if (!current) return;
    onViewed(current.id);
    elapsedRef.current = 0;
    pausedRef.current = false;
    setPaused(false);
    setViewersSheetOpen(false);
    setQSheet(null);
    runTimer(0);
    return () => animRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

  const pauseTimer = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    animRef.current?.stop();
    elapsedRef.current = Date.now() - startedAtRef.current;
    setPaused(true);
  };

  const resumeTimer = () => {
    if (!pausedRef.current || blockedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    runTimer(elapsedRef.current);
  };

  const goNext = () => {
    if (index < group.stories.length - 1) setIndex((i) => i + 1);
    else onClose();
  };
  const goPrev = () => {
    if (index > 0) setIndex((i) => i - 1);
    else {
      // birinchi storyda "orqaga" — qaytadan boshlash
      elapsedRef.current = 0;
      pausedRef.current = false;
      setPaused(false);
      animRef.current?.stop();
      runTimer(0);
    }
  };

  const openViewers = () => {
    pauseTimer();
    blockedRef.current = true;
    setViewersSheetOpen(true);
  };
  const closeViewers = () => {
    blockedRef.current = !!qSheet;
    setViewersSheetOpen(false);
    resumeTimer();
  };

  const handleToggleLike = async (story: StoryRow) => {
    try {
      await onToggleLike(story);
    } catch {
      Alert.alert('Error', "like is not toggled. Please try again later.");
    }
  };

  // ----------------- Savol stikeri -----------------
  const openQuestion = async (q: StoryQuestionSticker) => {
    pauseTimer();
    blockedRef.current = true;
    setQText('');
    setAnswers([]);
    setQSheet(q);
    if (group.isMine && current) {
      try {
        const { data } = await supabase
          .from('story_question_answers')
          .select('id, answer, profiles:author_id (name)')
          .eq('story_id', current.id)
          .eq('question_id', q.id)
          .order('created_at', { ascending: false });
        setAnswers(
          ((data as any[]) ?? []).map((a) => ({ id: a.id, name: a.profiles?.name ?? 'Someone', text: a.answer }))
        );
      } catch {
        // javoblar yuklanmasa, bo'sh ro'yxat ko'rsatiladi
      }
    }
  };
  const closeQuestion = () => {
    Keyboard.dismiss();
    blockedRef.current = viewersSheetOpen;
    setQSheet(null);
    resumeTimer();
  };
  const sendAnswer = async () => {
    const text = qText.trim();
    if (!text || qSending || !qSheet || !current) return;
    setQSending(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('auth');
      const { error } = await supabase
        .from('story_question_answers')
        .insert({ story_id: current.id, question_id: qSheet.id, author_id: uid, answer: text });
      if (error) throw error;
      closeQuestion();
      Alert.alert('Success', 'Your answer has been sent to the story owner.');
    } catch {
      Alert.alert('Error', "Failed to submit answer. Please try again later.");
    } finally {
      setQSending(false);
    }
  };

  // ----------------- So'rovnoma ovozi -----------------
  const votePoll = async (pollId: string, choice: 'A' | 'B') => {
    if (!current || group.isMine) return;
    const prev = pollRes[pollId];
    if (prev?.mine) return;
    setPollRes((p) => {
      const m = { ...(p[pollId] ?? { a: 0, b: 0, mine: null }) };
      if (choice === 'A') m.a += 1;
      else m.b += 1;
      m.mine = choice;
      return { ...p, [pollId]: m };
    });
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error('auth');
      const { error } = await supabase
        .from('story_poll_votes')
        .insert({ story_id: current.id, poll_id: pollId, voter_id: uid, choice });
      if (error && error.code !== '23505') throw error;
    } catch {
      setPollRes((p) => ({ ...p, [pollId]: prev ?? { a: 0, b: 0, mine: null } }));
      Alert.alert('Error', "Failed to submit vote. Please try again later.");
    }
  };

  const openLink = (url: string) => {
    if (!/^https?:\/\//i.test(url)) return;
    pauseTimer();
    Alert.alert(
      'Open Link?',
      url,
      [
        { text: 'Cancel', style: 'cancel', onPress: resumeTimer },
        {
          text: 'Open',
          onPress: () => {
            Linking.openURL(url).catch(() => Alert.alert('Error', "Failed to open link."));
            resumeTimer();
          },
        },
      ],
      { cancelable: true, onDismiss: resumeTimer }
    );
  };

  // ----------------- Ishorlar: tap / ushlab turish / yuqoriga / pastga -----------------
  const latest = useRef<any>({});
  latest.current = { isMine: !!group.isMine, openViewers, onClose, pauseTimer, resumeTimer, goNext, goPrev, frameW, frameH, insets };
  const gest = useRef({ t0: 0, moved: false }).current;

  const gesture = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gest.t0 = Date.now();
        gest.moved = false;
        latest.current.pauseTimer();
      },
      onPanResponderMove: (_e, gs) => {
        if (Math.hypot(gs.dx, gs.dy) > 10) gest.moved = true;
      },
      onPanResponderRelease: (e, gs) => {
        const L = latest.current;
        const vertical = Math.abs(gs.dy) > Math.abs(gs.dx);
        if (gs.dy < -60 && vertical && L.isMine) return L.openViewers(); // pastdan tepaga surish
        if (gs.dy > 90 && vertical) return L.onClose(); // pastga surib yopish
        const isTap = !gest.moved && Date.now() - gest.t0 < 250;
        if (isTap) {
          const { pageX, pageY } = e.nativeEvent;
          if (L.isMine && pageY > L.frameH - (L.insets.bottom + 72)) return L.openViewers(); // pastdagi "ko'rdi" zonasi
          return pageX < L.frameW / 3 ? L.goPrev() : L.goNext();
        }
        L.resumeTimer(); // ushlab turib qo'yib yuborildi
      },
      onPanResponderTerminate: () => latest.current.resumeTimer(),
    })
  ).current;

  if (!current) return null;

  // ----------------- Stiker ko'rinishlari -----------------
  const renderText = (t: StoryTextSticker, fontSize: number) => {
    const black = t.color === '#000000';
    return (
      <View
        style={[
          t.bgMode === 'solid' && [styles.textBgSolid, { backgroundColor: black ? '#fff' : '#000' }],
          t.bgMode === 'soft' && styles.textBgSoft,
        ]}
      >
        <Text
          style={{
            fontFamily: t.fontFamily,
            color: t.bgMode === 'solid' ? (black ? '#000' : '#fff') : t.color,
            fontSize,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {t.text}
        </Text>
      </View>
    );
  };

  const locationNode = current.location_label ? (
    <View style={styles.locationChip}>
      <MapPin size={13} color="#fff" strokeWidth={2.5} />
      <Text style={styles.locationChipText}>{current.location_label}</Text>
    </View>
  ) : null;

  const renderPoll = (p: StoryPollSticker) => {
    const r = pollRes[p.id] ?? { a: 0, b: 0, mine: null };
    const total = r.a + r.b;
    const showResults = !!r.mine || !!group.isMine;
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const opt = (label: string, key: 'A' | 'B', n: number) => (
      <TouchableOpacity
        key={key}
        disabled={showResults}
        activeOpacity={0.8}
        onPress={() => votePoll(p.id, key)}
        style={[styles.pollOpt, r.mine === key && styles.pollOptMine]}
      >
        <Text style={styles.pollOptText} numberOfLines={1}>
          {label}
        </Text>
        {showResults && <Text style={styles.pollPct}>{pct(n)}%</Text>}
      </TouchableOpacity>
    );
    return (
      <View style={styles.pollCard}>
        <Text style={styles.pollQuestion}>{p.question}</Text>
        <View style={styles.pollRow}>
          {opt(p.optionA, 'A', r.a)}
          {opt(p.optionB, 'B', r.b)}
        </View>
        {showResults && <Text style={styles.pollTotal}>{total} votes</Text>}
      </View>
    );
  };

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() => (qSheet ? closeQuestion() : viewersSheetOpen ? closeViewers() : onClose())}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* 1) Media (to'liq ekran) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <StoryMedia
            uri={current.media_url}
            mediaType={current.media_type}
            width={frameW}
            height={frameH}
            onEnd={current.media_type === 'video' ? goNext : undefined}
            paused={paused}
            zoomEnabled={false}
          />
        </View>

        {/* 2) Ishora qatlami */}
        <View style={StyleSheet.absoluteFill} {...gesture.panHandlers} />

        {/* 3) Stikerlar */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Joylashuv */}
          {locationNode &&
            (centered ? (
              <Placed x={current.location_x ?? 0.5} y={current.location_y ?? 0.2} frameW={frameW} frameH={frameH}>
                {locationNode}
              </Placed>
            ) : (
              <View
                pointerEvents="none"
                style={[styles.stickerPos, { left: (current.location_x ?? 0.5) * frameW - 80, top: (current.location_y ?? 0.22) * frameH }]}
              >
                {locationNode}
              </View>
            ))}

          {/* Belgilangan do'stlar */}
          {mentions.map((m) => {
            const chip = (
              <View style={styles.mentionChip}>
                <AtSign size={12} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.mentionChipText}>{m.friendName}</Text>
              </View>
            );
            return centered ? (
              <Placed key={m.id} x={m.x} y={m.y} frameW={frameW} frameH={frameH}>
                {chip}
              </Placed>
            ) : (
              <View key={m.id} pointerEvents="none" style={[styles.stickerPos, { left: m.x * frameW - 70, top: m.y * frameH }]}>
                {chip}
              </View>
            );
          })}

          {/* Matn */}
          {(current.text_stickers ?? []).map((t) =>
            centered ? (
              <Placed key={t.id} x={t.x} y={t.y} scale={t.scale} rotation={t.rotation} frameW={frameW} frameH={frameH}>
                {renderText(t, 26)}
              </Placed>
            ) : (
              <View key={t.id} pointerEvents="none" style={[styles.stickerPos, { left: t.x * frameW - 90, top: t.y * frameH, width: 180 }]}>
                {renderText(t, 22)}
              </View>
            )
          )}

          {/* Yangi stikerlar (faqat yangi formatda) */}
          {extra?.poll?.map((p) => (
            <Placed key={p.id} x={p.x} y={p.y} scale={p.scale} rotation={p.rotation} frameW={frameW} frameH={frameH} interactive>
              {renderPoll(p)}
            </Placed>
          ))}

          {extra?.question?.map((q) => (
            <Placed key={q.id} x={q.x} y={q.y} scale={q.scale} rotation={q.rotation} frameW={frameW} frameH={frameH} interactive>
              <TouchableOpacity activeOpacity={0.85} onPress={() => openQuestion(q)} style={styles.questionCard}>
                <HelpCircle size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.questionText}>{q.prompt}</Text>
              </TouchableOpacity>
            </Placed>
          ))}

          {extra?.music?.map((m) => (
            <Placed key={m.id} x={m.x} y={m.y} scale={m.scale} rotation={m.rotation} frameW={frameW} frameH={frameH}>
              <View style={styles.musicChip}>
                <MusicIcon size={14} color="#111" strokeWidth={2.5} />
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.musicTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={styles.musicArtist} numberOfLines={1}>
                    {m.artist}
                  </Text>
                </View>
              </View>
            </Placed>
          ))}

          {extra?.link?.map((l) => (
            <Placed key={l.id} x={l.x} y={l.y} scale={l.scale} rotation={l.rotation} frameW={frameW} frameH={frameH} interactive>
              <TouchableOpacity activeOpacity={0.85} onPress={() => openLink(l.url)} style={styles.linkChip}>
                <Link2 size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.linkChipText}>{l.label}</Text>
              </TouchableOpacity>
            </Placed>
          ))}

          {extra?.countdown?.map((c) => (
            <Placed key={c.id} x={c.x} y={c.y} scale={c.scale} rotation={c.rotation} frameW={frameW} frameH={frameH}>
              <CountdownCard title={c.title} endsAt={c.endsAt} styles={styles} />
            </Placed>
          ))}

          {/* Eski storylar uchun oddiy izoh */}
          {current.caption && (current.text_stickers ?? []).length === 0 ? (
            <View style={[styles.captionWrap, { bottom: insets.bottom + 90 }]} pointerEvents="none">
              <Text style={styles.captionText}>{current.caption}</Text>
            </View>
          ) : null}
        </View>

        {/* 4) Tepa: progress + egasi (safe-area ichida) */}
        <View style={[styles.topWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.progressRow} pointerEvents="none">
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

          <View style={styles.posterPill}>
            <Avatar emoji={group.emoji} color={group.color} size={30} />
            <View style={styles.posterTextCol}>
              <Text style={styles.posterName} numberOfLines={1}>
                {group.friendName}
              </Text>
              <Text style={styles.posterTime}>{timeAgo(current.created_at)}</Text>
            </View>
            {current.privacy === 'close_friends' && (
              <View style={styles.friendsBadge}>
                <Users2 size={11} color="#fff" strokeWidth={2.6} />
                <Text style={styles.friendsBadgeText}>Close Friends</Text>
              </View>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <X size={18} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 5) Past: layk yoki ko'rganlar */}
        {!group.isMine ? (
          <View style={[styles.likeBar, { bottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.likeBtn} onPress={() => handleToggleLike(current)}>
              <Heart
                size={26}
                color={current.liked_by_me ? likeColor : '#fff'}
                fill={current.liked_by_me ? likeColor : 'transparent'}
                strokeWidth={2}
              />
              {!!current.like_count && <Text style={styles.likeCountText}>{current.like_count}</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.viewersBar, { bottom: insets.bottom + 8 }]} pointerEvents="none">
            <ChevronUp size={16} color="#fff" strokeWidth={2.5} />
            <Eye size={15} color="#fff" strokeWidth={2.5} />
            <Text style={styles.viewersCountText}>{`${current.viewer_count ?? 0} ta ko'rish`}</Text>
          </View>
        )}

        {/* 6) Savol oynasi */}
        {qSheet && (
          <View style={StyleSheet.absoluteFill}>
            <TouchableOpacity activeOpacity={1} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={closeQuestion} />
            <KeyboardAvoidingView
              pointerEvents="box-none"
              style={{ flex: 1, justifyContent: 'flex-end' }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View style={[styles.qSheet, { paddingBottom: insets.bottom + spacing.md }]}>
                <View style={styles.sheetHandle} />
                <View style={styles.questionCardBig}>
                  <HelpCircle size={18} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.questionTextBig}>{qSheet.prompt}</Text>
                </View>
                {group.isMine ? (
                  <FlatList
                    style={{ maxHeight: 260 }}
                    data={answers}
                    keyExtractor={(a) => a.id}
                    ListEmptyComponent={<Text style={styles.sheetEmptyText}>No answers yet</Text>}
                    renderItem={({ item }) => (
                      <View style={styles.answerRow}>
                        <Text style={styles.answerName}>{item.name}</Text>
                        <Text style={styles.answerText}>{item.text}</Text>
                      </View>
                    )}
                  />
                ) : (
                  <View style={styles.answerInputRow}>
                    <TextInput
                      style={styles.answerInput}
                      placeholder="Javobingizni yozing..."
                      placeholderTextColor={colors.textFaint}
                      value={qText}
                      onChangeText={setQText}
                      maxLength={300}
                      multiline
                      autoFocus
                    />
                    <TouchableOpacity
                      onPress={sendAnswer}
                      disabled={!qText.trim() || qSending}
                      style={[styles.sendBtn, (!qText.trim() || qSending) && { opacity: 0.4 }]}
                    >
                      <Send size={18} color={colors.bg} strokeWidth={2.6} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>

      {/* Ko'rganlar varag'i — faqat o'z storylarim */}
      <Modal visible={viewersSheetOpen} transparent animationType="slide" onRequestClose={closeViewers}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeViewers}>
          <View style={[styles.viewersSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Eye size={16} color={colors.text} strokeWidth={2.5} />
              <Text style={styles.sheetTitle}>{`${viewers.length} people viewed`}</Text>
            </View>
            <FlatList
              data={viewers}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ paddingVertical: spacing.sm }}
              ListEmptyComponent={<Text style={styles.sheetEmptyText}>No viewers yet</Text>}
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
    root: { flex: 1, backgroundColor: '#000' },

    topWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.md },
    progressRow: { flexDirection: 'row', gap: 4 },
    progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#fff' },

    posterPill: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.32)',
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    posterTextCol: { flex: 1 },
    posterName: { color: '#fff', fontWeight: '700', fontSize: 13 },
    posterTime: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },
    friendsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: FRIENDS_GREEN, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    friendsBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    closeBtn: { padding: 6 },

    stickerPos: { position: 'absolute' },
    locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
    locationChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    mentionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
    mentionChipText: { fontWeight: '700', fontSize: 13, color: '#111' },
    textBgSolid: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    textBgSoft: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    captionWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radius.md, padding: spacing.sm },
    captionText: { color: '#fff', ...typography.body },

    pollCard: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.lg, padding: spacing.md, minWidth: 230, alignItems: 'center' },
    pollQuestion: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: spacing.sm, textAlign: 'center' },
    pollRow: { flexDirection: 'row', gap: spacing.sm },
    pollOpt: { flex: 1, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
    pollOptMine: { backgroundColor: '#fff', borderWidth: 2, borderColor: FRIENDS_GREEN },
    pollOptText: { fontWeight: '700', fontSize: 13, color: '#111' },
    pollPct: { fontWeight: '800', fontSize: 12, color: '#111', marginTop: 1 },
    pollTotal: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 6, fontWeight: '600' },

    questionCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, maxWidth: 260 },
    questionText: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
    musicChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, maxWidth: 230 },
    musicTitle: { fontWeight: '800', fontSize: 12, color: '#111' },
    musicArtist: { fontWeight: '500', fontSize: 11, color: '#555' },
    linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999 },
    linkChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    countdownCard: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center', minWidth: 180 },
    countdownTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 },
    countdownValue: { color: '#fff', fontWeight: '800', fontSize: 20 },

    likeBar: { position: 'absolute', right: spacing.lg, alignItems: 'center' },
    likeBtn: { alignItems: 'center', gap: 2, padding: 6 },
    likeCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    viewersBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
    viewersCountText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Savol oynasi
    qSheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg + 6, borderTopRightRadius: radius.lg + 6, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    questionCardBig: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ec4899', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
    questionTextBig: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
    answerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    answerInput: { flex: 1, maxHeight: 110, backgroundColor: 'rgba(127,127,127,0.16)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, fontWeight: '600' },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    answerRow: { paddingVertical: spacing.sm },
    answerName: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
    answerText: { color: colors.text, fontWeight: '600', marginTop: 2 },

    // Ko'rganlar varag'i
    sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    viewersSheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, maxHeight: '65%' },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, alignSelf: 'center', marginBottom: spacing.sm, opacity: 0.4 },
    sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: spacing.sm },
    sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
    sheetEmptyText: { color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.lg },
    viewerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    viewerRowName: { flex: 1, color: colors.text, fontWeight: '600' },
    viewerRowTime: { color: colors.textFaint, fontSize: 12 },
  });

export default StoryViewerModal;