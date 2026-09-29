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
  ScrollView,
  Dimensions,
  Alert,
  Keyboard,
  Linking,
  Easing,
  Image,
} from 'react-native';
import * as Location from 'expo-location';
import {
  X,
  Type as TypeIcon,
  Send,
  MapPin,
  AtSign,
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
  ChevronUp,
  Check,
  Clock,
  Navigation,
  Eye,
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

/* ================================================================== */
/*  TIPLAR (idealda '../types/storyTypes' fayliga ko'chiring)          */
/* ================================================================== */
export type StoryPrivacy = 'public' | 'close_friends';

interface BaseSticker {
  id: string;
  x: number; // 0..1 (markaz)
  y: number; // 0..1 (markaz)
  scale: number;
  rotation: number;
}
export interface StoryPollSticker extends BaseSticker {
  question: string;
  optionA: string;
  optionB: string;
}
export interface StoryQuestionSticker extends BaseSticker {
  prompt: string;
}
export interface StoryMusicSticker extends BaseSticker {
  trackId: string;
  title: string;
  artist: string;
}
export interface StoryLinkSticker extends BaseSticker {
  url: string;
  label: string;
}
export interface StoryCountdownSticker extends BaseSticker {
  title: string;
  endsAt: string; // ISO sana
}
export type StoryLocationStickerEx = StoryLocationSticker & { latitude?: number; longitude?: number };
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
}
export type StoryViewer = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  viewedAt: string; // ISO
};

type Item =
  | { kind: 'text'; s: StoryTextSticker }
  | { kind: 'mention'; s: StoryMentionSticker }
  | { kind: 'location'; s: StoryLocationStickerEx }
  | { kind: 'poll'; s: StoryPollSticker }
  | { kind: 'question'; s: StoryQuestionSticker }
  | { kind: 'music'; s: StoryMusicSticker }
  | { kind: 'link'; s: StoryLinkSticker }
  | { kind: 'countdown'; s: StoryCountdownSticker };
type Kind = Item['kind'];
type SheetKey = null | 'tray' | 'text' | 'mention' | 'location' | 'poll' | 'question' | 'music' | 'link' | 'countdown' | 'privacy';

// Demo ma'lumot. Ishlab chiqarishda `searchTracks` prop orqali backend/Spotify API ulang.
const MOCK_TRACKS: MusicTrack[] = [
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
  searchTracks?: (query: string) => Promise<MusicTrack[]>;
  onPublish: (payload: {
    caption: string;
    privacy: StoryPrivacy;
    durationSec: number | null; // rasm uchun ko'rsatish vaqti, video uchun null
    textStickers: StoryTextSticker[];
    mentionStickers: StoryMentionSticker[];
    locationSticker: StoryLocationStickerEx | null;
    pollStickers: StoryPollSticker[];
    questionStickers: StoryQuestionSticker[];
    musicStickers: StoryMusicSticker[];
    linkStickers: StoryLinkSticker[];
    countdownStickers: StoryCountdownSticker[];
  }) => void;
};

/* ================================================================== */
/*  YORDAMCHILAR                                                       */
/* ================================================================== */
const MAX_ITEMS = 15;
const STORY_LIFETIME_H = 24;
const IMAGE_DURATIONS = [5, 7, 10];
const FRIENDS_GREEN = '#22c55e';
const NEUTRAL_FILL = 'rgba(127,127,127,0.16)';

let idCounter = 0;
const nextId = () => `st_${Date.now()}_${idCounter++}`;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const pad2 = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      }
    );
  });

