import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  FlatList,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import * as FileSystem from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { decode } from 'base64-arraybuffer';
import {
  Search,
  Bell,
  Plus,
  Star,
  Users,
  UserPlus,
  Heart,
  UserCheck,
  Clock,
  Check,
  X,
  MoreHorizontal,
  Trash2,
  BookmarkPlus,
  ChevronRight,
  Play,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import Avatar from '../components/Avatar';
import { SectionHeader } from '../components/Card';
import { supabase } from '../utils/supabase';
import StoryViewerModal from './StoryViewerModal';
import StoryComposerModal from './StoryComposerModal';
import StoryCamera from './StoryCamera';
import type { CapturedMedia } from './StoryCamera';
import { useConnectedFriends } from '../hooks/useConnectedFriends';
import {
  HIGHLIGHT_TITLES,
  type FriendStoryGroup,
  type HighlightGroup,
  type NotificationRow,
  type SearchUser,
  type StoryRow,
  type StoryTextSticker,
  type StoryMentionSticker,
  type StoryLocationSticker,
} from '../types/storyTypes';

// ---------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const HIGHLIGHT_COLUMNS = 4;
// Same 9:16 shape as the friends' story cards, just smaller.
const HIGHLIGHT_ASPECT = 9 / 16; // width / height

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
};

// iOS: a RN <Modal> that is still dismissing will silently refuse to
// present another Modal / Alert. Anything that must appear right after
// a modal closes goes through this helper.
const afterModalClose = (fn: () => void) => {
  setTimeout(fn, Platform.OS === 'ios' ? 450 : 50);
};

