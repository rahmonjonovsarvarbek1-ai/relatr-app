import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  PanResponder,
  Animated,
  FlatList,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import {
  X,
  Type as TypeIcon,
  Send,
  MapPin,
  AtSign,
  Palette,
  BarChart3,
  HelpCircle,
  Music as MusicIcon,
  Link2,
  Timer,
  Undo2,
  Trash2,
  Globe,
  Users2,
  Search,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { spacing, radius } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import StoryMedia from './StoryMedia';
import StoryFrame, { useStoryFrameMetrics } from './StoryFrame';
import {
  STORY_FONTS,
  STORY_TEXT_COLORS,
  type StoryTextSticker,
  type StoryMentionSticker,
  type StoryLocationSticker,
} from '../types/storyTypes';

/**
 * ------------------------------------------------------------------
 * YANGI TIPLAR
 * Bu tiplarni idealda '../types/storyTypes' fayliga ko'chirish kerak,
 * lekin loyihaning o'sha fayli kontekstda yo'qligi sababli shu yerda
 * e'lon qilinmoqda. Javob oxiridagi "storyTypes.ts uchun qo'shimcha"
 * blokini asosiy tiplar fayliga ko'chirib qo'ying.
 * ------------------------------------------------------------------
 */
export type StoryPrivacy = 'public' | 'close_friends';

export interface StoryPollSticker {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StoryQuestionSticker {
  id: string;
  prompt: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StoryMusicSticker {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StoryLinkSticker {
  id: string;
  url: string;
  label: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface StoryCountdownSticker {
  id: string;
  title: string;
  endsAt: string; // ISO sana
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

// Musiqa qidiruvi uchun namunaviy ma'lumot. Ishlab chiqarishda buni
// backend / Spotify / Apple Music qidiruv API'siga ulash kerak.
const MOCK_TRACKS: { id: string; title: string; artist: string }[] = [
  { id: 't1', title: 'Yulduzlar ostida', artist: 'Sardor Rahimxon' },
  { id: 't2', title: 'Sen bilan', artist: 'Jasur Umarov' },
  { id: 't3', title: 'Bahor keldi', artist: 'Munisa Rizayeva' },
  { id: 't4', title: 'Qalbim sizniki', artist: 'Shahzoda' },
  { id: 't5', title: 'Tun sukunati', artist: 'Ummon guruhi' },
];

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  uploading: boolean;
  onCancel: () => void;
  onPublish: (payload: {
    caption: string;
    privacy: StoryPrivacy;
    textStickers: StoryTextSticker[];
    mentionStickers: StoryMentionSticker[];
    locationSticker: StoryLocationSticker | null;
    pollStickers: StoryPollSticker[];
    questionStickers: StoryQuestionSticker[];
    musicStickers: StoryMusicSticker[];
    linkStickers: StoryLinkSticker[];
    countdownStickers: StoryCountdownSticker[];
  }) => void;
};

let idCounter = 0;
const nextId = () => `st_${Date.now()}_${idCounter++}`;

const SCREEN_H = Dimensions.get('window').height;
// Ekranning pastki ~170px qismi "o'chirish zonasi" hisoblanadi.
const TRASH_ZONE_Y = SCREEN_H - 170;

function formatRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Tugadi';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d} kun ${h} soat`;
  if (h > 0) return `${h} soat ${m} daq`;
  if (m > 0) return `${m} daq ${s} son`;
  return `${s} soniya`;
}

const CountdownPreview: React.FC<{ title: string; endsAt: string }> = ({ title, endsAt }) => {
  const [remaining, setRemaining] = useState(() => formatRemaining(endsAt));
  useEffect(() => {
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

/**
 * Bitta barmoq bilan surish (pozitsiya) va, agar `resizable` bo'lsa,
 * ikki barmoq bilan kattalashtirish/burish imkonini beruvchi umumiy
 * drag-and-transform wrapper. Pastga surib olib borilsa, o'chirish
 * zonasiga tushganda `onRequestDelete` chaqiriladi.
 */
const DraggableSticker: React.FC<{
  x: number;
  y: number;
  scale: number;
  rotation: number;
  frameW: number;
  frameH: number;
  resizable?: boolean;
  onChange: (x: number, y: number) => void;
  onTransform?: (scale: number, rotation: number) => void;
  onSelect: () => void;
  onDragStateChange?: (active: boolean, overTrash: boolean) => void;
  onRequestDelete?: () => void;
  selected: boolean;
  children: React.ReactNode;
}> = ({
  x,
  y,
  scale,
  rotation,
  frameW,
  frameH,
  resizable = false,
  onChange,
  onTransform,
  onSelect,
  onDragStateChange,
  onRequestDelete,
  selected,
  children,
}) => {
  const pan = useRef(new Animated.ValueXY({ x: x * frameW, y: y * frameH })).current;
  const [liveScale, setLiveScale] = useState(scale);
  const [liveRotation, setLiveRotation] = useState(rotation);
  const pinchRef = useRef<{ dist: number; angle: number; scale: number; rotation: number } | null>(null);

  const dist2 = (t: any[]) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  const angle2 = (t: any[]) => (Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX) * 180) / Math.PI;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        onSelect();
        onDragStateChange?.(true, false);
        const touches = evt.nativeEvent.touches;
        if (resizable && touches.length === 2) {
          pinchRef.current = {
            dist: dist2(touches),
            angle: angle2(touches),
            scale: liveScale,
            rotation: liveRotation,
          };
        } else {
          pinchRef.current = null;
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (resizable && touches.length === 2) {
          if (!pinchRef.current) {
            pinchRef.current = { dist: dist2(touches), angle: angle2(touches), scale: liveScale, rotation: liveRotation };
          }
          const d = dist2(touches);
          const a = angle2(touches);
          const nextScale = Math.max(0.5, Math.min(3, pinchRef.current.scale * (d / pinchRef.current.dist)));
          const nextRotation = pinchRef.current.rotation + (a - pinchRef.current.angle);
          setLiveScale(nextScale);
          setLiveRotation(nextRotation);
        } else if (touches.length === 1) {
          Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(evt, gestureState);
          onDragStateChange?.(true, gestureState.moveY > TRASH_ZONE_Y);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        onDragStateChange?.(false, false);
        if (pinchRef.current) {
          onTransform?.(liveScale, liveRotation);
          pinchRef.current = null;
          return;
        }
        pan.flattenOffset();
        if (gestureState.moveY > TRASH_ZONE_Y) {
          onRequestDelete?.();
          return;
        }
        const nx = Math.max(0, Math.min(1, (pan.x as any)._value / frameW));
        const ny = Math.max(0, Math.min(1, (pan.y as any)._value / frameH));
        onChange(nx, ny);
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.stickerWrap,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale: liveScale },
            { rotate: `${liveRotation}deg` },
          ],
        },
        selected && styles.stickerSelected,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const StoryComposerModal: React.FC<Props> = ({ uri, mediaType, uploading, onCancel, onPublish }) => {
  const { colors } = useTheme();
  const { friends } = useApp();
  const styles2 = useMemo(() => makeStyles(colors), [colors]);
  const { frameW, frameH, insets } = useStoryFrameMetrics();

  const [textStickers, setTextStickers] = useState<StoryTextSticker[]>([]);
  const [mentionStickers, setMentionStickers] = useState<StoryMentionSticker[]>([]);
  const [locationSticker, setLocationSticker] = useState<StoryLocationSticker | null>(null);
  const [pollStickers, setPollStickers] = useState<StoryPollSticker[]>([]);
  const [questionStickers, setQuestionStickers] = useState<StoryQuestionSticker[]>([]);
  const [musicStickers, setMusicStickers] = useState<StoryMusicSticker[]>([]);
  const [linkStickers, setLinkStickers] = useState<StoryLinkSticker[]>([]);
  const [countdownStickers, setCountdownStickers] = useState<StoryCountdownSticker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<StoryPrivacy>('public');

  const [dragState, setDragState] = useState<{ active: boolean; overTrash: boolean }>({
    active: false,
    overTrash: false,
  });

  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftFontIdx, setDraftFontIdx] = useState(0);
  const [draftColorIdx, setDraftColorIdx] = useState(0);
  const [draftBgMode, setDraftBgMode] = useState<'none' | 'solid' | 'soft'>('none');

  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const [pollEditorOpen, setPollEditorOpen] = useState(false);
  const [draftPollQuestion, setDraftPollQuestion] = useState('');
  const [draftPollOptionA, setDraftPollOptionA] = useState('Ha');
  const [draftPollOptionB, setDraftPollOptionB] = useState("Yo'q");

  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [draftQuestionPrompt, setDraftQuestionPrompt] = useState('Menga savol bering!');

  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');

  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [draftLinkUrl, setDraftLinkUrl] = useState('');
  const [draftLinkLabel, setDraftLinkLabel] = useState("Havolani ko'rish");

  const [countdownEditorOpen, setCountdownEditorOpen] = useState(false);
  const [draftCountdownTitle, setDraftCountdownTitle] = useState('');

  const legacyCaption = useMemo(() => textStickers.map((t) => t.text).join(' \u00b7 '), [textStickers]);

  const filteredTracks = useMemo(
    () =>
      MOCK_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(musicSearch.toLowerCase()) ||
          t.artist.toLowerCase().includes(musicSearch.toLowerCase())
      ),
    [musicSearch]
  );

  // ---- Undo stack: har xil turdagi stikerlar uchun bitta umumiy tarix ----
  type StickerKind = 'text' | 'mention' | 'location' | 'poll' | 'question' | 'music' | 'link' | 'countdown';
  const undoStack = useRef<{ kind: StickerKind; id: string }[]>([]);
  const pushUndo = (kind: StickerKind, id: string) => undoStack.current.push({ kind, id });

  const removeStickerById = (id: string) => {
    setTextStickers((p) => p.filter((s) => s.id !== id));
    setMentionStickers((p) => p.filter((s) => s.id !== id));
    setPollStickers((p) => p.filter((s) => s.id !== id));
    setQuestionStickers((p) => p.filter((s) => s.id !== id));
    setMusicStickers((p) => p.filter((s) => s.id !== id));
    setLinkStickers((p) => p.filter((s) => s.id !== id));
    setCountdownStickers((p) => p.filter((s) => s.id !== id));
    setLocationSticker((p) => (p?.id === id ? null : p));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    removeStickerById(selectedId);
    setSelectedId(null);
  };

  const handleUndo = () => {
    const last = undoStack.current.pop();
    if (!last) return;
    removeStickerById(last.id);
    setSelectedId((cur) => (cur === last.id ? null : cur));
  };

  const handleDragState = (active: boolean, overTrash: boolean) => setDragState({ active, overTrash });

  // ---- Matn stikeri ----
  const openTextEditor = () => {
    setDraftText('');
    setDraftFontIdx(0);
    setDraftColorIdx(0);
    setDraftBgMode('none');
    setTextEditorOpen(true);
  };

  const commitTextSticker = () => {
    if (!draftText.trim()) {
      setTextEditorOpen(false);
      return;
    }
    const sticker: StoryTextSticker = {
      id: nextId(),
      text: draftText.trim(),
      x: 0.5,
      y: 0.42,
      fontFamily: STORY_FONTS[draftFontIdx].fontFamily as string,
      color: STORY_TEXT_COLORS[draftColorIdx],
      bgMode: draftBgMode,
      scale: 1,
      rotation: 0,
    };
    setTextStickers((prev) => [...prev, sticker]);
    pushUndo('text', sticker.id);
    setTextEditorOpen(false);
  };

  const updateTextPos = (id: string, x: number, y: number) => {
    setTextStickers((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
  };
  const updateTextTransform = (id: string, scale: number, rotation: number) => {
    setTextStickers((prev) => prev.map((t) => (t.id === id ? { ...t, scale, rotation } : t)));
  };

  // ---- Mention stikeri ----
  const addMention = (friendId: string, friendName: string) => {
    const sticker: StoryMentionSticker = { id: nextId(), friendId, friendName, x: 0.5, y: 0.3 };
    setMentionStickers((prev) => [...prev, sticker]);
    pushUndo('mention', sticker.id);
    setMentionPickerOpen(false);
  };
  const updateMentionPos = (id: string, x: number, y: number) => {
    setMentionStickers((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
  };

  // ---- Joylashuv stikeri ----
  const addLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = places[0];
      const label = place
        ? [place.city ?? place.subregion, place.region ?? place.country].filter(Boolean).join(', ')
        : 'Mening joylashuvim';
      const sticker: StoryLocationSticker = { id: nextId(), label, x: 0.5, y: 0.18 };
      setLocationSticker(sticker);
      pushUndo('location', sticker.id);
    } catch {
      // Joylashuv ixtiyoriy — xatolik bo'lsa story joylashda xalaqit bermaydi.
    } finally {
      setLocationLoading(false);
    }
  };
  const updateLocationPos = (x: number, y: number) => {
    setLocationSticker((prev) => (prev ? { ...prev, x, y } : prev));
  };

  // ---- Poll (so'rovnoma) stikeri ----
  const openPollEditor = () => {
    setDraftPollQuestion('');
    setDraftPollOptionA('Ha');
    setDraftPollOptionB("Yo'q");
    setPollEditorOpen(true);
  };
  const commitPoll = () => {
    if (!draftPollQuestion.trim() || !draftPollOptionA.trim() || !draftPollOptionB.trim()) {
      setPollEditorOpen(false);
      return;
    }
    const sticker: StoryPollSticker = {
      id: nextId(),
      question: draftPollQuestion.trim(),
      optionA: draftPollOptionA.trim(),
      optionB: draftPollOptionB.trim(),
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
    };
    setPollStickers((prev) => [...prev, sticker]);
    pushUndo('poll', sticker.id);
    setPollEditorOpen(false);
  };
  const updatePollPos = (id: string, x: number, y: number) =>
    setPollStickers((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  const updatePollTransform = (id: string, scale: number, rotation: number) =>
    setPollStickers((prev) => prev.map((p) => (p.id === id ? { ...p, scale, rotation } : p)));

  // ---- Savol stikeri ----
  const openQuestionEditor = () => {
    setDraftQuestionPrompt('Menga savol bering!');
    setQuestionEditorOpen(true);
  };
  const commitQuestion = () => {
    if (!draftQuestionPrompt.trim()) {
      setQuestionEditorOpen(false);
      return;
    }
    const sticker: StoryQuestionSticker = {
      id: nextId(),
      prompt: draftQuestionPrompt.trim(),
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
    };
    setQuestionStickers((prev) => [...prev, sticker]);
    pushUndo('question', sticker.id);
    setQuestionEditorOpen(false);
  };
  const updateQuestionPos = (id: string, x: number, y: number) =>
    setQuestionStickers((prev) => prev.map((q) => (q.id === id ? { ...q, x, y } : q)));
  const updateQuestionTransform = (id: string, scale: number, rotation: number) =>
    setQuestionStickers((prev) => prev.map((q) => (q.id === id ? { ...q, scale, rotation } : q)));

  // ---- Musiqa stikeri ----
  const openMusicPicker = () => {
    setMusicSearch('');
    setMusicPickerOpen(true);
  };
  const addMusic = (trackId: string, title: string, artist: string) => {
    const sticker: StoryMusicSticker = { id: nextId(), trackId, title, artist, x: 0.5, y: 0.25, scale: 1, rotation: 0 };
    setMusicStickers((prev) => [...prev, sticker]);
    pushUndo('music', sticker.id);
    setMusicPickerOpen(false);
  };
  const updateMusicPos = (id: string, x: number, y: number) =>
    setMusicStickers((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
  const updateMusicTransform = (id: string, scale: number, rotation: number) =>
    setMusicStickers((prev) => prev.map((m) => (m.id === id ? { ...m, scale, rotation } : m)));

  // ---- Havola stikeri ----
  const openLinkEditor = () => {
    setDraftLinkUrl('');
    setDraftLinkLabel("Havolani ko'rish");
    setLinkEditorOpen(true);
  };
  const commitLink = () => {
    const url = draftLinkUrl.trim();
    if (!url) {
      setLinkEditorOpen(false);
      return;
    }
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const sticker: StoryLinkSticker = {
      id: nextId(),
      url: normalizedUrl,
      label: draftLinkLabel.trim() || "Havolani ko'rish",
      x: 0.5,
      y: 0.75,
      scale: 1,
      rotation: 0,
    };
    setLinkStickers((prev) => [...prev, sticker]);
    pushUndo('link', sticker.id);
    setLinkEditorOpen(false);
  };
  const updateLinkPos = (id: string, x: number, y: number) =>
    setLinkStickers((prev) => prev.map((l) => (l.id === id ? { ...l, x, y } : l)));
  const updateLinkTransform = (id: string, scale: number, rotation: number) =>
    setLinkStickers((prev) => prev.map((l) => (l.id === id ? { ...l, scale, rotation } : l)));

  // ---- Countdown (sanoq) stikeri ----
  const openCountdownEditor = () => {
    setDraftCountdownTitle('');
    setCountdownEditorOpen(true);
  };
  const commitCountdown = (durationMs: number) => {
    if (!draftCountdownTitle.trim()) return;
    const sticker: StoryCountdownSticker = {
      id: nextId(),
      title: draftCountdownTitle.trim(),
      endsAt: new Date(Date.now() + durationMs).toISOString(),
      x: 0.5,
      y: 0.35,
      scale: 1,
      rotation: 0,
    };
    setCountdownStickers((prev) => [...prev, sticker]);
    pushUndo('countdown', sticker.id);
    setCountdownEditorOpen(false);
  };
  const updateCountdownPos = (id: string, x: number, y: number) =>
    setCountdownStickers((prev) => prev.map((c) => (c.id === id ? { ...c, x, y } : c)));
  const updateCountdownTransform = (id: string, scale: number, rotation: number) =>
    setCountdownStickers((prev) => prev.map((c) => (c.id === id ? { ...c, scale, rotation } : c)));

  const togglePrivacy = () => setPrivacy((p) => (p === 'public' ? 'close_friends' : 'public'));

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StoryFrame width={frameW} height={frameH}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setSelectedId(null)}>
            <StoryMedia uri={uri} mediaType={mediaType} width={frameW} height={frameH} loop zoomEnabled />
          </TouchableOpacity>

          <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topGradient} pointerEvents="none" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.bottomGradient} pointerEvents="none" />

          {locationSticker && (
            <DraggableSticker
              x={locationSticker.x}
              y={locationSticker.y}
              scale={1}
              rotation={0}
              frameW={frameW}
              frameH={frameH}
              onChange={updateLocationPos}
              onSelect={() => setSelectedId(locationSticker.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(locationSticker.id)}
              selected={selectedId === locationSticker.id}
            >
              <View style={styles.locationChip}>
                <MapPin size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.locationChipText}>{locationSticker.label}</Text>
              </View>
            </DraggableSticker>
          )}

          {mentionStickers.map((m) => (
            <DraggableSticker
              key={m.id}
              x={m.x}
              y={m.y}
              scale={1}
              rotation={0}
              frameW={frameW}
              frameH={frameH}
              onChange={(x, y) => updateMentionPos(m.id, x, y)}
              onSelect={() => setSelectedId(m.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(m.id)}
              selected={selectedId === m.id}
            >
              <View style={styles.mentionChip}>
                <AtSign size={13} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.mentionChipText}>{m.friendName}</Text>
              </View>
            </DraggableSticker>
          ))}

          {textStickers.map((t) => (
            <DraggableSticker
              key={t.id}
              x={t.x}
              y={t.y}
              scale={t.scale}
              rotation={t.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updateTextPos(t.id, x, y)}
              onTransform={(s, r) => updateTextTransform(t.id, s, r)}
              onSelect={() => setSelectedId(t.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(t.id)}
              selected={selectedId === t.id}
            >
              <View
                style={[
                  t.bgMode === 'solid' && [styles.textBgSolid, { backgroundColor: t.color === '#000000' ? '#fff' : '#000' }],
                  t.bgMode === 'soft' && styles.textBgSoft,
                ]}
              >
                <Text
                  style={{
                    fontFamily: t.fontFamily,
                    color: t.bgMode === 'solid' ? (t.color === '#000000' ? '#000' : '#fff') : t.color,
                    fontSize: 26,
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  {t.text}
                </Text>
              </View>
            </DraggableSticker>
          ))}

          {pollStickers.map((p) => (
            <DraggableSticker
              key={p.id}
              x={p.x}
              y={p.y}
              scale={p.scale}
              rotation={p.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updatePollPos(p.id, x, y)}
              onTransform={(s, r) => updatePollTransform(p.id, s, r)}
              onSelect={() => setSelectedId(p.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(p.id)}
              selected={selectedId === p.id}
            >
              <View style={styles.pollCard}>
                <Text style={styles.pollQuestion}>{p.question}</Text>
                <View style={styles.pollOptionsRow}>
                  <View style={styles.pollOptionPill}>
                    <Text style={styles.pollOptionText}>{p.optionA}</Text>
                  </View>
                  <View style={styles.pollOptionPill}>
                    <Text style={styles.pollOptionText}>{p.optionB}</Text>
                  </View>
                </View>
              </View>
            </DraggableSticker>
          ))}

          {questionStickers.map((q) => (
            <DraggableSticker
              key={q.id}
              x={q.x}
              y={q.y}
              scale={q.scale}
              rotation={q.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updateQuestionPos(q.id, x, y)}
              onTransform={(s, r) => updateQuestionTransform(q.id, s, r)}
              onSelect={() => setSelectedId(q.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(q.id)}
              selected={selectedId === q.id}
            >
              <View style={styles.questionCard}>
                <HelpCircle size={16} color="#fff" strokeWidth={2.5} />
                <Text style={styles.questionText}>{q.prompt}</Text>
              </View>
            </DraggableSticker>
          ))}

          {musicStickers.map((m) => (
            <DraggableSticker
              key={m.id}
              x={m.x}
              y={m.y}
              scale={m.scale}
              rotation={m.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updateMusicPos(m.id, x, y)}
              onTransform={(s, r) => updateMusicTransform(m.id, s, r)}
              onSelect={() => setSelectedId(m.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(m.id)}
              selected={selectedId === m.id}
            >
              <View style={styles.musicChip}>
                <MusicIcon size={14} color="#111" strokeWidth={2.5} />
                <View>
                  <Text style={styles.musicTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={styles.musicArtist} numberOfLines={1}>
                    {m.artist}
                  </Text>
                </View>
              </View>
            </DraggableSticker>
          ))}

          {linkStickers.map((l) => (
            <DraggableSticker
              key={l.id}
              x={l.x}
              y={l.y}
              scale={l.scale}
              rotation={l.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updateLinkPos(l.id, x, y)}
              onTransform={(s, r) => updateLinkTransform(l.id, s, r)}
              onSelect={() => setSelectedId(l.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(l.id)}
              selected={selectedId === l.id}
            >
              <View style={styles.linkChip}>
                <Link2 size={14} color="#fff" strokeWidth={2.5} />
                <Text style={styles.linkChipText}>{l.label}</Text>
              </View>
            </DraggableSticker>
          ))}

          {countdownStickers.map((c) => (
            <DraggableSticker
              key={c.id}
              x={c.x}
              y={c.y}
              scale={c.scale}
              rotation={c.rotation}
              frameW={frameW}
              frameH={frameH}
              resizable
              onChange={(x, y) => updateCountdownPos(c.id, x, y)}
              onTransform={(s, r) => updateCountdownTransform(c.id, s, r)}
              onSelect={() => setSelectedId(c.id)}
              onDragStateChange={handleDragState}
              onRequestDelete={() => removeStickerById(c.id)}
              selected={selectedId === c.id}
            >
              <CountdownPreview title={c.title} endsAt={c.endsAt} />
            </DraggableSticker>
          ))}

          {/* Yuqori asboblar paneli */}
          <View style={styles2.composerHeader}>
            <TouchableOpacity onPress={onCancel} style={styles2.iconBtn}>
              <X size={22} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles2.headerRightGroup}>
              {selectedId && (
                <TouchableOpacity onPress={removeSelected} style={styles2.iconBtn}>
                  <Text style={styles2.removeLabel}>O'chirish</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleUndo} style={styles2.iconBtn}>
                <Undo2 size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openCountdownEditor} style={styles2.iconBtn}>
                <Timer size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openLinkEditor} style={styles2.iconBtn}>
                <Link2 size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openMusicPicker} style={styles2.iconBtn}>
                <MusicIcon size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openQuestionEditor} style={styles2.iconBtn}>
                <HelpCircle size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openPollEditor} style={styles2.iconBtn}>
                <BarChart3 size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={addLocation} style={styles2.iconBtn} disabled={locationLoading}>
                {locationLoading ? <ActivityIndicator size="small" color="#fff" /> : <MapPin size={20} color="#fff" strokeWidth={2.5} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMentionPickerOpen(true)} style={styles2.iconBtn}>
                <AtSign size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={openTextEditor} style={styles2.iconBtn}>
                <TypeIcon size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          </View>

          {/* O'chirish zonasi — sticker sudralayotganda ko'rinadi */}
          {dragState.active && (
            <View pointerEvents="none" style={[styles2.trashZone, dragState.overTrash && styles2.trashZoneActive]}>
              <Trash2 size={22} color="#fff" strokeWidth={2.5} />
            </View>
          )}

          {/* Pastki panel: maxfiylik va joylash */}
          <View style={styles2.composerFooter}>
            <TouchableOpacity onPress={togglePrivacy} style={styles2.privacyChip}>
              {privacy === 'public' ? (
                <Globe size={14} color="#fff" strokeWidth={2.5} />
              ) : (
                <Users2 size={14} color="#fff" strokeWidth={2.5} />
              )}
              <Text style={styles2.privacyChipText}>{privacy === 'public' ? 'Hammaga' : "Yaqin do'stlar"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles2.publishBtn}
              onPress={() =>
                onPublish({
                  caption: legacyCaption,
                  privacy,
                  textStickers,
                  mentionStickers,
                  locationSticker,
                  pollStickers,
                  questionStickers,
                  musicStickers,
                  linkStickers,
                  countdownStickers,
                })
              }
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <>
                  <Send size={16} color={colors.bg} strokeWidth={2.5} />
                  <Text style={styles2.publishBtnText}>Storyga joylash</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </StoryFrame>

        {/* Matn tahrirlash paneli */}
        <Modal visible={textEditorOpen} transparent animationType="fade" onRequestClose={() => setTextEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPreviewWrap}>
                <View
                  style={[
                    draftBgMode === 'solid' && [
                      styles.textBgSolid,
                      { backgroundColor: STORY_TEXT_COLORS[draftColorIdx] === '#000000' ? '#fff' : '#000' },
                    ],
                    draftBgMode === 'soft' && styles.textBgSoft,
                  ]}
                >
                  <TextInput
                    style={{
                      fontFamily: STORY_FONTS[draftFontIdx].fontFamily,
                      color:
                        draftBgMode === 'solid'
                          ? STORY_TEXT_COLORS[draftColorIdx] === '#000000'
                            ? '#000'
                            : '#fff'
                          : STORY_TEXT_COLORS[draftColorIdx],
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      minWidth: 120,
                    }}
                    placeholder="Nimadir yozing..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={draftText}
                    onChangeText={setDraftText}
                    autoFocus
                    multiline
                  />
                </View>
              </View>

              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Shrift</Text>
                <FlatList
                  data={STORY_FONTS}
                  keyExtractor={(f) => f.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      style={[styles2.fontChip, draftFontIdx === index && styles2.fontChipActive]}
                      onPress={() => setDraftFontIdx(index)}
                    >
                      <Text style={[{ fontFamily: item.fontFamily }, styles2.fontChipText]}>{item.label}</Text>
                    </TouchableOpacity>
                  )}
                />

                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Rang</Text>
                <View style={styles2.colorRow}>
                  {STORY_TEXT_COLORS.map((c, index) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles2.colorDot, { backgroundColor: c }, draftColorIdx === index && styles2.colorDotActive]}
                      onPress={() => setDraftColorIdx(index)}
                    />
                  ))}
                </View>

                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Fon</Text>
                <View style={styles2.colorRow}>
                  {(['none', 'soft', 'solid'] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles2.bgModeChip, draftBgMode === mode && styles2.bgModeChipActive]}
                      onPress={() => setDraftBgMode(mode)}
                    >
                      <Palette size={13} color={draftBgMode === mode ? colors.bg : '#fff'} strokeWidth={2} />
                      <Text style={[styles2.bgModeChipText, draftBgMode === mode && { color: colors.bg }]}>
                        {mode === 'none' ? "yo'q" : mode === 'soft' ? 'yumshoq' : "to'liq"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setTextEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Bekor qilish</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitTextSticker} style={styles2.textEditorDoneBtn}>
                    <Text style={styles2.textEditorDoneText}>Tayyor</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Mention tanlash paneli */}
        <Modal visible={mentionPickerOpen} transparent animationType="fade" onRequestClose={() => setMentionPickerOpen(false)}>
          <TouchableOpacity style={styles2.textEditorBackdrop} activeOpacity={1} onPress={() => setMentionPickerOpen(false)}>
            <View style={[styles2.mentionSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <Text style={styles2.textEditorLabel}>Do'stni belgilash</Text>
              <FlatList
                data={friends}
                keyExtractor={(f: any) => f.id}
                contentContainerStyle={{ paddingVertical: spacing.sm }}
                renderItem={({ item }: any) => (
                  <TouchableOpacity style={styles2.mentionRow} onPress={() => addMention(item.id, item.name)}>
                    <AtSign size={16} color={colors.primary} strokeWidth={2.5} />
                    <Text style={styles2.mentionRowText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles2.textEditorLabel}>Avval do'st qo'shing</Text>}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Poll (so'rovnoma) tahrirlash paneli */}
        <Modal visible={pollEditorOpen} transparent animationType="fade" onRequestClose={() => setPollEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Savol</Text>
                <TextInput
                  style={styles2.sheetInput}
                  placeholder="Masalan: Bugun sport zaliga borayinmi?"
                  placeholderTextColor={colors.textFaint}
                  value={draftPollQuestion}
                  onChangeText={setDraftPollQuestion}
                  autoFocus
                />
                <View style={styles2.pollOptionInputsRow}>
                  <TextInput
                    style={[styles2.sheetInput, { flex: 1 }]}
                    placeholder="A variant"
                    placeholderTextColor={colors.textFaint}
                    value={draftPollOptionA}
                    onChangeText={setDraftPollOptionA}
                  />
                  <TextInput
                    style={[styles2.sheetInput, { flex: 1 }]}
                    placeholder="B variant"
                    placeholderTextColor={colors.textFaint}
                    value={draftPollOptionB}
                    onChangeText={setDraftPollOptionB}
                  />
                </View>
                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setPollEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Bekor qilish</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitPoll} style={styles2.textEditorDoneBtn}>
                    <Text style={styles2.textEditorDoneText}>Qo'shish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Savol stikeri tahrirlash paneli */}
        <Modal visible={questionEditorOpen} transparent animationType="fade" onRequestClose={() => setQuestionEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Savol matni</Text>
                <TextInput
                  style={styles2.sheetInput}
                  placeholder="Menga savol bering!"
                  placeholderTextColor={colors.textFaint}
                  value={draftQuestionPrompt}
                  onChangeText={setDraftQuestionPrompt}
                  autoFocus
                />
                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setQuestionEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Bekor qilish</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitQuestion} style={styles2.textEditorDoneBtn}>
                    <Text style={styles2.textEditorDoneText}>Qo'shish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Musiqa tanlash paneli */}
        <Modal visible={musicPickerOpen} transparent animationType="fade" onRequestClose={() => setMusicPickerOpen(false)}>
          <TouchableOpacity style={styles2.textEditorBackdrop} activeOpacity={1} onPress={() => setMusicPickerOpen(false)}>
            <View style={[styles2.mentionSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <Text style={styles2.textEditorLabel}>Musiqa qo'shish</Text>
              <View style={styles2.searchRow}>
                <Search size={16} color={colors.textFaint} strokeWidth={2} />
                <TextInput
                  style={styles2.searchInput}
                  placeholder="Qo'shiq yoki ijrochi qidirish..."
                  placeholderTextColor={colors.textFaint}
                  value={musicSearch}
                  onChangeText={setMusicSearch}
                />
              </View>
              <FlatList
                data={filteredTracks}
                keyExtractor={(t) => t.id}
                contentContainerStyle={{ paddingVertical: spacing.sm }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles2.mentionRow} onPress={() => addMusic(item.id, item.title, item.artist)}>
                    <MusicIcon size={16} color={colors.primary} strokeWidth={2.5} />
                    <View>
                      <Text style={styles2.mentionRowText}>{item.title}</Text>
                      <Text style={styles2.textEditorLabel}>{item.artist}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles2.textEditorLabel}>Hech narsa topilmadi</Text>}
              />
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Havola tahrirlash paneli */}
        <Modal visible={linkEditorOpen} transparent animationType="fade" onRequestClose={() => setLinkEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Havola manzili</Text>
                <TextInput
                  style={styles2.sheetInput}
                  placeholder="https://misol.uz"
                  placeholderTextColor={colors.textFaint}
                  value={draftLinkUrl}
                  onChangeText={setDraftLinkUrl}
                  autoCapitalize="none"
                  autoFocus
                  keyboardType="url"
                />
                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Ko'rsatiladigan matn</Text>
                <TextInput
                  style={styles2.sheetInput}
                  placeholder="Havolani ko'rish"
                  placeholderTextColor={colors.textFaint}
                  value={draftLinkLabel}
                  onChangeText={setDraftLinkLabel}
                />
                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setLinkEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Bekor qilish</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={commitLink} style={styles2.textEditorDoneBtn}>
                    <Text style={styles2.textEditorDoneText}>Qo'shish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Countdown (sanoq) tahrirlash paneli */}
        <Modal visible={countdownEditorOpen} transparent animationType="fade" onRequestClose={() => setCountdownEditorOpen(false)}>
          <View style={styles2.textEditorBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles2.textEditorPanel}>
                <Text style={styles2.textEditorLabel}>Sarlavha</Text>
                <TextInput
                  style={styles2.sheetInput}
                  placeholder="Masalan: Tug'ilgan kunimga"
                  placeholderTextColor={colors.textFaint}
                  value={draftCountdownTitle}
                  onChangeText={setDraftCountdownTitle}
                  autoFocus
                />
                <Text style={[styles2.textEditorLabel, { marginTop: spacing.md }]}>Muddat</Text>
                <View style={styles2.colorRow}>
                  <TouchableOpacity style={styles2.fontChip} onPress={() => commitCountdown(24 * 60 * 60 * 1000)}>
                    <Text style={styles2.fontChipText}>1 kun</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles2.fontChip} onPress={() => commitCountdown(3 * 24 * 60 * 60 * 1000)}>
                    <Text style={styles2.fontChipText}>3 kun</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles2.fontChip} onPress={() => commitCountdown(7 * 24 * 60 * 60 * 1000)}>
                    <Text style={styles2.fontChipText}>1 hafta</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles2.textEditorFooter}>
                  <TouchableOpacity onPress={() => setCountdownEditorOpen(false)} style={styles2.textEditorCancelBtn}>
                    <Text style={styles2.textEditorCancelText}>Bekor qilish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },
  stickerWrap: { position: 'absolute' },
  stickerSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  textBgSolid: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  textBgSoft: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
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
  },
  mentionChipText: { fontWeight: '700', fontSize: 13, color: '#111' },
  pollCard: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.lg,
    padding: spacing.md,
    minWidth: 220,
    alignItems: 'center',
  },
  pollQuestion: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: spacing.sm, textAlign: 'center' },
  pollOptionsRow: { flexDirection: 'row', gap: spacing.sm },
  pollOptionPill: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  pollOptionText: { fontWeight: '700', fontSize: 13, color: '#111' },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    maxWidth: 260,
  },
  questionText: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  musicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    maxWidth: 220,
  },
  musicTitle: { fontWeight: '800', fontSize: 12, color: '#111' },
  musicArtist: { fontWeight: '500', fontSize: 11, color: '#555' },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  linkChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  countdownCard: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minWidth: 180,
  },
  countdownTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  countdownValue: { color: '#fff', fontWeight: '800', fontSize: 20 },
});

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    composerHeader: {
      position: 'absolute',
      top: spacing.md,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerRightGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
    iconBtn: { padding: spacing.sm },
    removeLabel: { color: '#ff5a5a', fontWeight: '700', fontSize: 13 },

    trashZone: {
      position: 'absolute',
      bottom: 40,
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    trashZoneActive: { backgroundColor: '#ff3b30', transform: [{ scale: 1.15 }] },

    composerFooter: {
      position: 'absolute',
      bottom: spacing.lg,
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    privacyChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
    },
    privacyChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    publishBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
    },
    publishBtnText: { color: colors.bg, fontWeight: '800' },

    textEditorBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    textEditorPreviewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    textEditorPanel: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    textEditorLabel: { color: colors.textFaint, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
    sheetInput: {
      marginTop: spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      fontWeight: '600',
    },
    pollOptionInputsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    searchInput: { flex: 1, color: colors.text, paddingVertical: spacing.sm, fontWeight: '600' },
    fontChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: 'rgba(255,255,255,0.06)',
      marginTop: spacing.xs,
    },
    fontChipActive: { backgroundColor: colors.primary },
    fontChipText: { color: '#fff', fontWeight: '600' },
    colorRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
    colorDotActive: { borderColor: colors.primary },
    bgModeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    bgModeChipActive: { backgroundColor: colors.primary },
    bgModeChipText: { color: '#fff', fontWeight: '600', fontSize: 12, textTransform: 'capitalize' },
    textEditorFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
    textEditorCancelBtn: { padding: spacing.md },
    textEditorCancelText: { color: colors.textFaint, fontWeight: '700' },
    textEditorDoneBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    textEditorDoneText: { color: colors.bg, fontWeight: '800' },

    mentionSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    mentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    mentionRowText: { color: colors.text, fontWeight: '600' },
  });

export default StoryComposerModal;