const URL_RE = /^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(:\d+)?([/?#]\S*)?$/i;
const normalizeUrl = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  const full = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return URL_RE.test(full) ? full : null;
};

function formatRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Tugadi';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d} kun ${h} soat`;
  if (h > 0) return `${h} soat ${m} daq`;
  if (m > 0) return `${m} daq ${s} soniya`;
  return `${s} soniya`;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'hozirgina';
  if (m < 60) return `${m} daq oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}

const labelFromPlace = (p?: Location.LocationGeocodedAddress | null, fallback = 'Mening joylashuvim') => {
  if (!p) return fallback;
  const parts = [p.city ?? p.subregion ?? p.district ?? p.name, p.region ?? p.country].filter(Boolean) as string[];
  const uniq = parts.filter((v, i) => parts.indexOf(v) === i);
  return uniq.length ? uniq.join(', ') : fallback;
};

const TOOLS: { key: Exclude<SheetKey, null | 'tray' | 'privacy'>; label: string; Icon: any; color: string }[] = [
  { key: 'text', label: 'Matn', Icon: TypeIcon, color: '#8b5cf6' },
  { key: 'mention', label: 'Belgilash', Icon: AtSign, color: '#3b82f6' },
  { key: 'location', label: 'Joylashuv', Icon: MapPin, color: '#ef4444' },
  { key: 'poll', label: "So'rovnoma", Icon: BarChart3, color: '#f59e0b' },
  { key: 'question', label: 'Savol', Icon: HelpCircle, color: '#ec4899' },
  { key: 'music', label: 'Musiqa', Icon: MusicIcon, color: '#10b981' },
  { key: 'link', label: 'Havola', Icon: Link2, color: '#06b6d4' },
  { key: 'countdown', label: 'Sanoq', Icon: Timer, color: '#f97316' },
];

const COUNTDOWN_OPTIONS = [
  { label: '1 soat', ms: 3600000 },
  { label: '6 soat', ms: 6 * 3600000 },
  { label: '1 kun', ms: 24 * 3600000 },
  { label: '3 kun', ms: 3 * 24 * 3600000 },
  { label: '1 hafta', ms: 7 * 24 * 3600000 },
];

const useStyles = () => {
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);
  return { st, colors };
};

/* ================================================================== */
/*  COUNTDOWN PREVIEW                                                  */
/* ================================================================== */
const CountdownPreview: React.FC<{ title: string; endsAt: string }> = ({ title, endsAt }) => {
  const [remaining, setRemaining] = useState(() => formatRemaining(endsAt));
  useEffect(() => {
    setRemaining(formatRemaining(endsAt));
    const t = setInterval(() => setRemaining(formatRemaining(endsAt)), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <View style={sk.countdownCard}>
      <Text style={sk.countdownTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={sk.countdownValue}>{remaining}</Text>
    </View>
  );
};

/* ================================================================== */
/*  SURILADIGAN STIKER                                                 */
/*  - markaz nuqtasi bo'yicha joylashadi (x,y = markaz)                */
/*  - eng so'nggi props doim ref orqali o'qiladi (eskirgan closure yo'q)*/
/*  - tap = tahrirlash, ikki barmoq = kattalashtirish/burish           */
/* ================================================================== */
type DragProps = {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  frameW: number;
  frameH: number;
  resizable: boolean;
  selected: boolean;
  trashY: number;
  onSelect: (id: string) => void;
  onTap: (id: string) => void;
  onCommit: (id: string, patch: Record<string, number>) => void;
  onDragState: (active: boolean, overTrash: boolean) => void;
  onDelete: (id: string) => void;
  children: React.ReactNode;
};

const DraggableSticker: React.FC<DragProps> = (props) => {
  const latest = useRef(props);
  latest.current = props;

  const pos = useRef({ x: props.x * props.frameW, y: props.y * props.frameH });
  const pan = useRef(new Animated.ValueXY(pos.current)).current;
  const scaleV = useRef(new Animated.Value(props.scale)).current;
  const rotV = useRef(new Animated.Value(props.rotation)).current;
  const cur = useRef({ scale: props.scale, rotation: props.rotation });
  const dragging = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (dragging.current) return;
    pos.current = { x: props.x * props.frameW, y: props.y * props.frameH };
    pan.setValue(pos.current);
    cur.current = { scale: props.scale, rotation: props.rotation };
    scaleV.setValue(props.scale);
    rotV.setValue(props.rotation);
  }, [props.x, props.y, props.scale, props.rotation, props.frameW, props.frameH]);

  const g = useRef({
    startX: 0,
    startY: 0,
    t0: 0,
    moved: false,
    wasPinch: false,
    pinch: null as null | { d: number; a: number; s: number; r: number },
  }).current;

  const dist = (t: any[]) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  const ang = (t: any[]) => (Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX) * 180) / Math.PI;

  const finish = (cancelled: boolean, moveY: number) => {
    const p = latest.current;
    dragging.current = false;
    p.onDragState(false, false);
    const isTap = !cancelled && !g.moved && Date.now() - g.t0 < 300;
    if (isTap) {
      p.onTap(p.id);
      return;
    }
    if (!cancelled && !g.wasPinch && moveY > p.trashY) {
      p.onDelete(p.id);
      return;
    }
    const patch: Record<string, number> = { x: pos.current.x / p.frameW, y: pos.current.y / p.frameH };
    if (p.resizable) {
      patch.scale = cur.current.scale;
      patch.rotation = cur.current.rotation;
    }
    p.onCommit(p.id, patch);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const p = latest.current;
        dragging.current = true;
        g.startX = pos.current.x;
        g.startY = pos.current.y;
        g.t0 = Date.now();
        g.moved = false;
        g.wasPinch = false;
        g.pinch = null;
        p.onSelect(p.id);
      },
      onPanResponderMove: (evt, gs) => {
        const p = latest.current;
        const touches = evt.nativeEvent.touches as any[];
        if (p.resizable && touches.length >= 2) {
          if (!g.pinch) g.pinch = { d: dist(touches), a: ang(touches), s: cur.current.scale, r: cur.current.rotation };
          g.wasPinch = true;
          g.moved = true;
          const s = clamp(g.pinch.s * (dist(touches) / g.pinch.d), 0.4, 4);
          const r = g.pinch.r + (ang(touches) - g.pinch.a);
          cur.current = { scale: s, rotation: r };
          scaleV.setValue(s);
          rotV.setValue(r);
          return;
        }
        if (g.wasPinch) return;
        if (!g.moved && Math.hypot(gs.dx, gs.dy) < 6) return;
        g.moved = true;
        const nx = clamp(g.startX + gs.dx, 0, p.frameW);
        const ny = clamp(g.startY + gs.dy, 0, p.frameH);
        pos.current = { x: nx, y: ny };
        pan.setValue(pos.current);
        p.onDragState(true, gs.moveY > p.trashY);
      },
      onPanResponderRelease: (_e, gs) => finish(false, gs.moveY),
      onPanResponderTerminate: (_e, gs) => finish(true, gs.moveY),
    })
  ).current;

  const rot = rotV.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      {...responder.panHandlers}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[
        sk.stickerWrap,
        {
          maxWidth: props.frameW * 0.92,
          opacity: size ? 1 : 0,
          marginLeft: size ? -size.w / 2 : 0,
          marginTop: size ? -size.h / 2 : 0,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: scaleV }, { rotate: rot }],
        },
      ]}
    >
      <View style={[sk.stickerInner, props.selected && sk.stickerSelected]}>{props.children}</View>
    </Animated.View>
  );
};

/* ================================================================== */
/*  PASTKI VARAQ (bottom sheet) — pastga surib yopiladi                */
/* ================================================================== */
const Sheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  children: React.ReactNode;
}> = ({ visible, onClose, bottomInset, children }) => {
  const { st } = useStyles();
  const anim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [visible]);

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gs) => {
        if (gs.dy > 0) dragY.setValue(gs.dy);
      },
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy > 90 || gs.vy > 0.9) {
          Keyboard.dismiss();
          closeRef.current();
        } else {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  const translateY = Animated.add(anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }), dragY);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[st.backdrop, { opacity: anim }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
      </Animated.View>
      <KeyboardAvoidingView
        pointerEvents="box-none"
        style={st.sheetKav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[st.sheet, { paddingBottom: bottomInset + spacing.lg, transform: [{ translateY }] }]}>
          <View {...pr.panHandlers} style={st.sheetHandleWrap}>
            <View style={st.sheetHandle} />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const SheetFooter: React.FC<{
  onCancel: () => void;
  onDone?: () => void;
  doneLabel?: string;
  disabled?: boolean;
}> = ({ onCancel, onDone, doneLabel = "Qo'shish", disabled }) => {
  const { st } = useStyles();
  return (
    <View style={st.sheetFooter}>
      <TouchableOpacity onPress={onCancel} style={st.cancelBtn}>
        <Text style={st.cancelText}>Bekor qilish</Text>
      </TouchableOpacity>
      {onDone && (
        <TouchableOpacity onPress={onDone} disabled={disabled} style={[st.doneBtn, disabled && { opacity: 0.4 }]}>
          <Text style={st.doneText}>{doneLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/* ================================================================== */
/*  ASOSIY KOMPONENT                                                   */
/* ================================================================== */
const StoryComposerModal: React.FC<Props> = ({ uri, mediaType, uploading, onCancel, onPublish, searchTracks }) => {
  const { st, colors } = useStyles();
  const { friends } = useApp();
  const { frameW, frameH, insets } = useStoryFrameMetrics();
  const topPad = Math.max((insets as any)?.top ?? 0, 10) + 4;
  const botInset = Math.max((insets as any)?.bottom ?? 0, 8);

  // ---- Asosiy holat ----
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const undoIds = useRef<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<StoryPrivacy>('public');
  const [durationSec, setDurationSec] = useState(7);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState({ active: false, overTrash: false });

  // ---- Vaqt (boshlanish / tugash) ----
  const [startAt] = useState(() => new Date());
  const endAt = useMemo(() => new Date(startAt.getTime() + STORY_LIFETIME_H * 3600000), [startAt]);
  const previewMs = mediaType === 'image' ? durationSec * 1000 : 15000;
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: previewMs, easing: Easing.linear, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [previewMs]);
  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // ---- Chiqindi zonasi koordinatasi ----
  const overlayRef = useRef<View>(null);
  const [frameWin, setFrameWin] = useState<{ y: number; h: number } | null>(null);
  const trashY = (frameWin ? frameWin.y + frameWin.h : Dimensions.get('window').height) - (botInset + 130);
  const measureFrame = () => {
    requestAnimationFrame(() => {
      overlayRef.current?.measureInWindow((_x, y, _w, h) => {
        if (h > 0) setFrameWin({ y, h });
      });
    });
  };

  // ---- Draftlar ----
  const [draftText, setDraftText] = useState('');
  const [draftFontIdx, setDraftFontIdx] = useState(0);
  const [draftColorIdx, setDraftColorIdx] = useState(0);
  const [draftBgMode, setDraftBgMode] = useState<'none' | 'solid' | 'soft'>('none');
  const [draftPollQuestion, setDraftPollQuestion] = useState('');
  const [draftPollA, setDraftPollA] = useState('Ha');
  const [draftPollB, setDraftPollB] = useState("Yo'q");
  const [draftPrompt, setDraftPrompt] = useState('Menga savol bering!');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftLabel, setDraftLabel] = useState("Havolani ko'rish");
  const [urlError, setUrlError] = useState(false);
  const [draftCdTitle, setDraftCdTitle] = useState('');
  const [draftCdIdx, setDraftCdIdx] = useState(2);
  const [mentionSearch, setMentionSearch] = useState('');
  const [musicSearch, setMusicSearch] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [locQuery, setLocQuery] = useState('');
  const [locBusy, setLocBusy] = useState(false);
  const [locSearching, setLocSearching] = useState(false);
  const [locResults, setLocResults] = useState<{ label: string; latitude: number; longitude: number }[]>([]);

  // ---- Elementlar bilan ishlash ----
  const addItem = (it: Item, replaceKind?: Kind) => {
    if (!replaceKind && itemsRef.current.length >= MAX_ITEMS) {
      Alert.alert('Limit', `Bir storyga ko'pi bilan ${MAX_ITEMS} ta stiker qo'shish mumkin.`);
      return;
    }
    setItems((prev) => [...(replaceKind ? prev.filter((p) => p.kind !== replaceKind) : prev), it]);
    undoIds.current.push(it.s.id);
  };

  const patchItem = (id: string, patch: Record<string, any>, toFront = false) =>
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.s.id === id);
      if (idx < 0) return prev;
      const updated = { ...prev[idx], s: { ...prev[idx].s, ...patch } } as Item;
      if (!toFront) return prev.map((it, i) => (i === idx ? updated : it));
      return [...prev.filter((_, i) => i !== idx), updated];
    });

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.s.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  const handleUndo = () => {
    while (undoIds.current.length) {
      const id = undoIds.current.pop() as string;
      if (itemsRef.current.some((i) => i.s.id === id)) {
        removeItem(id);
        return;
      }
    }
  };

  const handleDragState = (active: boolean, overTrash: boolean) =>
    setDragState((p) => (p.active === active && p.overTrash === overTrash ? p : { active, overTrash }));

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheet(null);
    setEditingId(null);
  };

  const confirmCancel = () => {
    if (itemsRef.current.length === 0) {
      onCancel();
      return;
    }
    Alert.alert('Storyni bekor qilasizmi?', "Qo'shilgan stikerlar o'chib ketadi.", [
      { text: 'Davom etish', style: 'cancel' },
      { text: 'Chiqish', style: 'destructive', onPress: onCancel },
    ]);
  };

  const handleBack = () => {
    if (sheet) return closeSheet();
    if (selectedId) return setSelectedId(null);
    confirmCancel();
  };

  // ---- Asboblar ochilishi ----
  const openTool = (key: Exclude<SheetKey, null | 'tray' | 'privacy'>) => {
    if (itemsRef.current.length >= MAX_ITEMS && key !== 'location') {
      Alert.alert('Limit', `Bir storyga ko'pi bilan ${MAX_ITEMS} ta stiker qo'shish mumkin.`);
      return;
    }
    setEditingId(null);
    switch (key) {
      case 'text':
        setDraftText('');
        setDraftFontIdx(0);
        setDraftColorIdx(0);
        setDraftBgMode('none');
        break;
      case 'mention':
        setMentionSearch('');
        break;
      case 'location':
        setLocQuery('');
        setLocResults([]);
        break;
      case 'poll':
        setDraftPollQuestion('');
        setDraftPollA('Ha');
        setDraftPollB("Yo'q");
        break;
      case 'question':
        setDraftPrompt('Menga savol bering!');
        break;
      case 'music':
        setMusicSearch('');
        break;
      case 'link':
        setDraftUrl('');
        setDraftLabel("Havolani ko'rish");
        setUrlError(false);
        break;
      case 'countdown':
        setDraftCdTitle('');
        setDraftCdIdx(2);
        break;
    }
    setSheet(key);
  };

  // Stikerga bosilganda — tahrirlash
  const handleTap = (id: string) => {
    setSelectedId(id);
    const it = itemsRef.current.find((i) => i.s.id === id);
    if (!it) return;
    switch (it.kind) {
      case 'text':
        setEditingId(id);
        setDraftText(it.s.text);
        setDraftFontIdx(Math.max(0, STORY_FONTS.findIndex((f) => f.fontFamily === it.s.fontFamily)));
        setDraftColorIdx(Math.max(0, (STORY_TEXT_COLORS as any[]).indexOf(it.s.color)));
        setDraftBgMode(it.s.bgMode as any);
        setSheet('text');
        break;
      case 'poll':
        setEditingId(id);
        setDraftPollQuestion(it.s.question);
        setDraftPollA(it.s.optionA);
        setDraftPollB(it.s.optionB);
        setSheet('poll');
        break;
      case 'question':
        setEditingId(id);
        setDraftPrompt(it.s.prompt);
        setSheet('question');
        break;
      case 'link':
        setEditingId(id);
        setDraftUrl(it.s.url);
        setDraftLabel(it.s.label);
        setUrlError(false);
        setSheet('link');
        break;
      default:
        break;
    }
  };

  // ---- Commit funksiyalari ----
  const commitText = () => {
    const text = draftText.trim();
    if (!text) {
      if (editingId) removeItem(editingId);
      closeSheet();
      return;
    }
    const fontFamily = STORY_FONTS[draftFontIdx].fontFamily as string;
    const color = STORY_TEXT_COLORS[draftColorIdx] as any;
    if (editingId) {
      patchItem(editingId, { text, fontFamily, color, bgMode: draftBgMode });
    } else {
      addItem({
        kind: 'text',
        s: { id: nextId(), text, x: 0.5, y: 0.42, fontFamily, color, bgMode: draftBgMode, scale: 1, rotation: 0 } as StoryTextSticker,
      });
    }
    closeSheet();
  };

  const addMention = (friendId: string, friendName: string) => {
    addItem({ kind: 'mention', s: { id: nextId(), friendId, friendName, x: 0.5, y: 0.3 } as StoryMentionSticker });
    closeSheet();
  };

  const commitLocation = (label: string, latitude?: number, longitude?: number) => {
    addItem({ kind: 'location', s: { id: nextId(), label, x: 0.5, y: 0.2, latitude, longitude } as StoryLocationStickerEx }, 'location');
    closeSheet();
  };

  const useCurrentLocation = async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(
          'Ruxsat kerak',
          "Joylashuvni qo'shish uchun ilovaga joylashuvdan foydalanishga ruxsat bering.",
          perm.canAskAgain
            ? [{ text: 'Yopish', style: 'cancel' }]
            : [
                { text: 'Bekor qilish', style: 'cancel' },
                { text: 'Sozlamalar', onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert("GPS o'chiq", "Telefon sozlamalarida joylashuv xizmatini yoqing.");
        return;
      }
      let pos: Location.LocationObject | null = null;
      try {
        pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 12000);
      } catch {
        pos = await Location.getLastKnownPositionAsync();
      }
      if (!pos) {
        Alert.alert('Joylashuv topilmadi', "Qayta urinib ko'ring yoki joy nomini qo'lda yozing.");
        return;
      }
      const { latitude, longitude } = pos.coords;
      const places = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
      commitLocation(labelFromPlace(places[0]), latitude, longitude);
    } catch {
      Alert.alert('Xatolik', "Joylashuvni aniqlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setLocBusy(false);
    }
  };

  // Joy nomi bo'yicha qidirish (debounce)
  useEffect(() => {
    if (sheet !== 'location') return;
    const q = locQuery.trim();
    if (q.length < 3) {
      setLocResults([]);
      return;
    }
    let cancel = false;
    const t = setTimeout(async () => {
      setLocSearching(true);
      try {
        const found = (await Location.geocodeAsync(q)).slice(0, 4);
        const out = await Promise.all(
          found.map(async (f) => {
            const rev = await Location.reverseGeocodeAsync({ latitude: f.latitude, longitude: f.longitude }).catch(() => []);
            return { label: labelFromPlace(rev[0], q), latitude: f.latitude, longitude: f.longitude };
          })
        );
        const seen = new Set<string>();
        const uniq = out.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)));
        if (!cancel) setLocResults(uniq);
      } catch {
        if (!cancel) setLocResults([]);
      } finally {
        if (!cancel) setLocSearching(false);
      }
    }, 500);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [locQuery, sheet]);

  const commitPoll = () => {
    const question = draftPollQuestion.trim();
    const optionA = draftPollA.trim();
    const optionB = draftPollB.trim();
    if (!question || !optionA || !optionB) return;
    if (editingId) patchItem(editingId, { question, optionA, optionB });
    else addItem({ kind: 'poll', s: { id: nextId(), question, optionA, optionB, x: 0.5, y: 0.5, scale: 1, rotation: 0 } });
    closeSheet();
  };

  const commitQuestion = () => {
    const prompt = draftPrompt.trim();
    if (!prompt) return;
    if (editingId) patchItem(editingId, { prompt });
    else addItem({ kind: 'question', s: { id: nextId(), prompt, x: 0.5, y: 0.5, scale: 1, rotation: 0 } });
    closeSheet();
  };

  const addMusic = (t: MusicTrack) => {
    addItem({ kind: 'music', s: { id: nextId(), trackId: t.id, title: t.title, artist: t.artist, x: 0.5, y: 0.25, scale: 1, rotation: 0 } });
    closeSheet();
  };

  useEffect(() => {
    if (sheet !== 'music') return;
    let cancel = false;
    setTracksLoading(true);
    const t = setTimeout(
      async () => {
        try {
          const q = musicSearch.trim();
          const res = searchTracks
            ? await searchTracks(q)
            : MOCK_TRACKS.filter((x) => `${x.title} ${x.artist}`.toLowerCase().includes(q.toLowerCase()));
          if (!cancel) setTracks(res);
        } catch {
          if (!cancel) setTracks([]);
        } finally {
          if (!cancel) setTracksLoading(false);
        }
      },
      searchTracks ? 350 : 0
    );
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [musicSearch, sheet, searchTracks]);

  const commitLink = () => {
    const url = normalizeUrl(draftUrl);
    if (!url) {
      setUrlError(true);
      return;
    }
    const label = draftLabel.trim() || "Havolani ko'rish";
    if (editingId) patchItem(editingId, { url, label });
    else addItem({ kind: 'link', s: { id: nextId(), url, label, x: 0.5, y: 0.75, scale: 1, rotation: 0 } });
    closeSheet();
  };

  const commitCountdown = () => {
    const title = draftCdTitle.trim();
    if (!title) return;
    addItem({
      kind: 'countdown',
      s: {
        id: nextId(),
        title,
        endsAt: new Date(Date.now() + COUNTDOWN_OPTIONS[draftCdIdx].ms).toISOString(),
        x: 0.5,
        y: 0.35,
        scale: 1,
        rotation: 0,
      },
    });
    closeSheet();
  };

  // ---- Nashr ----
  const pick = (kind: Kind) => items.filter((i) => i.kind === kind).map((i) => i.s) as any[];
  const legacyCaption = useMemo(
    () => items.filter((i) => i.kind === 'text').map((i) => (i.s as StoryTextSticker).text).join(' \u00b7 '),
    [items]
  );

  const handlePublish = () => {
    if (uploading) return;
    Keyboard.dismiss();
    onPublish({
      caption: legacyCaption,
      privacy,
      durationSec: mediaType === 'image' ? durationSec : null,
      textStickers: pick('text'),
      mentionStickers: pick('mention'),
      locationSticker: pick('location')[0] ?? null,
      pollStickers: pick('poll'),
      questionStickers: pick('question'),
      musicStickers: pick('music'),
      linkStickers: pick('link'),
      countdownStickers: pick('countdown'),
    });
  };

  // ---- Pastdan tepaga surish (stikerlar panelini ochish) ----
  const openTrayRef = useRef(() => {});
  openTrayRef.current = () => {
    setSelectedId(null);
    setSheet('tray');
  };
  const swipeZone = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => gs.dy < -10 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy < -30 || gs.vy < -0.6) openTrayRef.current();
      },
    })
  ).current;

  // ---- Do'stlar ro'yxati ----
  const friendList: { id: string; name: string }[] = ((friends as any) ?? []) as any;
  const mentionedIds = new Set(items.filter((i) => i.kind === 'mention').map((i) => (i.s as StoryMentionSticker).friendId));
  const filteredFriends = friendList.filter(
    (f) => !mentionedIds.has(f.id) && (f.name ?? '').toLowerCase().includes(mentionSearch.trim().toLowerCase())
  );

  // ---- Stiker ko'rinishi ----
  const renderSticker = (it: Item) => {
    switch (it.kind) {
      case 'location':
        return (
          <View style={sk.locationChip}>
            <MapPin size={14} color="#fff" strokeWidth={2.5} />
            <Text style={sk.locationChipText}>{it.s.label}</Text>
          </View>
        );
      case 'mention':
        return (
          <View style={sk.mentionChip}>
            <AtSign size={13} color={colors.primary} strokeWidth={2.5} />
            <Text style={sk.mentionChipText}>{it.s.friendName}</Text>
          </View>
        );
      case 'text': {
        const t = it.s;
        const black = t.color === '#000000';
        return (
          <View
            style={[
              t.bgMode === 'solid' && [sk.textBgSolid, { backgroundColor: black ? '#fff' : '#000' }],
              t.bgMode === 'soft' && sk.textBgSoft,
            ]}
          >
            <Text
              style={{
                fontFamily: t.fontFamily,
                color: t.bgMode === 'solid' ? (black ? '#000' : '#fff') : t.color,
                fontSize: 26,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {t.text}
            </Text>
          </View>
        );
      }
      case 'poll':
        return (
          <View style={sk.pollCard}>
            <Text style={sk.pollQuestion}>{it.s.question}</Text>
            <View style={sk.pollOptionsRow}>
              <View style={sk.pollOptionPill}>
                <Text style={sk.pollOptionText}>{it.s.optionA}</Text>
              </View>
              <View style={sk.pollOptionPill}>
                <Text style={sk.pollOptionText}>{it.s.optionB}</Text>
              </View>
            </View>
          </View>
        );
      case 'question':
        return (
          <View style={sk.questionCard}>
            <HelpCircle size={16} color="#fff" strokeWidth={2.5} />
            <Text style={sk.questionText}>{it.s.prompt}</Text>
          </View>
        );
      case 'music':
        return (
          <View style={sk.musicChip}>
            <MusicIcon size={14} color="#111" strokeWidth={2.5} />
            <View style={{ flexShrink: 1 }}>
              <Text style={sk.musicTitle} numberOfLines={1}>
                {it.s.title}
              </Text>
              <Text style={sk.musicArtist} numberOfLines={1}>
                {it.s.artist}
              </Text>
            </View>
          </View>
        );
      case 'link':
        return (
          <View style={sk.linkChip}>
            <Link2 size={14} color="#fff" strokeWidth={2.5} />
            <Text style={sk.linkChipText}>{it.s.label}</Text>
          </View>
        );
      case 'countdown':
        return <CountdownPreview title={it.s.title} endsAt={it.s.endsAt} />;
    }
  };

  const draftTextBlack = STORY_TEXT_COLORS[draftColorIdx] === '#000000';

  return (
    <Modal visible animationType="slide" onRequestClose={handleBack} statusBarTranslucent>
      <View style={st.root}>
        <StoryFrame width={frameW} height={frameH}>
          {/* Fon: bosilsa tanlov bekor bo'ladi */}
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setSelectedId(null)}>
            <StoryMedia uri={uri} mediaType={mediaType} width={frameW} height={frameH} loop zoomEnabled />
          </TouchableOpacity>

          <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={st.topGradient} pointerEvents="none" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={st.bottomGradient} pointerEvents="none" />

          {/* Pastdan tepaga surish zonasi (stikerlardan pastda turadi) */}
          <View style={st.swipeZone} {...swipeZone.panHandlers} />

          {/* Stikerlar */}
          <View ref={overlayRef} onLayout={measureFrame} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {items.map((it) => {
              const s: any = it.s;
              return (
                <DraggableSticker
                  key={s.id}
                  id={s.id}
                  x={s.x}
                  y={s.y}
                  scale={s.scale ?? 1}
                  rotation={s.rotation ?? 0}
                  frameW={frameW}
                  frameH={frameH}
                  trashY={trashY}
                  resizable={it.kind !== 'mention' && it.kind !== 'location'}
                  selected={selectedId === s.id}
                  onSelect={setSelectedId}
                  onTap={handleTap}
                  onCommit={(id, patch) => patchItem(id, patch, true)}
                  onDragState={handleDragState}
                  onDelete={removeItem}
                >
                  {renderSticker(it)}
                </DraggableSticker>
              );
            })}
          </View>

          {/* ===== HEADER: progress + vaqt + amallar ===== */}
          <View style={[st.header, { paddingTop: topPad, opacity: dragState.active ? 0 : 1 }]} pointerEvents={dragState.active ? 'none' : 'box-none'}>
            <View style={st.progressTrack}>
              <Animated.View style={[st.progressFill, { width: fillWidth }]} />
            </View>
            <View style={st.headerRow}>
              <TouchableOpacity onPress={confirmCancel} style={st.roundBtn} hitSlop={8}>
                <X size={20} color="#fff" strokeWidth={2.6} />
              </TouchableOpacity>
              <View style={st.headerInfo}>
                <Text style={st.headerTitle}>Yangi story</Text>
                <View style={st.headerMetaRow}>
                  <Clock size={11} color="rgba(255,255,255,0.85)" strokeWidth={2.4} />
                  <Text style={st.headerMeta} numberOfLines={1}>
                    {clock(startAt)} → ertaga {clock(endAt)} · {STORY_LIFETIME_H} soat
                  </Text>
                </View>
              </View>
              <View style={st.headerActions}>
                {selectedId && (
                  <TouchableOpacity onPress={() => removeItem(selectedId)} style={[st.roundBtn, { backgroundColor: 'rgba(255,59,48,0.85)' }]} hitSlop={8}>
                    <Trash2 size={18} color="#fff" strokeWidth={2.4} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleUndo} disabled={items.length === 0} style={[st.roundBtn, items.length === 0 && { opacity: 0.35 }]} hitSlop={8}>
                  <Undo2 size={18} color="#fff" strokeWidth={2.4} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openTool('text')} style={st.roundBtn} hitSlop={8}>
                  <TypeIcon size={18} color="#fff" strokeWidth={2.4} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Chiqindi zonasi */}
          {dragState.active && (
            <View pointerEvents="none" style={[st.trashZone, { bottom: botInset + 40 }, dragState.overTrash && st.trashZoneActive]}>
              <Trash2 size={22} color="#fff" strokeWidth={2.5} />
            </View>
          )}

          {/* ===== FOOTER ===== */}
          <View style={[st.footer, { paddingBottom: botInset + spacing.sm, opacity: dragState.active ? 0 : 1 }]} pointerEvents={dragState.active ? 'none' : 'box-none'}>
            <TouchableOpacity
              onPress={() => setSheet('privacy')}
              style={[st.privacyChip, privacy === 'close_friends' && { backgroundColor: FRIENDS_GREEN }]}
              activeOpacity={0.8}
            >
              {privacy === 'public' ? <Globe size={15} color="#fff" strokeWidth={2.5} /> : <Users2 size={15} color="#fff" strokeWidth={2.5} />}
              <Text style={st.privacyChipText}>{privacy === 'public' ? 'Hammaga' : "Yaqin do'stlar"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => openTrayRef.current()} style={st.trayBtn} activeOpacity={0.8}>
              <ChevronUp size={22} color="#fff" strokeWidth={2.8} />
            </TouchableOpacity>

            <TouchableOpacity style={[st.publishBtn, uploading && { opacity: 0.7 }]} onPress={handlePublish} disabled={uploading} activeOpacity={0.85}>
              {uploading ? (
                <ActivityIndicator color="#111" size="small" />
              ) : (
                <>
                  <Send size={16} color="#111" strokeWidth={2.6} />
                  <Text style={st.publishBtnText}>Joylash</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </StoryFrame>

        {/* ================= PASTKI VARAQLAR ================= */}

        {/* Stikerlar paneli (ochilib-yopiladigan) */}
        <Sheet visible={sheet === 'tray'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Stikerlar</Text>
          <View style={st.toolGrid}>
            {TOOLS.map((t) => (
              <TouchableOpacity key={t.key} style={st.toolCell} onPress={() => openTool(t.key)} activeOpacity={0.7}>
                <View style={[st.toolIcon, { backgroundColor: t.color }]}>
                  <t.Icon size={22} color="#fff" strokeWidth={2.4} />
                </View>
                <Text style={st.toolLabel} numberOfLines={1}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {mediaType === 'image' && (
            <>
              <Text style={[st.fieldLabel, { marginTop: spacing.md }]}>Ko'rsatish vaqti</Text>
              <View style={st.chipRow}>
                {IMAGE_DURATIONS.map((d) => (
                  <TouchableOpacity key={d} style={[st.chip, durationSec === d && st.chipActive]} onPress={() => setDurationSec(d)}>
                    <Text style={[st.chipText, durationSec === d && st.chipTextActive]}>{d} soniya</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </Sheet>

        {/* Maxfiylik */}
        <Sheet visible={sheet === 'privacy'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Kim ko'ra oladi?</Text>
          {(
            [
              { key: 'public', title: 'Hammaga', sub: "Barcha obunachilar va do'stlar", Icon: Globe, color: colors.primary },
              { key: 'close_friends', title: "Yaqin do'stlar", sub: "Faqat yaqin do'stlar ro'yxatingizdagilar", Icon: Users2, color: FRIENDS_GREEN },
            ] as const
          ).map((o) => (
            <TouchableOpacity
              key={o.key}
              style={st.listRow}
              onPress={() => {
                setPrivacy(o.key);
                closeSheet();
              }}
            >
              <View style={[st.rowIcon, { backgroundColor: o.color }]}>
                <o.Icon size={18} color="#fff" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.rowTitle}>{o.title}</Text>
                <Text style={st.rowSub}>{o.sub}</Text>
              </View>
              {privacy === o.key && <Check size={20} color={o.color} strokeWidth={3} />}
            </TouchableOpacity>
          ))}
        </Sheet>

        {/* Belgilash (mention) */}
        <Sheet visible={sheet === 'mention'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Do'stni belgilash</Text>
          <View style={st.searchRow}>
            <Search size={16} color={colors.textFaint} strokeWidth={2} />
            <TextInput
              style={st.searchInput}
              placeholder="Ism bo'yicha qidirish..."
              placeholderTextColor={colors.textFaint}
              value={mentionSearch}
              onChangeText={setMentionSearch}
              autoCorrect={false}
            />
          </View>
          <FlatList
            style={{ maxHeight: 280 }}
            data={filteredFriends}
            keyExtractor={(f) => String(f.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={st.listRow} onPress={() => addMention(item.id, item.name)}>
                <View style={[st.avatar, { backgroundColor: colors.primary }]}>
                  <Text style={st.avatarText}>{(item.name ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={st.rowTitle}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={st.emptyText}>{friendList.length === 0 ? "Avval do'st qo'shing" : 'Hech kim topilmadi'}</Text>
            }
          />
        </Sheet>

        {/* Joylashuv */}
        <Sheet visible={sheet === 'location'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Joylashuv</Text>
          <TouchableOpacity style={st.listRow} onPress={useCurrentLocation} disabled={locBusy}>
            <View style={[st.rowIcon, { backgroundColor: '#ef4444' }]}>
              {locBusy ? <ActivityIndicator size="small" color="#fff" /> : <Navigation size={18} color="#fff" strokeWidth={2.4} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.rowTitle}>Joriy joylashuvim</Text>
              <Text style={st.rowSub}>GPS orqali aniqlanadi</Text>
            </View>
          </TouchableOpacity>
          <View style={st.searchRow}>
            <Search size={16} color={colors.textFaint} strokeWidth={2} />
            <TextInput
              style={st.searchInput}
              placeholder="Joy nomini yozing..."
              placeholderTextColor={colors.textFaint}
              value={locQuery}
              onChangeText={setLocQuery}
              maxLength={60}
            />
            {locSearching && <ActivityIndicator size="small" color={colors.textFaint} />}
          </View>
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {locResults.map((r, i) => (
              <TouchableOpacity key={`${r.label}-${i}`} style={st.listRow} onPress={() => commitLocation(r.label, r.latitude, r.longitude)}>
                <MapPin size={18} color={colors.primary} strokeWidth={2.4} />
                <Text style={st.rowTitle}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            {locQuery.trim().length > 0 && (
              <TouchableOpacity style={st.listRow} onPress={() => commitLocation(locQuery.trim())}>
                <MapPin size={18} color={colors.textFaint} strokeWidth={2.4} />
                <Text style={st.rowTitle}>"{locQuery.trim()}" ni qo'shish</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Sheet>

        {/* So'rovnoma */}
        <Sheet visible={sheet === 'poll'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>So'rovnoma</Text>
          <Text style={st.fieldLabel}>Savol</Text>
          <TextInput
            style={st.sheetInput}
            placeholder="Masalan: Bugun sport zaliga borayinmi?"
            placeholderTextColor={colors.textFaint}
            value={draftPollQuestion}
            onChangeText={setDraftPollQuestion}
            maxLength={80}
            autoFocus
          />
          <View style={st.twoCols}>
            <TextInput style={[st.sheetInput, { flex: 1 }]} placeholder="A variant" placeholderTextColor={colors.textFaint} value={draftPollA} onChangeText={setDraftPollA} maxLength={24} />
            <TextInput style={[st.sheetInput, { flex: 1 }]} placeholder="B variant" placeholderTextColor={colors.textFaint} value={draftPollB} onChangeText={setDraftPollB} maxLength={24} />
          </View>
          <SheetFooter
            onCancel={closeSheet}
            onDone={commitPoll}
            doneLabel={editingId ? 'Saqlash' : "Qo'shish"}
            disabled={!draftPollQuestion.trim() || !draftPollA.trim() || !draftPollB.trim()}
          />
        </Sheet>

        {/* Savol */}
        <Sheet visible={sheet === 'question'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Savol stikeri</Text>
          <Text style={st.fieldLabel}>Savol matni</Text>
          <TextInput
            style={st.sheetInput}
            placeholder="Menga savol bering!"
            placeholderTextColor={colors.textFaint}
            value={draftPrompt}
            onChangeText={setDraftPrompt}
            maxLength={80}
            autoFocus
          />
          <SheetFooter onCancel={closeSheet} onDone={commitQuestion} doneLabel={editingId ? 'Saqlash' : "Qo'shish"} disabled={!draftPrompt.trim()} />
        </Sheet>

        {/* Musiqa */}
        <Sheet visible={sheet === 'music'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Musiqa qo'shish</Text>
          <View style={st.searchRow}>
            <Search size={16} color={colors.textFaint} strokeWidth={2} />
            <TextInput
              style={st.searchInput}
              placeholder="Qo'shiq yoki ijrochi qidirish..."
              placeholderTextColor={colors.textFaint}
              value={musicSearch}
              onChangeText={setMusicSearch}
            />
            {tracksLoading && <ActivityIndicator size="small" color={colors.textFaint} />}
          </View>
          <FlatList
            style={{ maxHeight: 280 }}
            data={tracks}
            keyExtractor={(t) => t.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={st.listRow} onPress={() => addMusic(item)}>
                <View style={[st.rowIcon, { backgroundColor: '#10b981' }]}>
                  <MusicIcon size={16} color="#fff" strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowTitle}>{item.title}</Text>
                  <Text style={st.rowSub}>{item.artist}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={!tracksLoading ? <Text style={st.emptyText}>Hech narsa topilmadi</Text> : null}
          />
        </Sheet>

        {/* Havola */}
        <Sheet visible={sheet === 'link'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Havola</Text>
          <Text style={st.fieldLabel}>Havola manzili</Text>
          <TextInput
            style={[st.sheetInput, urlError && { borderColor: '#ff3b30', borderWidth: 1 }]}
            placeholder="https://misol.uz"
            placeholderTextColor={colors.textFaint}
            value={draftUrl}
            onChangeText={(v) => {
              setDraftUrl(v);
              setUrlError(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={200}
            autoFocus
          />
          {urlError && <Text style={st.errorText}>Havola noto'g'ri. Masalan: misol.uz yoki https://misol.uz</Text>}
          <Text style={[st.fieldLabel, { marginTop: spacing.md }]}>Ko'rsatiladigan matn</Text>
          <TextInput style={st.sheetInput} placeholder="Havolani ko'rish" placeholderTextColor={colors.textFaint} value={draftLabel} onChangeText={setDraftLabel} maxLength={30} />
          <SheetFooter onCancel={closeSheet} onDone={commitLink} doneLabel={editingId ? 'Saqlash' : "Qo'shish"} disabled={!draftUrl.trim()} />
        </Sheet>

        {/* Sanoq */}
        <Sheet visible={sheet === 'countdown'} onClose={closeSheet} bottomInset={botInset}>
          <Text style={st.sheetTitle}>Sanoq</Text>
          <Text style={st.fieldLabel}>Sarlavha</Text>
          <TextInput
            style={st.sheetInput}
            placeholder="Masalan: Tug'ilgan kunimga"
            placeholderTextColor={colors.textFaint}
            value={draftCdTitle}
            onChangeText={setDraftCdTitle}
            maxLength={40}
            autoFocus
          />
          <Text style={[st.fieldLabel, { marginTop: spacing.md }]}>Muddat</Text>
          <View style={st.chipRow}>
            {COUNTDOWN_OPTIONS.map((o, i) => (
              <TouchableOpacity key={o.label} style={[st.chip, draftCdIdx === i && st.chipActive]} onPress={() => setDraftCdIdx(i)}>
                <Text style={[st.chipText, draftCdIdx === i && st.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <SheetFooter onCancel={closeSheet} onDone={commitCountdown} disabled={!draftCdTitle.trim()} />
        </Sheet>

        {/* ================= MATN TAHRIRLASH (to'liq ekran) ================= */}
        {sheet === 'text' && (
          <View style={st.textOverlay}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={[st.textTopBar, { paddingTop: topPad }]}>
                <TouchableOpacity onPress={closeSheet} style={st.roundBtn}>
                  <X size={20} color="#fff" strokeWidth={2.6} />
                </TouchableOpacity>
                <TouchableOpacity onPress={commitText} style={st.doneChip}>
                  <Check size={16} color="#111" strokeWidth={3} />
                  <Text style={st.doneChipText}>Tayyor</Text>
                </TouchableOpacity>
              </View>

              <View style={st.textPreviewWrap}>
                <View
                  style={[
                    draftBgMode === 'solid' && [sk.textBgSolid, { backgroundColor: draftTextBlack ? '#fff' : '#000' }],
                    draftBgMode === 'soft' && sk.textBgSoft,
                  ]}
                >
                  <TextInput
                    style={{
                      fontFamily: STORY_FONTS[draftFontIdx].fontFamily,
                      color: draftBgMode === 'solid' ? (draftTextBlack ? '#000' : '#fff') : (STORY_TEXT_COLORS[draftColorIdx] as any),
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      minWidth: 120,
                    }}
                    placeholder="Nimadir yozing..."
                    placeholderTextColor="rgba(255,255,255,0.55)"
                    value={draftText}
                    onChangeText={setDraftText}
                    maxLength={150}
                    autoFocus
                    multiline
                  />
                </View>
              </View>

              <View style={[st.textPanel, { paddingBottom: botInset + spacing.sm }]}>
                <FlatList
                  data={STORY_FONTS}
                  keyExtractor={(f) => f.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: spacing.sm }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity style={[st.chip, draftFontIdx === index && st.chipActive]} onPress={() => setDraftFontIdx(index)}>
                      <Text style={[{ fontFamily: item.fontFamily }, st.chipText, draftFontIdx === index && st.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  )}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={st.colorRow}>
                  {(STORY_TEXT_COLORS as any[]).map((c, index) => (
                    <TouchableOpacity
                      key={c}
                      style={[st.colorDot, { backgroundColor: c }, draftColorIdx === index && st.colorDotActive]}
                      onPress={() => setDraftColorIdx(index)}
                    />
                  ))}
                </ScrollView>
                <View style={st.chipRow}>
                  {(['none', 'soft', 'solid'] as const).map((mode) => (
                    <TouchableOpacity key={mode} style={[st.chip, draftBgMode === mode && st.chipActive]} onPress={() => setDraftBgMode(mode)}>
                      <Text style={[st.chipText, draftBgMode === mode && st.chipTextActive]}>
                        {mode === 'none' ? 'Fonsiz' : mode === 'soft' ? 'Yumshoq fon' : "To'liq fon"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    </Modal>
  );
};

/* ================================================================== */
/*  STORY KO'RGANLAR — pastdan tepaga surib ochiladi                   */
/*  Story ko'rish ekranida (o'z storyingiz) absolute bottom:0 qilib    */
/*  joylashtiring.                                                     */
/* ================================================================== */
export const StoryViewersSheet: React.FC<{
  viewers: StoryViewer[];
  totalCount: number;
  loading?: boolean;
  onOpenChange?: (open: boolean) => void;
}> = ({ viewers, totalCount, loading, onOpenChange }) => {
  const { st, colors } = useStyles();
  const COLLAPSED = 76;
  const EXPANDED = Math.round(Dimensions.get('window').height * 0.62);
  const h = useRef(new Animated.Value(COLLAPSED)).current;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const cbRef = useRef(onOpenChange);
  cbRef.current = onOpenChange;

  const setOpenState = (v: boolean) => {
    openRef.current = v;
    setOpen(v);
    Animated.spring(h, { toValue: v ? EXPANDED : COLLAPSED, useNativeDriver: false, bounciness: 4 }).start();
    cbRef.current?.(v);
  };

  const pr = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy < -24) setOpenState(true);
        else if (gs.dy > 24) setOpenState(false);
        else if (Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8) setOpenState(!openRef.current);
      },
    })
  ).current;

  return (
    <Animated.View style={[st.viewersSheet, { height: h }]}>
      <View {...pr.panHandlers} style={st.viewersHandle}>
        <View style={st.sheetHandle} />
        <View style={st.viewersHeaderRow}>
          <Eye size={18} color={colors.text} strokeWidth={2.4} />
          <Text style={st.viewersCount}>{totalCount} ta ko'rish</Text>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <ChevronUp size={18} color={colors.textFaint} strokeWidth={2.6} />
          </View>
        </View>
      </View>
      <FlatList
        data={viewers}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        renderItem={({ item }) => (
          <View style={st.listRow}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, { backgroundColor: colors.primary }]}>
                <Text style={st.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={st.rowTitle}>{item.name}</Text>
              <Text style={st.rowSub}>{relativeTime(item.viewedAt)}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.textFaint} /> : <Text style={st.emptyText}>Hali hech kim ko'rmadi</Text>
        }
      />
    </Animated.View>
  );
};

/* ================================================================== */
/*  USLUBLAR                                                           */
/* ================================================================== */
// Stiker ichki ko'rinishi (mavzuga bog'liq emas)
const sk = StyleSheet.create({
  stickerWrap: { position: 'absolute', left: 0, top: 0 },
  stickerInner: { borderWidth: 1, borderColor: 'transparent', borderRadius: radius.md, padding: 4 },
  stickerSelected: { borderColor: 'rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.06)' },
  textBgSolid: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  textBgSoft: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  locationChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mentionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  mentionChipText: { fontWeight: '700', fontSize: 13, color: '#111' },
  pollCard: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.lg, padding: spacing.md, minWidth: 220, alignItems: 'center' },
  pollQuestion: { color: '#fff', fontWeight: '800', fontSize: 15, marginBottom: spacing.sm, textAlign: 'center' },
  pollOptionsRow: { flexDirection: 'row', gap: spacing.sm },
  pollOptionPill: { backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  pollOptionText: { fontWeight: '700', fontSize: 13, color: '#111' },
  questionCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, maxWidth: 260 },
  questionText: { color: '#fff', fontWeight: '700', fontSize: 14, flexShrink: 1 },
  musicChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, maxWidth: 230 },
  musicTitle: { fontWeight: '800', fontSize: 12, color: '#111' },
  musicArtist: { fontWeight: '500', fontSize: 11, color: '#555' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  linkChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  countdownCard: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center', minWidth: 180 },
  countdownTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  countdownValue: { color: '#fff', fontWeight: '800', fontSize: 20 },
});

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
    bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 190 },
    swipeZone: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 },

    // Header
    header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.md },
    progressTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
    progressFill: { height: 3, borderRadius: 2, backgroundColor: '#fff' },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.sm },
    headerInfo: { flex: 1 },
    headerTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
    headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
    headerMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', flexShrink: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    roundBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
    iconBtn: { padding: spacing.sm },

    // Chiqindi
    trashZone: { position: 'absolute', alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    trashZoneActive: { backgroundColor: '#ff3b30', transform: [{ scale: 1.2 }] },

    // Footer
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    privacyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing.md, height: 44, borderRadius: 22 },
    privacyChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
    trayBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
    publishBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#fff', borderRadius: 22, height: 44, paddingHorizontal: spacing.lg },
    publishBtnText: { color: '#111', fontWeight: '800' },

    // Sheet
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheetKav: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg + 6, borderTopRightRadius: radius.lg + 6, paddingHorizontal: spacing.lg },
    sheetHandleWrap: { alignItems: 'center', paddingVertical: spacing.sm },
    sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(127,127,127,0.5)' },
    sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 17, marginBottom: spacing.sm },
    fieldLabel: { color: colors.textFaint, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' },
    sheetInput: { marginTop: spacing.xs, backgroundColor: NEUTRAL_FILL, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm, color: colors.text, fontWeight: '600' },
    twoCols: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    errorText: { color: '#ff3b30', fontSize: 12, fontWeight: '600', marginTop: 4 },
    sheetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
    cancelBtn: { padding: spacing.md },
    cancelText: { color: colors.textFaint, fontWeight: '700' },
    doneBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
    doneText: { color: colors.bg, fontWeight: '800' },

    // Asboblar to'ri
    toolGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
    toolCell: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm },
    toolIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    toolLabel: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 6 },

    // Chiplar
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: NEUTRAL_FILL },
    chipActive: { backgroundColor: colors.primary },
    chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
    chipTextActive: { color: colors.bg },

    // Ro'yxat qatorlari
    listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
    rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
    rowSub: { color: colors.textFaint, fontSize: 12, marginTop: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    emptyText: { color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.lg, fontWeight: '600' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: NEUTRAL_FILL, borderRadius: radius.md, paddingHorizontal: spacing.md, marginVertical: spacing.sm },
    searchInput: { flex: 1, color: colors.text, paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm, fontWeight: '600' },

    // Matn tahrirlash
    textOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.86)' },
    textTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md },
    doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: spacing.md, height: 38, borderRadius: 19 },
    doneChipText: { color: '#111', fontWeight: '800' },
    textPreviewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    textPanel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm, backgroundColor: 'rgba(0,0,0,0.35)' },
    colorRow: { gap: spacing.sm, alignItems: 'center', paddingVertical: 4 },
    colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
    colorDotActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },

    // Ko'rganlar paneli
    viewersSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: radius.lg + 6, borderTopRightRadius: radius.lg + 6, overflow: 'hidden' },
    viewersHandle: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.lg },
    viewersHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    viewersCount: { color: colors.text, fontWeight: '800', fontSize: 15 },
  });

export default StoryComposerModal;