// "2m", "3h", "5d" style relative time.
const timeAgo = (iso?: string | null): string => {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'hozir';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo`;
  return `${Math.floor(day / 365)}y`;
};

// Safe file extension (blob:/data: URIs on web have no real extension).
const getSafeExt = (rawUri: string, mediaType: 'image' | 'video', mimeType?: string | null): string => {
  const fallback = mediaType === 'video' ? 'mp4' : 'jpg';
  if (rawUri.startsWith('blob:') || rawUri.startsWith('data:')) {
    const sub = mimeType?.split('/')[1]?.toLowerCase();
    if (sub === 'quicktime') return 'mov';
    if (sub === 'jpeg') return 'jpg';
    if (sub && /^[a-z0-9]{2,5}$/.test(sub)) return sub;
    return fallback;
  }
  const clean = rawUri.split('?')[0];
  const last = clean.split('.').pop();
  if (!last || last.length > 5 || !/^[a-zA-Z0-9]+$/.test(last)) return fallback;
  return last.toLowerCase();
};

const readUriAsArrayBuffer = async (uri: string): Promise<ArrayBuffer> => {
  if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const file = new FileSystem.File(uri);
  const base64 = await file.base64();
  return decode(base64);
};

// An <Image> cannot render a video URL. A story's "cover" is its image,
// or the thumbnail generated at upload time for videos (may be null for
// old videos).
const coverOf = (s: StoryRow): string | null =>
  (s as any).thumbnail_url ?? (s.media_type !== 'video' ? s.media_url : null);

type NotifItem = NotificationRow & {
  created_at?: string | null;
  actor_avatar_url?: string | null;
  story_id?: string | null;
};

type FriendState = 'accepted' | 'pending_out' | 'pending_in';

type GroupWithCover = FriendStoryGroup & { coverUrl?: string | null };

// ---------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------

const StoriesScreen: React.FC = () => {
  const { friends, refresh: refreshFriends } = useConnectedFriends();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // Height of the bottom tab bar (0 if this screen is not inside a tab
  // navigator). Used so the last row is never hidden behind it.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const bottomSpace = tabBarHeight > 0 ? tabBarHeight : insets.bottom + 72;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myStories, setMyStories] = useState<StoryRow[]>([]);
  const [friendStories, setFriendStories] = useState<StoryRow[]>([]);
  const [archive, setArchive] = useState<StoryRow[]>([]);
  const [highlightRows, setHighlightRows] = useState<StoryRow[]>([]);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());

  const [activeGroup, setActiveGroup] = useState<FriendStoryGroup | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightGroup | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [browseFriendsOpen, setBrowseFriendsOpen] = useState(false);
  const [browseHighlightsOpen, setBrowseHighlightsOpen] = useState(false);
  const [addHighlightOpen, setAddHighlightOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [composerUri, setComposerUri] = useState<string | null>(null);
  const [composerType, setComposerType] = useState<'image' | 'video'>('image');
  const [composerMime, setComposerMime] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // Request counters: only the newest response of each loader may write
  // state, so a slow/stale response can never overwrite fresh data.
  const seq = useRef({ stories: 0, highlights: 0, archive: 0, notifs: 0, views: 0 });

  // ------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const userId = data.session?.user?.id ?? null;
      setCurrentUserId(userId);
      if (!userId) {
        setLoading(false);
        setHighlightsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const openContactProfile = useCallback(
    (
      userId: string,
      preview?: { name?: string; username?: string; emoji?: string; avatarColor?: string; avatarUrl?: string }
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
    [navigation]
  );

  // ------------------------------------------------------------
  // Loaders
  // ------------------------------------------------------------
  const loadStories = useCallback(async () => {
    if (!currentUserId) return;
    const id = ++seq.current.stories;

    const [storiesRes, likedRes] = await Promise.all([
      supabase
        .from('stories')
        .select('*, story_likes(count)')
        .gt('expires_at', new Date().toISOString())
        .eq('is_highlight', false)
        .order('created_at', { ascending: true }),
      supabase.from('story_likes').select('story_id').eq('user_id', currentUserId),
    ]);

    if (id !== seq.current.stories) return;

    if (storiesRes.error || !storiesRes.data) {
      console.error('loadStories error:', storiesRes.error?.message);
      setLoading(false);
      return;
    }

    const myLikedIds = new Set<string>((likedRes.data ?? []).map((r: any) => r.story_id));

    const withLikes = (storiesRes.data as any[]).map((s) => ({
      ...s,
      like_count: Array.isArray(s.story_likes) ? s.story_likes[0]?.count ?? 0 : 0,
      liked_by_me: myLikedIds.has(s.id),
    })) as StoryRow[];

    setMyStories(withLikes.filter((s) => s.owner_id === currentUserId));
    setFriendStories(withLikes.filter((s) => s.owner_id !== currentUserId));
    setLoading(false);
  }, [currentUserId]);

  // All my non-highlight stories (active + expired) — source list for
  // the "New highlight" picker.
  const loadArchive = useCallback(async () => {
    if (!currentUserId) return;
    const id = ++seq.current.archive;
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('owner_id', currentUserId)
      .eq('is_highlight', false)
      .order('created_at', { ascending: false })
      .limit(100);
    if (id !== seq.current.archive) return;
    if (error || !data) {
      console.error('loadArchive error:', error?.message);
      return;
    }
    setArchive(data as StoryRow[]);
  }, [currentUserId]);

  const loadHighlights = useCallback(async () => {
    if (!currentUserId) return;
    const id = ++seq.current.highlights;
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('owner_id', currentUserId)
      .eq('is_highlight', true)
      .order('created_at', { ascending: true });
    if (id !== seq.current.highlights) return;
    if (error) {
      console.error('loadHighlights error:', error.code, error.message);
      setHighlightsLoading(false);
      return;
    }
    setHighlightRows((data ?? []) as StoryRow[]);
    setHighlightsLoading(false);
  }, [currentUserId]);

  const loadViewedIds = useCallback(async () => {
    if (!currentUserId) return;
    const id = ++seq.current.views;
    const { data } = await supabase.from('story_views').select('story_id').eq('viewer_id', currentUserId);
    if (id !== seq.current.views) return;
    if (data) setViewedIds(new Set(data.map((r: { story_id: string }) => r.story_id)));
  }, [currentUserId]);

  const loadNotifications = useCallback(async () => {
    if (!currentUserId) return;
    const id = ++seq.current.notifs;
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(name, username, emoji, avatar_color, avatar_url)')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (id !== seq.current.notifs) return;
    if (error) {
      console.error('loadNotifications error:', error.message);
      return;
    }
    const normalized = ((data ?? []) as any[]).map((n) => ({
      ...n,
      actor_name: n.actor?.name ?? n.actor_name ?? 'Someone',
      actor_emoji: n.actor?.emoji ?? n.actor_emoji ?? '🙂',
      actor_color: n.actor?.avatar_color ?? n.actor_color ?? colors.primary,
      actor_avatar_url: n.actor?.avatar_url ?? null,
    }));
    setNotifications(normalized as NotifItem[]);
  }, [currentUserId, colors.primary]);

  // Highlights grouped by title (derived — no extra state to desync).
  const highlights: HighlightGroup[] = useMemo(() => {
    const byTitle = new Map<string, StoryRow[]>();
    highlightRows.forEach((s) => {
      const key = s.highlight_title ?? 'Highlight';
      const list = byTitle.get(key) ?? [];
      list.push(s);
      byTitle.set(key, list);
    });
    return Array.from(byTitle.entries()).map(([title, stories]) => {
      // First story that has a renderable cover (image or video thumbnail).
      const cover = stories.map(coverOf).find((u): u is string => !!u);
      return { id: title, title, coverUrl: cover ?? '', stories };
    });
  }, [highlightRows]);

  const highlightedUrls = useMemo(() => new Set(highlightRows.map((s) => s.media_url)), [highlightRows]);
  const highlightCandidates = useMemo(
    () => archive.filter((s) => !highlightedUrls.has(s.media_url)),
    [archive, highlightedUrls]
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStories(), loadViewedIds(), loadHighlights(), loadNotifications(), loadArchive()]);
  }, [loadStories, loadViewedIds, loadHighlights, loadNotifications, loadArchive]);

  // Runs on mount, when the user id arrives, and every time the tab is
  // focused again (so iOS tab switches always show fresh data).
  useFocusEffect(
    useCallback(() => {
      if (currentUserId) refreshAll();
    }, [currentUserId, refreshAll])
  );

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshAll(), Promise.resolve(refreshFriends?.())]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll, refreshFriends]);

  // ------------------------------------------------------------
  // Realtime (debounced, re-subscribed only when the user changes)
  // ------------------------------------------------------------
  const loadersRef = useRef({
    loadStories,
    loadHighlights,
    loadArchive,
    loadNotifications,
    refreshFriends,
  });
  useEffect(() => {
    loadersRef.current = { loadStories, loadHighlights, loadArchive, loadNotifications, refreshFriends };
  }, [loadStories, loadHighlights, loadArchive, loadNotifications, refreshFriends]);

  useEffect(() => {
    if (!currentUserId) return;
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const schedule = (key: string, fn: () => void) => {
      if (timers[key]) clearTimeout(timers[key]);
      timers[key] = setTimeout(fn, 250);
    };

    const channel = supabase
      .channel(`stories-feed-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        schedule('stories', () => {
          loadersRef.current.loadStories();
          loadersRef.current.loadHighlights();
          loadersRef.current.loadArchive();
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes' }, () => {
        schedule('likes', () => loadersRef.current.loadStories());
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUserId}` },
        () => schedule('notifs', () => loadersRef.current.loadNotifications())
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        schedule('friends', () => {
          loadersRef.current.loadStories();
          loadersRef.current.loadNotifications();
          if (typeof loadersRef.current.refreshFriends === 'function') loadersRef.current.refreshFriends();
        });
      })
      .subscribe();

    return () => {
      Object.values(timers).forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------
  const groups: GroupWithCover[] = useMemo(() => {
    const byFriend = new Map<string, StoryRow[]>();
    friendStories.forEach((s) => {
      const list = byFriend.get(s.owner_id) ?? [];
      list.push(s);
      byFriend.set(s.owner_id, list);
    });

    const result: GroupWithCover[] = [];
    friends.forEach((f: any) => {
      const stories = byFriend.get(f.id);
      if (!stories || stories.length === 0) return;

      // Card cover = the friend's story itself (first unviewed one with a
      // renderable cover, otherwise the newest) — NOT the profile photo.
      const withCover = stories.filter((s) => !!coverOf(s));
      const pick = withCover.find((s) => !viewedIds.has(s.id)) ?? withCover[withCover.length - 1];

      result.push({
        friendId: f.id,
        friendName: f.name,
        emoji: f.emoji,
        color: f.avatarColor,
        avatarUrl: f.avatarUrl,
        stories,
        allViewed: stories.every((s) => viewedIds.has(s.id)),
        coverUrl: pick ? coverOf(pick) : null,
      });
    });
    return result.sort((a, b) => Number(a.allViewed) - Number(b.allViewed));
  }, [friendStories, friends, viewedIds]);

  const friendIds = useMemo(() => new Set<string>((friends ?? []).map((f: any) => f.id)), [friends]);
  const unreadNotifCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // Highlight tile geometry — explicit pixels (no % width + aspectRatio),
  // which is what Yoga on iOS resolves unreliably inside a wrapped row.
  const highlightWidth = Math.floor(
    (screenWidth - spacing.lg * 2 - spacing.sm * (HIGHLIGHT_COLUMNS - 1)) / HIGHLIGHT_COLUMNS
  );
  const highlightHeight = Math.round(highlightWidth / HIGHLIGHT_ASPECT);

  // ------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------
  const openCamera = () => {
    if (uploading) return;
    setCameraOpen(true);
  };

  // Camera (or its gallery strip) returned a photo/video.
  const handleCaptured = (media: CapturedMedia) => {
    setCameraOpen(false);
    // iOS cannot present the composer Modal while the camera Modal is
    // still dismissing.
    afterModalClose(() => {
      setComposerType(media.type);
      setComposerMime(media.mimeType ?? null);
      setComposerUri(media.uri);
    });
  };

  const handlePublishStory = async (
    uri: string,
    mediaType: 'image' | 'video',
    payload: {
      caption: string;
      privacy?: 'public' | 'close_friends';
      durationSec?: number | null;
      textStickers: StoryTextSticker[];
      mentionStickers: StoryMentionSticker[];
      locationSticker: (StoryLocationSticker & { latitude?: number; longitude?: number }) | null;
      pollStickers?: any[];
      questionStickers?: any[];
      musicStickers?: any[];
      linkStickers?: any[];
      countdownStickers?: any[];
    }
  ) => {
    if (!currentUserId || uploading) return;
    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      const caption = (payload.caption ?? '').trim();
      const ext = getSafeExt(uri, mediaType, composerMime);
      const stamp = Date.now();
      const path = `${currentUserId}/${stamp}.${ext}`;
      const contentType =
        composerMime && composerMime.includes('/') && composerMime !== 'image/jpg'
          ? composerMime
          : MIME_BY_EXT[ext] ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

      const arrayBuffer = await readUriAsArrayBuffer(uri);
      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(path, arrayBuffer, { contentType });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);

      const { data: publicUrlData } = supabase.storage.from('story-media').getPublicUrl(path);

      // Videos: generate a still frame so cards / highlights can show a
      // real preview instead of the profile photo. Best-effort only.
      let thumbnailUrl: string | null = null;
      if (mediaType === 'video') {
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: 500, quality: 0.7 });
          const thumbBuffer = await readUriAsArrayBuffer(thumb.uri);
          const thumbPath = `${currentUserId}/${stamp}_thumb.jpg`;
          const { error: thumbError } = await supabase.storage
            .from('story-media')
            .upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg' });
          if (!thumbError) {
            uploadedPaths.push(thumbPath);
            thumbnailUrl = supabase.storage.from('story-media').getPublicUrl(thumbPath).data.publicUrl;
          }
        } catch (e) {
          console.warn('video thumbnail failed:', e);
        }
      }

      const loc = payload.locationSticker;
      const { data: inserted, error: insertError } = await supabase
        .from('stories')
        .insert({
          owner_id: currentUserId,
          media_url: publicUrlData.publicUrl,
          media_type: mediaType,
          thumbnail_url: thumbnailUrl,
          caption: caption || null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          is_highlight: false,
          privacy: payload.privacy ?? 'public',
          duration_sec: mediaType === 'image' ? payload.durationSec ?? null : null,
          text_stickers: payload.textStickers ?? [],
          location_label: loc?.label ?? null,
          location_x: loc?.x ?? null,
          location_y: loc?.y ?? null,
          location_lat: loc?.latitude ?? null,
          location_lng: loc?.longitude ?? null,
          extra_stickers: {
            v: 2,
            poll: payload.pollStickers ?? [],
            question: payload.questionStickers ?? [],
            music: payload.musicStickers ?? [],
            link: payload.linkStickers ?? [],
            countdown: payload.countdownStickers ?? [],
          },
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      if (inserted && payload.mentionStickers.length > 0) {
        const { error: mentionError } = await supabase.from('story_mentions').insert(
          payload.mentionStickers.map((m) => ({
            story_id: inserted.id,
            friend_id: m.friendId,
            x: m.x,
            y: m.y,
          }))
        );
        if (mentionError) console.error('story_mentions insert error:', mentionError.message);
      }

      uploadedPaths.length = 0; // success — keep the files
      setComposerUri(null);
      showToast('Story posted');
      loadStories();
      loadArchive();
    } catch (err) {
      console.error('Story upload error:', err);
      if (uploadedPaths.length > 0) {
        // Insert failed after upload: don't leave orphan files behind.
        supabase.storage.from('story-media').remove(uploadedPaths).catch(() => {});
      }
      const message =
        err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err);
      Alert.alert('Error', `Upload failed: ${message}`);
    } finally {
      setUploading(false);
    }
  };

  const markViewed = useCallback(
    async (storyId: string) => {
      if (!currentUserId || viewedIds.has(storyId)) return;
      setViewedIds((prev) => new Set(prev).add(storyId));
      // upsert + ignoreDuplicates: re-viewing never errors (needs the
      // unique index from the SQL file).
      const { error } = await supabase
        .from('story_views')
        .upsert(
          { story_id: storyId, viewer_id: currentUserId },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        );
      if (error) {
        console.error('markViewed error:', error.message);
        setViewedIds((prev) => {
          const next = new Set(prev);
          next.delete(storyId);
          return next;
        });
      }
    },
    [viewedIds, currentUserId]
  );

  // Called when the notifications modal is closed (not opened), so the
  // unread highlight stays visible while the user reads the list.
  const markAllNotifsRead = useCallback(async () => {
    if (!currentUserId) return;
    if (!notifications.some((n) => !n.read)) return;
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', currentUserId)
      .eq('read', false);
    if (error) {
      console.error('markAllNotifsRead error:', error.message);
      setNotifications(previous);
    }
  }, [currentUserId, notifications]);

  const closeNotifications = useCallback(() => {
    setNotifOpen(false);
    markAllNotifsRead();
  }, [markAllNotifsRead]);

  const removeNotification = useCallback(async (notifId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    const { error } = await supabase.from('notifications').delete().eq('id', notifId);
    if (error) console.error('removeNotification error:', error.message);
  }, []);

  const acceptFriendRequest = useCallback(
    async (n: NotifItem) => {
      if (!currentUserId) return;
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('user_id', (n as any).actor_id)
        .eq('friend_id', currentUserId)
        .eq('status', 'pending');
      if (error) {
        console.error('acceptFriendRequest error:', error.message);
        showToast('Could not accept the request');
        return;
      }
      await removeNotification(n.id);
      if (typeof refreshFriends === 'function') refreshFriends();
      loadStories();
      showToast(`You and ${n.actor_name} are now friends`);
    },
    [currentUserId, removeNotification, refreshFriends, loadStories, showToast]
  );

  const declineFriendRequest = useCallback(
    async (n: NotifItem) => {
      if (!currentUserId) return;
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', (n as any).actor_id)
        .eq('friend_id', currentUserId)
        .eq('status', 'pending');
      if (error) {
        console.error('declineFriendRequest error:', error.message);
        showToast('Could not decline the request');
        return;
      }
      await removeNotification(n.id);
    },
    [currentUserId, removeNotification, showToast]
  );

  const toggleLike = useCallback(
    async (story: StoryRow) => {
      if (!currentUserId) return;
      const alreadyLiked = !!story.liked_by_me;

      const patch = (list: StoryRow[]) =>
        list.map((s) =>
          s.id === story.id
            ? {
                ...s,
                liked_by_me: !alreadyLiked,
                like_count: Math.max(0, (s.like_count ?? 0) + (alreadyLiked ? -1 : 1)),
              }
            : s
        );
      const revert = (list: StoryRow[]) =>
        list.map((s) =>
          s.id === story.id ? { ...s, liked_by_me: story.liked_by_me, like_count: story.like_count } : s
        );

      setMyStories(patch);
      setFriendStories(patch);

      const { error } = alreadyLiked
        ? await supabase.from('story_likes').delete().eq('story_id', story.id).eq('user_id', currentUserId)
        : await supabase.from('story_likes').insert({ story_id: story.id, user_id: currentUserId });

      if (error) {
        console.error('toggleLike error:', error.message);
        setMyStories(revert);
        setFriendStories(revert);
      }
    },
    [currentUserId]
  );

  const addToHighlight = useCallback(
    async (story: StoryRow, title: string): Promise<boolean> => {
      if (!currentUserId) return false;

      const duplicate = highlightRows.some(
        (h) => h.highlight_title === title && h.media_url === story.media_url
      );
      if (duplicate) {
        showToast(`Already in "${title}"`);
        return false;
      }

      const { data, error } = await supabase
        .from('stories')
        .insert({
          owner_id: currentUserId,
          media_url: story.media_url,
          media_type: story.media_type,
          thumbnail_url: (story as any).thumbnail_url ?? null,
          caption: story.caption,
          is_highlight: true,
          highlight_title: title,
          expires_at: null,
          text_stickers: story.text_stickers ?? [],
          location_label: story.location_label ?? null,
          location_x: story.location_x ?? null,
          location_y: story.location_y ?? null,
          location_lat: (story as any).location_lat ?? null,
          location_lng: (story as any).location_lng ?? null,
          extra_stickers: (story as any).extra_stickers ?? null,
          duration_sec: (story as any).duration_sec ?? null,
        })
        .select('*')
        .single();

      if (error || !data) {
        console.error('addToHighlight error:', error?.message);
        showToast('Could not save to highlights');
        return false;
      }

      // Show it immediately (no waiting for a refetch / realtime event).
      setHighlightRows((prev) => (prev.some((h) => h.id === data.id) ? prev : [...prev, data as StoryRow]));
      setHighlightsLoading(false);
      showToast(`Added to "${title}"`);
      loadHighlights();
      return true;
    },
    [currentUserId, highlightRows, loadHighlights, showToast]
  );

  const deleteStory = useCallback(
    async (story: StoryRow) => {
      setMyStories((prev) => prev.filter((s) => s.id !== story.id));
      // NB: the storage file is intentionally NOT removed — a highlight
      // copy may still point at the same media_url.
      const { error } = await supabase.from('stories').delete().eq('id', story.id);
      if (error) {
        console.error('deleteStory error:', error.message);
        showToast('Could not delete this story');
      }
      loadStories();
      loadArchive();
    },
    [loadStories, loadArchive, showToast]
  );

  const deleteHighlight = useCallback(
    (group: HighlightGroup) => {
      Alert.alert('Delete highlight', `Remove "${group.title}" and its ${group.stories.length} item(s)?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ids = group.stories.map((s) => s.id);
            setHighlightRows((prev) => prev.filter((s) => !ids.includes(s.id)));
            const { error } = await supabase.from('stories').delete().in('id', ids);
            if (error) {
              console.error('deleteHighlight error:', error.message);
              showToast('Could not delete highlight');
              loadHighlights();
            }
          },
        },
      ]);
    },
    [loadHighlights, showToast]
  );

  const openMyStories = (fromIndex: number) => {
    setActiveGroup({
      friendId: currentUserId ?? 'me',
      friendName: 'My story',
      emoji: '🙂',
      color: colors.primary,
      avatarUrl: null,
      stories: myStories.slice(fromIndex),
      allViewed: true,
      isMine: true,
    });
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomSpace + spacing.xl }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.header}>Stories</Text>
            <Text style={styles.subheader}>Visible to friends only · Disappears after 24h</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtnAccent} onPress={openCamera} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Plus size={20} color={colors.bg} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setSearchOpen(true)}>
              <Search size={20} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setNotifOpen(true)}>
              <Bell size={20} color={colors.text} strokeWidth={2} />
              {unreadNotifCount > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <SectionLabel
          icon={<Users size={13} color={colors.textDim} strokeWidth={2.2} />}
          title="Friends"
          onMorePress={() => setBrowseFriendsOpen(true)}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          {loading && <ActivityIndicator style={{ marginLeft: spacing.lg }} color={colors.primary} />}

          {!loading && groups.length === 0 && (
            <Text style={styles.emptyRowText}>None of your friends have posted a story yet</Text>
          )}

          {groups.map((g) => (
            <TouchableOpacity
              key={g.friendId}
              style={styles.storyCard}
              onPress={() => setActiveGroup(g)}
              activeOpacity={0.85}
            >
              <View
                style={[styles.storyCardFrame, { borderColor: g.allViewed ? colors.border : colors.primary }]}
              >
                {g.coverUrl ? (
                  <Image source={{ uri: g.coverUrl }} style={styles.storyCardImage} resizeMode="cover" />
                ) : g.avatarUrl ? (
                  <Image source={{ uri: g.avatarUrl }} style={styles.storyCardImage} />
                ) : (
                  <View style={[styles.storyCardImage, styles.storyCardAvatarFill]}>
                    <Avatar emoji={g.emoji} color={g.color} size={56} />
                  </View>
                )}
                <View style={styles.storyCardGradient} />
                {g.stories.length > 1 && (
                  <View style={styles.storyCardCountBadge}>
                    <Text style={styles.storyCardCountText}>{g.stories.length}</Text>
                  </View>
                )}
                <View style={styles.storyCardAvatarChip}>
                  {g.avatarUrl ? (
                    <Image source={{ uri: g.avatarUrl }} style={styles.storyCardAvatarChipImage} />
                  ) : (
                    <Avatar emoji={g.emoji} color={g.color} size={26} />
                  )}
                </View>
                <Text style={styles.storyCardName} numberOfLines={1}>
                  {g.friendName}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <SectionLabel title="My story" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          <TouchableOpacity style={styles.storyCard} onPress={openCamera} activeOpacity={0.85}>
            <View style={[styles.storyCardFrame, styles.addCardFrame]}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Plus size={28} color={colors.primary} strokeWidth={2.5} />
              )}
              <Text style={styles.addCardText}>Add to story</Text>
            </View>
          </TouchableOpacity>

          {myStories.map((s, i) => (
            <MyStoryCard
              key={s.id}
              story={s}
              index={i}
              onPress={() => openMyStories(i)}
              onDelete={() => deleteStory(s)}
              onAddToHighlight={async (title) => {
                await addToHighlight(s, title);
              }}
            />
          ))}
        </ScrollView>

        <SectionLabel
          icon={<Star size={13} color={colors.textDim} strokeWidth={2.2} />}
          title="Highlights"
          onMorePress={() => setBrowseHighlightsOpen(true)}
        />
        {highlightsLoading ? (
          <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />
        ) : (
          <View style={styles.highlightGrid}>
            <TouchableOpacity
              style={{ width: highlightWidth, height: highlightHeight }}
              onPress={() => setAddHighlightOpen(true)}
              activeOpacity={0.85}
            >
              <View style={[styles.highlightTile, styles.highlightAddFill]}>
                <Plus size={22} color={colors.primary} strokeWidth={2.5} />
              </View>
              <Text style={styles.highlightAddTitle} numberOfLines={1}>
                New
              </Text>
            </TouchableOpacity>

            {highlights.map((h) => {
              const showImage = !!h.coverUrl && !failedCovers.has(h.coverUrl);
              return (
                <TouchableOpacity
                  key={h.id}
                  style={{ width: highlightWidth, height: highlightHeight }}
                  onPress={() => setActiveHighlight(h)}
                  onLongPress={() => deleteHighlight(h)}
                  delayLongPress={450}
                  activeOpacity={0.85}
                >
                  <View style={styles.highlightTile}>
                    {showImage ? (
                      <Image
                        source={{ uri: h.coverUrl }}
                        style={styles.highlightImage}
                        resizeMode="cover"
                        onError={(e) => {
                          console.error('[HL] image failed to load', h.title, h.coverUrl, e.nativeEvent.error);
                          setFailedCovers((prev) => new Set(prev).add(h.coverUrl));
                        }}
                      />
                    ) : (
                      <View style={[styles.highlightImage, styles.highlightPlaceholder]}>
                        {h.stories[0]?.media_type === 'video' ? (
                          <Play size={20} color={colors.textDim} fill={colors.textDim} />
                        ) : (
                          <Star size={20} color={colors.textDim} strokeWidth={2} />
                        )}
                      </View>
                    )}
                    <View style={styles.highlightOverlay} />
                    <Text style={styles.highlightCardTitle} numberOfLines={1}>
                      {h.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {highlights.length === 0 && (
              <View style={styles.highlightEmptyHint}>
                <Text style={styles.emptyRowText}>Save your best stories here to keep them forever</Text>
              </View>
            )}
          </View>
        )}

        {!loading && groups.length === 0 && myStories.length === 0 && (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionHeader title="Nothing here yet" subtitle="Friends' stories will show up here once posted" />
          </View>
        )}
      </ScrollView>

      {activeGroup && (
        <StoryViewerModal
          group={activeGroup}
          onClose={() => setActiveGroup(null)}
          onViewed={markViewed}
          onToggleLike={toggleLike}
        />
      )}

      {activeHighlight && (
        <StoryViewerModal
          group={{
            friendId: activeHighlight.id,
            friendName: activeHighlight.title,
            emoji: '⭐',
            color: colors.primary,
            avatarUrl: null,
            stories: activeHighlight.stories,
            allViewed: true,
            isMine: true,
          }}
          onClose={() => setActiveHighlight(null)}
          onViewed={() => {}}
          onToggleLike={toggleLike}
        />
      )}

      {cameraOpen && <StoryCamera onClose={() => setCameraOpen(false)} onCaptured={handleCaptured} />}

      {composerUri && (
        <StoryComposerModal
          uri={composerUri}
          mediaType={composerType}
          uploading={uploading}
          onCancel={() => setComposerUri(null)}
          onPublish={(payload) => handlePublishStory(composerUri, composerType, payload)}
        />
      )}

      <BrowseFriendsModal
        visible={browseFriendsOpen}
        onClose={() => setBrowseFriendsOpen(false)}
        groups={groups}
        onOpenGroup={(g) => {
          setBrowseFriendsOpen(false);
          afterModalClose(() => setActiveGroup(g));
        }}
      />

      <BrowseHighlightsModal
        visible={browseHighlightsOpen}
        onClose={() => setBrowseHighlightsOpen(false)}
        highlights={highlights}
        onOpen={(h) => {
          setBrowseHighlightsOpen(false);
          afterModalClose(() => setActiveHighlight(h));
        }}
        onDelete={deleteHighlight}
        onNew={() => {
          setBrowseHighlightsOpen(false);
          afterModalClose(() => setAddHighlightOpen(true));
        }}
      />

      <AddHighlightModal
        visible={addHighlightOpen}
        onClose={() => setAddHighlightOpen(false)}
        candidates={highlightCandidates}
        onConfirm={async (story, title) => {
          const ok = await addToHighlight(story, title);
          if (ok) setAddHighlightOpen(false);
        }}
      />

      <SearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUserId={currentUserId}
        onToast={showToast}
        onOpenProfile={(user) => {
          setSearchOpen(false);
          afterModalClose(() =>
            openContactProfile(user.id, {
              name: user.name,
              username: user.username,
              emoji: user.emoji,
              avatarColor: user.color,
              avatarUrl: user.avatarUrl,
            })
          );
        }}
      />

      <NotificationsModal
        visible={notifOpen}
        onClose={closeNotifications}
        notifications={notifications}
        friendIds={friendIds}
        onAccept={acceptFriendRequest}
        onDecline={declineFriendRequest}
        onOpenProfile={(n) => {
          closeNotifications();
          afterModalClose(() =>
            openContactProfile((n as any).actor_id, {
              name: n.actor_name,
              emoji: n.actor_emoji,
              avatarColor: n.actor_color,
              avatarUrl: n.actor_avatar_url ?? undefined,
            })
          );
        }}
      />

      {toast && (
        <View style={[styles.toastWrap, { bottom: bottomSpace + spacing.sm }]} pointerEvents="none">
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const SectionLabel: React.FC<{ title: string; icon?: React.ReactNode; onMorePress?: () => void }> = ({
  title,
  icon,
  onMorePress,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelLeft}>
        {icon}
        <Text style={styles.sectionLabel}>{title}</Text>
      </View>
      {onMorePress && (
        <TouchableOpacity style={styles.sectionMoreBtn} activeOpacity={0.6} onPress={onMorePress}>
          <Text style={styles.sectionMoreText}>More</Text>
          <ChevronRight size={13} color={colors.textFaint} strokeWidth={2.2} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------
// My-story card with a 3-dot menu (single Modal, two steps — iOS cannot
// open a second Modal while the first one is still dismissing)
// ---------------------------------------------------------------------

const MyStoryCard: React.FC<{
  story: StoryRow;
  index: number;
  onPress: () => void;
  onDelete: () => void;
  onAddToHighlight: (title: string) => Promise<void>;
}> = ({ story, index, onPress, onDelete, onAddToHighlight }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'closed' | 'menu' | 'titles'>('closed');
  const [savingTitle, setSavingTitle] = useState<string | null>(null);
  const cover = coverOf(story);

  const handleChooseTitle = async (title: string) => {
    setStep('closed');
    setSavingTitle(title);
    try {
      await onAddToHighlight(title);
    } finally {
      setSavingTitle(null);
    }
  };

  return (
    <View style={styles.storyCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <View style={[styles.storyCardFrame, { borderColor: colors.primary }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.storyCardImage} />
          ) : (
            <View style={[styles.storyCardImage, styles.storyCardAvatarFill]}>
              <Play size={28} color={colors.textDim} fill={colors.textDim} />
            </View>
          )}
          <View style={styles.storyCardGradient} />
          <Text style={styles.storyCardName} numberOfLines={1}>
            {index === 0 ? 'My story' : `Story ${index + 1}`}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dotsBtn} onPress={() => setStep('menu')} disabled={!!savingTitle}>
        {savingTitle ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <MoreHorizontal size={14} color={colors.bg} strokeWidth={2.5} />
        )}
      </TouchableOpacity>

      <Modal visible={step !== 'closed'} transparent animationType="fade" onRequestClose={() => setStep('closed')}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setStep('closed')}>
          <View style={styles.menuSheet}>
            {step === 'menu' ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => setStep('titles')}>
                  <BookmarkPlus size={18} color={colors.text} strokeWidth={2} />
                  <Text style={styles.menuItemText}>Add to highlights</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setStep('closed');
                    afterModalClose(() =>
                      Alert.alert('Delete story', 'Are you sure you want to delete this story?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: onDelete },
                      ])
                    );
                  }}
                >
                  <Trash2 size={18} color={colors.danger ?? '#ff3b30'} strokeWidth={2} />
                  <Text style={[styles.menuItemText, { color: colors.danger ?? '#ff3b30' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.menuSheetTitle}>Choose a highlight</Text>
                {HIGHLIGHT_TITLES.map((title: string) => (
                  <TouchableOpacity key={title} style={styles.menuItem} onPress={() => handleChooseTitle(title)}>
                    <Star size={16} color={colors.primary} strokeWidth={2} />
                    <Text style={styles.menuItemText}>{title}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------
// Browse-friends modal
// ---------------------------------------------------------------------

const BrowseFriendsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  groups: GroupWithCover[];
  onOpenGroup: (g: GroupWithCover) => void;
}> = ({ visible, onClose, groups, onOpenGroup }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Friends' stories</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={groups}
            key="browse-grid-2col"
            keyExtractor={(item) => item.friendId}
            numColumns={2}
            columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.sm }}
            renderItem={({ item }) => {
              const previewUrl = item.coverUrl ?? item.avatarUrl;
              return (
                <TouchableOpacity style={styles.browseCard} activeOpacity={0.85} onPress={() => onOpenGroup(item)}>
                  {previewUrl ? (
                    <Image source={{ uri: previewUrl }} style={styles.browseCardImage} />
                  ) : (
                    <View style={[styles.browseCardImage, styles.storyCardAvatarFill]}>
                      <Avatar emoji={item.emoji} color={item.color} size={64} />
                    </View>
                  )}
                  <View style={styles.browseCardGradient} />
                  <View style={styles.browseCardFooter}>
                    <View
                      style={[
                        styles.browseCardAvatarRing,
                        { borderColor: item.allViewed ? 'rgba(255,255,255,0.4)' : colors.primary },
                      ]}
                    >
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.browseCardAvatarImage} />
                      ) : (
                        <Avatar emoji={item.emoji} color={item.color} size={24} />
                      )}
                    </View>
                    <Text style={styles.browseCardName} numberOfLines={1}>
                      {item.friendName}
                    </Text>
                  </View>
                  {item.stories.length > 1 && (
                    <View style={styles.storyCardCountBadge}>
                      <Text style={styles.storyCardCountText}>{item.stories.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyRowText, { paddingHorizontal: spacing.lg }]}>
                None of your friends have posted a story yet
              </Text>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Browse-highlights modal (full-screen list, same look as friends')
// ---------------------------------------------------------------------

const BrowseHighlightsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  highlights: HighlightGroup[];
  onOpen: (h: HighlightGroup) => void;
  onDelete: (h: HighlightGroup) => void;
  onNew: () => void;
}> = ({ visible, onClose, highlights, onOpen, onDelete, onNew }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Highlights</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={onNew} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>+ New</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.modalHint}>Tap to watch · Long press to delete</Text>

          <FlatList
            data={highlights}
            key="browse-highlights-2col"
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
            contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.sm }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.browseCard}
                activeOpacity={0.85}
                onPress={() => onOpen(item)}
                onLongPress={() => onDelete(item)}
                delayLongPress={450}
              >
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.browseCardImage} />
                ) : (
                  <View style={[styles.browseCardImage, styles.storyCardAvatarFill]}>
                    {item.stories[0]?.media_type === 'video' ? (
                      <Play size={26} color={colors.textDim} fill={colors.textDim} />
                    ) : (
                      <Star size={26} color={colors.textDim} strokeWidth={2} />
                    )}
                  </View>
                )}
                <View style={styles.browseCardGradient} />
                <View style={styles.browseCardFooter}>
                  <Star size={14} color="#fff" fill="#fff" strokeWidth={2} />
                  <Text style={styles.browseCardName} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                {item.stories.length > 1 && (
                  <View style={styles.storyCardCountBadge}>
                    <Text style={styles.storyCardCountText}>{item.stories.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[styles.emptyRowText, { paddingHorizontal: spacing.lg }]}>
                No highlights yet. Tap "+ New" to save your first one.
              </Text>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Add-highlight modal
// ---------------------------------------------------------------------

const AddHighlightModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  candidates: StoryRow[];
  onConfirm: (story: StoryRow, title: string) => Promise<void>;
}> = ({ visible, onClose, candidates, onConfirm }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedStory, setSelectedStory] = useState<StoryRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) setSelectedStory(null);
  }, [visible]);

  const handlePickTitle = async (title: string) => {
    if (!selectedStory || saving) return;
    setSaving(true);
    try {
      await onConfirm(selectedStory, title);
    } finally {
      setSaving(false);
    }
  };

  const selectedCover = selectedStory ? coverOf(selectedStory) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeaderRow}>
            {selectedStory ? (
              <TouchableOpacity onPress={() => setSelectedStory(null)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.modalTitle}>New highlight</Text>
            )}
            {selectedStory && <Text style={styles.modalTitle}>Choose title</Text>}
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          {!selectedStory ? (
            <>
              <Text style={styles.modalHint}>Pick one of your stories to save.</Text>
              <FlatList
                data={candidates}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}
                contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.xs }}
                renderItem={({ item }) => {
                  const cover = coverOf(item);
                  return (
                    <TouchableOpacity
                      style={styles.pickerThumb}
                      activeOpacity={0.85}
                      onPress={() => setSelectedStory(item)}
                    >
                      {cover ? (
                        <Image source={{ uri: cover }} style={styles.pickerThumbImage} />
                      ) : (
                        <View style={[styles.pickerThumbImage, styles.storyCardAvatarFill]}>
                          <Play size={20} color={colors.textDim} fill={colors.textDim} />
                        </View>
                      )}
                      {item.media_type === 'video' && (
                        <View style={styles.browseVideoBadge}>
                          <Play size={11} color="#fff" fill="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={[styles.emptyRowText, { paddingHorizontal: spacing.lg }]}>
                    No stories to save yet. Post a story first — it will show up here.
                  </Text>
                }
              />
            </>
          ) : (
            <View style={{ padding: spacing.lg }}>
              <View style={styles.selectedPreviewRow}>
                {selectedCover ? (
                  <Image source={{ uri: selectedCover }} style={styles.selectedPreviewImage} />
                ) : (
                  <View style={[styles.selectedPreviewImage, styles.storyCardAvatarFill]}>
                    <Play size={18} color={colors.textDim} fill={colors.textDim} />
                  </View>
                )}
                <Text style={[styles.modalHint, { flex: 1 }]}>Choose which highlight to add this story to.</Text>
              </View>
              {HIGHLIGHT_TITLES.map((title: string) => (
                <TouchableOpacity
                  key={title}
                  style={styles.menuItem}
                  onPress={() => handlePickTitle(title)}
                  disabled={saving}
                >
                  <Star size={16} color={colors.primary} strokeWidth={2} />
                  <Text style={styles.menuItemText}>{title}</Text>
                  {saving && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Global search modal
// ---------------------------------------------------------------------

type SearchRow = SearchUser & { relation?: FriendState };

const SearchModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  currentUserId: string | null;
  onOpenProfile: (user: SearchUser) => void;
  onToast: (message: string) => void;
}> = ({ visible, onClose, currentUserId, onOpenProfile, onToast }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setError(false);
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Strip characters that would break PostgREST's `or()` filter syntax.
    const safe = query.trim().replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!safe || !currentUserId) {
      requestId.current++;
      setResults([]);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const id = ++requestId.current;
      setSearching(true);
      setError(false);

      const [profilesRes, friendshipsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, username, emoji, avatar_color, avatar_url, is_private')
          .or(`name.ilike.%${safe}%,username.ilike.%${safe}%`)
          .neq('id', currentUserId)
          .limit(20),
        supabase
          .from('friendships')
          .select('user_id, friend_id, status')
          .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
          .in('status', ['accepted', 'pending']),
      ]);

      if (id !== requestId.current) return; // a newer search superseded this one

      if (profilesRes.error) {
        console.error('search error:', profilesRes.error.message);
        setError(true);
        setSearching(false);
        return;
      }

      const relationById = new Map<string, FriendState>();
      (friendshipsRes.data ?? []).forEach((f: any) => {
        const other = f.user_id === currentUserId ? f.friend_id : f.user_id;
        if (f.status === 'accepted') relationById.set(other, 'accepted');
        else relationById.set(other, f.user_id === currentUserId ? 'pending_out' : 'pending_in');
      });

      setResults(
        (profilesRes.data ?? []).map((u: any) => {
          const relation = relationById.get(u.id);
          return {
            id: u.id,
            name: u.name,
            username: u.username,
            emoji: u.emoji ?? '🙂',
            color: u.avatar_color ?? colors.primary,
            avatarUrl: u.avatar_url ?? undefined,
            is_friend: relation === 'accepted',
            is_private: !!u.is_private,
            relation,
          } as SearchRow;
        })
      );
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentUserId, colors.primary]);

  const sendFriendRequest = async (targetId: string) => {
    if (!currentUserId) return;
    // Optimistic: flip to "Pending" straight away.
    setResults((prev) => prev.map((r) => (r.id === targetId ? { ...r, relation: 'pending_out' } : r)));
    const { error: insertError } = await supabase
      .from('friendships')
      .insert({ user_id: currentUserId, friend_id: targetId, status: 'pending' });
    if (insertError) {
      console.error('sendFriendRequest error:', insertError.message);
      setResults((prev) => prev.map((r) => (r.id === targetId ? { ...r, relation: undefined } : r)));
      onToast(insertError.code === '23505' ? 'Request already exists' : 'Could not send friend request');
      return;
    }
    onToast('Friend request sent');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeaderRow}>
            <View style={styles.searchInputWrap}>
              <Search size={16} color={colors.textFaint} strokeWidth={2} style={styles.searchInputIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or username..."
                placeholderTextColor={colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          {searching && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.searchRow} activeOpacity={0.7} onPress={() => onOpenProfile(item)}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.searchAvatarImage} />
                ) : (
                  <Avatar emoji={item.emoji} color={item.color} size={44} />
                )}
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.searchName}>{item.name}</Text>
                  <Text style={styles.searchUsername}>
                    @{item.username}
                    {item.is_private ? ' · Private' : ''}
                  </Text>
                </View>

                {item.relation === 'accepted' && (
                  <View style={styles.friendBadgeWrap}>
                    <UserCheck size={14} color={colors.textFaint} strokeWidth={2} />
                    <Text style={styles.friendBadge}>Friend</Text>
                  </View>
                )}
                {item.relation === 'pending_out' && (
                  <View style={styles.friendBadgeWrap}>
                    <Clock size={14} color={colors.textFaint} strokeWidth={2} />
                    <Text style={styles.friendBadge}>Pending</Text>
                  </View>
                )}
                {item.relation === 'pending_in' && (
                  <View style={styles.friendBadgeWrap}>
                    <UserPlus size={14} color={colors.primary} strokeWidth={2} />
                    <Text style={[styles.friendBadge, { color: colors.primary }]}>Wants to connect</Text>
                  </View>
                )}
                {!item.relation && (
                  <TouchableOpacity style={styles.addFriendBtn} onPress={() => sendFriendRequest(item.id)}>
                    <UserPlus size={14} color={colors.bg} strokeWidth={2.5} />
                    <Text style={styles.addFriendBtnText}>{item.is_private ? 'Request' : 'Add'}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              error ? (
                <Text style={styles.emptyRowText}>Search failed. Check your connection and try again.</Text>
              ) : !searching && query.trim() ? (
                <Text style={styles.emptyRowText}>No results found</Text>
              ) : null
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Notifications modal (filters, time-ago, Contact/New tag, and
// Accept / Decline buttons on friend requests)
// ---------------------------------------------------------------------

type NotifFilter = 'all' | 'requests' | 'contacts';

const NotifIcon: React.FC<{ type: string }> = ({ type }) => {
  const { colors } = useTheme();
  switch (type) {
    case 'like':
      return <Heart size={16} color={colors.danger ?? '#ff3b30'} fill={colors.danger ?? '#ff3b30'} />;
    case 'follow_request':
      return <UserPlus size={16} color={colors.primary} strokeWidth={2.5} />;
    case 'friend_accepted':
      return <UserCheck size={16} color={colors.primary} strokeWidth={2.5} />;
    default:
      return <Star size={16} color={colors.primary} strokeWidth={2.5} />;
  }
};

const NotificationsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  notifications: NotifItem[];
  friendIds: Set<string>;
  onOpenProfile: (n: NotifItem) => void;
  onAccept: (n: NotifItem) => Promise<void>;
  onDecline: (n: NotifItem) => Promise<void>;
}> = ({ visible, onClose, notifications, friendIds, onOpenProfile, onAccept, onDecline }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<NotifFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setFilter('all');
  }, [visible]);

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'requests') return notifications.filter((n) => (n.type as string) === 'follow_request');
    return notifications.filter((n) => friendIds.has((n as any).actor_id));
  }, [notifications, filter, friendIds]);

  const describe = (n: NotifItem): string => {
    switch (n.type as string) {
      case 'like':
        return `${n.actor_name} liked your story`;
      case 'follow_request':
        return `${n.actor_name} sent you a friend request`;
      case 'friend_accepted':
        return `${n.actor_name} accepted your friend request`;
      case 'new_story':
        return `${n.actor_name} posted a new story`;
      case 'mention':
        return `${n.actor_name} mentioned you in a story`;
      default:
        return `${n.actor_name} interacted with you`;
    }
  };

  const run = async (n: NotifItem, fn: (n: NotifItem) => Promise<void>) => {
    if (busyId) return;
    setBusyId(n.id);
    try {
      await fn(n);
    } finally {
      setBusyId(null);
    }
  };

  const FILTERS: { key: NotifFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'requests', label: 'Requests' },
    { key: 'contacts', label: 'Contacts' },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Notifications</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.filterTabsRow}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg }}
            renderItem={({ item }) => {
              const actorId = (item as any).actor_id as string;
              const isFriend = friendIds.has(actorId);
              const when = timeAgo(item.created_at);
              const isPendingRequest = (item.type as string) === 'follow_request' && !isFriend;
              const busy = busyId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.notifRow, !item.read && styles.notifRowUnread]}
                  activeOpacity={0.7}
                  onPress={() => onOpenProfile(item)}
                >
                  <View style={styles.notifAvatarWrap}>
                    {item.actor_avatar_url ? (
                      <Image source={{ uri: item.actor_avatar_url }} style={styles.notifAvatarImage} />
                    ) : (
                      <Avatar emoji={item.actor_emoji} color={item.actor_color} size={40} />
                    )}
                    <View style={styles.notifIconBadge}>
                      <NotifIcon type={item.type as string} />
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifText}>{describe(item)}</Text>
                    <View style={styles.notifMetaRow}>
                      {!!when && <Text style={styles.notifTime}>{when}</Text>}
                      <View style={[styles.notifBadge, isFriend ? styles.notifBadgeFriend : styles.notifBadgeContact]}>
                        <Text style={styles.notifBadgeText}>{isFriend ? 'Contact' : 'New'}</Text>
                      </View>
                    </View>

                    {isPendingRequest && (
                      <View style={styles.notifActions}>
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <TouchableOpacity style={styles.acceptBtn} onPress={() => run(item, onAccept)}>
                              <Check size={14} color={colors.bg} strokeWidth={3} />
                              <Text style={styles.acceptBtnText}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.declineBtn} onPress={() => run(item, onDecline)}>
                              <X size={14} color={colors.textDim} strokeWidth={3} />
                              <Text style={styles.declineBtnText}>Decline</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyRowText}>
                {filter === 'all' ? 'No notifications yet' : 'Nothing here for this filter'}
              </Text>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    header: { ...typography.h1, color: colors.text },
    subheader: { ...typography.body, color: colors.textFaint, marginTop: 4 },

    headerActions: { flexDirection: 'row', gap: spacing.sm },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerIconBtnAccent: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifDot: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.danger ?? '#ff3b30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },

    sectionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    sectionLabelLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionLabel: {
      ...typography.small,
      color: colors.textDim,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 },
    sectionMoreText: { ...typography.small, color: colors.textFaint, fontWeight: '600' },

    rowScroll: { marginTop: 2 },
    emptyRowText: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },

    // 9:16 story cards
    storyCard: { alignItems: 'center', marginRight: spacing.sm, width: 104 },
    storyCardFrame: {
      width: 104,
      height: 185,
      borderRadius: radius.lg,
      borderWidth: 2.5,
      overflow: 'hidden',
      backgroundColor: colors.card,
      justifyContent: 'flex-end',
    },
    storyCardImage: { ...FILL },
    storyCardAvatarFill: { alignItems: 'center', justifyContent: 'center' },
    storyCardGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '55%',
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    storyCardCountBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    storyCardCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    storyCardAvatarChip: {
      position: 'absolute',
      left: 8,
      bottom: 26,
      width: 28,
      height: 28,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: '#fff',
    },
    storyCardAvatarChipImage: { width: '100%', height: '100%' },
    storyCardName: { color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingBottom: 8 },

    addCardFrame: {
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 8,
    },
    addCardText: { ...typography.small, color: colors.primary, fontWeight: '700', textAlign: 'center' },

    // Highlights — size is set inline (explicit px) from useWindowDimensions
    highlightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 },
    highlightTile: {
      flex: 1,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    highlightImage: { ...FILL },
    highlightPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    highlightAddFill: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    highlightAddTitle: {
      position: 'absolute',
      bottom: spacing.sm,
      left: spacing.xs,
      right: spacing.xs,
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    highlightOverlay: { ...FILL, backgroundColor: 'rgba(0,0,0,0.18)' },
    highlightCardTitle: {
      position: 'absolute',
      bottom: spacing.sm,
      left: spacing.xs,
      right: spacing.xs,
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    highlightEmptyHint: { width: '100%' },

    dotsBtn: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },

    menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    menuSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    menuSheetTitle: { ...typography.body, color: colors.textFaint, fontWeight: '700', marginBottom: spacing.sm },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    menuItemText: { ...typography.body, color: colors.text, fontWeight: '600' },

    modalSafe: { flex: 1, backgroundColor: colors.bg },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    modalTitle: { ...typography.h1, color: colors.text },
    modalCloseBtn: { padding: spacing.sm },
    modalCloseText: { color: colors.primary, fontWeight: '700' },
    modalHint: {
      ...typography.small,
      color: colors.textFaint,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    searchInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    searchInputIcon: { marginRight: spacing.xs },
    searchInput: { flex: 1, paddingVertical: spacing.sm, color: colors.text, ...typography.body },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    searchAvatarImage: { width: 44, height: 44, borderRadius: 22 },
    searchName: { ...typography.body, color: colors.text, fontWeight: '600' },
    searchUsername: { ...typography.small, color: colors.textFaint, marginTop: 2 },
    addFriendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    addFriendBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
    friendBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    friendBadge: { ...typography.small, color: colors.textFaint },

    filterTabsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    filterTab: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterTabText: { ...typography.small, color: colors.textDim, fontWeight: '600' },
    filterTabTextActive: { color: colors.bg },

    notifRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    notifRowUnread: { backgroundColor: colors.card },
    notifAvatarWrap: { position: 'relative' },
    notifAvatarImage: { width: 40, height: 40, borderRadius: 20 },
    notifIconBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    notifText: { ...typography.body, color: colors.text },
    notifMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
    notifTime: { ...typography.small, color: colors.textFaint },
    notifBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
    notifBadgeFriend: { backgroundColor: colors.primary + '22' },
    notifBadgeContact: { backgroundColor: colors.border },
    notifBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textDim },
    notifActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    acceptBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    acceptBtnText: { color: colors.bg, fontWeight: '700', fontSize: 12 },
    declineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    declineBtnText: { color: colors.textDim, fontWeight: '700', fontSize: 12 },

    browseCard: {
      flex: 1,
      aspectRatio: 0.58,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    browseCardImage: { ...FILL },
    browseCardGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '45%',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    browseVideoBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    browseCardFooter: {
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    browseCardAvatarRing: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    browseCardAvatarImage: { width: '100%', height: '100%' },
    browseCardName: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1 },

    pickerThumb: { flex: 1, aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
    pickerThumbImage: { width: '100%', height: '100%' },
    selectedPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    selectedPreviewImage: { width: 56, height: 96, borderRadius: radius.md, backgroundColor: colors.card },

    toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    toast: {
      backgroundColor: colors.text,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      maxWidth: '85%',
    },
    toastText: { color: colors.bg, fontWeight: '600', fontSize: 13 },
  });

export default StoriesScreen;