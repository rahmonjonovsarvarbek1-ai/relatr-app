import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
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
  MoreHorizontal,
  Trash2,
  BookmarkPlus,
  ChevronRight,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import Avatar from '../components/Avatar';
import { SectionHeader } from '../components/Card';
import { supabase } from '../utils/supabase';
import StoryViewerModal from './StoryViewerModal';
import StoryComposerModal from './StoryComposerModal';
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
} from './storyTypes';

// ---------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------

const StoriesScreen: React.FC = () => {
  const { friends } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myStories, setMyStories] = useState<StoryRow[]>([]);
  const [friendStories, setFriendStories] = useState<StoryRow[]>([]);
  const [highlights, setHighlights] = useState<HighlightGroup[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [activeGroup, setActiveGroup] = useState<FriendStoryGroup | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<HighlightGroup | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [composerUri, setComposerUri] = useState<string | null>(null);
  const [composerType, setComposerType] = useState<'image' | 'video'>('image');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // -------------------------------------------------------------
  // Load stories (non-highlight, unexpired), likes, highlights,
  // views, and notifications.
  // -------------------------------------------------------------
  const loadStories = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('*, story_likes(count)')
      .gt('expires_at', new Date().toISOString())
      .eq('is_highlight', false)
      .order('created_at', { ascending: true });

    if (error || !data) {
      setLoading(false);
      return;
    }

    let myLikedIds = new Set<string>();
    if (currentUserId) {
      const { data: likedRows } = await supabase
        .from('story_likes')
        .select('story_id')
        .eq('user_id', currentUserId);
      if (likedRows) myLikedIds = new Set(likedRows.map((r: any) => r.story_id));
    }

    const withLikes = (data as any[]).map((s) => ({
      ...s,
      like_count: Array.isArray(s.story_likes) ? s.story_likes[0]?.count ?? 0 : 0,
      liked_by_me: myLikedIds.has(s.id),
    })) as StoryRow[];

    // Owner-based split: a user's own stories only ever populate
    // "My story"; everyone else's populate the "Friends" row. RLS on
    // the `stories` table (see SQL) already restricts what rows this
    // query can even see (self + accepted friends), so this split is
    // just a UI grouping on top of an already-scoped result set.
    const mine = withLikes.filter((s) => s.owner_id === currentUserId);
    const others = withLikes.filter((s) => s.owner_id !== currentUserId);
    setMyStories(mine);
    setFriendStories(others);
    setLoading(false);
  }, [currentUserId]);

  const loadHighlights = useCallback(async () => {
    if (!currentUserId) return;
    // Highlights are permanent, so this query intentionally does not
    // filter on expires_at at all (unlike loadStories above).
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('owner_id', currentUserId)
      .eq('is_highlight', true)
      .order('created_at', { ascending: true });

    if (error || !data) return;

    const byTitle = new Map<string, StoryRow[]>();
    (data as StoryRow[]).forEach((s) => {
      const key = s.highlight_title ?? 'Highlight';
      const list = byTitle.get(key) ?? [];
      list.push(s);
      byTitle.set(key, list);
    });

    const groups: HighlightGroup[] = Array.from(byTitle.entries()).map(([title, stories]) => ({
      id: title,
      title,
      coverUrl: stories[0].media_url,
      stories,
    }));
    setHighlights(groups);
  }, [currentUserId]);

  const loadViewedIds = useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', currentUserId);
    if (data) setViewedIds(new Set(data.map((r: { story_id: string }) => r.story_id)));
  }, [currentUserId]);

  const loadNotifications = useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data as NotificationRow[]);
  }, [currentUserId]);

  useEffect(() => {
    loadStories();
    loadViewedIds();
    loadHighlights();
    loadNotifications();

    const channel = supabase
      .channel('stories-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        loadStories();
        loadHighlights();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes' }, () => {
        loadStories();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStories, loadViewedIds, loadHighlights, loadNotifications]);

  // -------------------------------------------------------------
  // Group friend stories by friend (1 avatar = 1 ring, matches
  // the "friends" row in the mock).
  // -------------------------------------------------------------
  const groups: FriendStoryGroup[] = useMemo(() => {
    const byFriend = new Map<string, StoryRow[]>();
    friendStories.forEach((s) => {
      const list = byFriend.get(s.owner_id) ?? [];
      list.push(s);
      byFriend.set(s.owner_id, list);
    });

    const result: FriendStoryGroup[] = [];
    friends.forEach((f) => {
      const stories = byFriend.get(f.id);
      if (!stories || stories.length === 0) return;
      result.push({
        friendId: f.id,
        friendName: f.name,
        emoji: f.emoji,
        color: f.avatarColor,
        stories,
        allViewed: stories.every((s) => viewedIds.has(s.id)),
      });
    });

    // Unseen first
    return result.sort((a, b) => Number(a.allViewed) - Number(b.allViewed));
  }, [friendStories, friends, viewedIds]);

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // -------------------------------------------------------------
  // Pick media, then open the full-screen composer so the user
  // can add text before posting. Uses the array-of-strings media
  // types API (['images', 'videos']) rather than the deprecated
  // ImagePicker.MediaTypeOptions enum, which expo-image-picker
  // warns will be removed in a future SDK release.
  // -------------------------------------------------------------
  const handlePickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const asset = result.assets[0];
    // asset.type from expo-image-picker is always the plain string
    // 'image' | 'video' — there is no nested object to unwrap.
    setComposerType(asset.type === 'video' ? 'video' : 'image');
    setComposerUri(asset.uri);
  };

  // -------------------------------------------------------------
  // Publish a story: upload the media, then insert the row (plus
  // any mention rows). Media is read via expo-file-system and
  // decoded to an ArrayBuffer rather than fetch(uri).blob():
  // on native (Expo Go / bare RN), fetching a local file:// URI
  // and calling .blob() on the response silently produces a
  // 0-byte blob on some Android/iOS builds — the upload "succeeds"
  // but the story's media is empty, which is why stories posted
  // from a phone could show up blank while the web build worked
  // fine (browsers don't have this blob-from-file-uri bug).
  // -------------------------------------------------------------
  const handlePublishStory = async (
    uri: string,
    mediaType: 'image' | 'video',
    payload: {
      caption: string;
      textStickers: StoryTextSticker[];
      mentionStickers: StoryMentionSticker[];
      locationSticker: StoryLocationSticker | null;
    }
  ) => {
    if (!currentUserId) return;
    setUploading(true);
    try {
      const caption = payload.caption ?? '';
      const fileExt = uri.split('.').pop() ?? (mediaType === 'video' ? 'mp4' : 'jpg');
      const fileName = `${currentUserId}/${Date.now()}.${fileExt}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64' as const,
      });
      const arrayBuffer = decode(base64);

      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(fileName, arrayBuffer, {
          contentType: mediaType === 'video' ? `video/${fileExt}` : `image/${fileExt}`,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('story-media').getPublicUrl(fileName);

      const { data: inserted, error: insertError } = await supabase
        .from('stories')
        .insert([
          {
            owner_id: currentUserId,
            media_url: publicUrlData.publicUrl,
            media_type: mediaType,
            caption: caption.trim() ? caption.trim() : null,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            is_highlight: false,
            text_stickers: payload.textStickers,
            location_label: payload.locationSticker?.label ?? null,
            location_x: payload.locationSticker?.x ?? null,
            location_y: payload.locationSticker?.y ?? null,
          },
        ])
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Mentions live in their own join table so mentioned friends
      // can be notified and queried independently of the story row.
      if (inserted && payload.mentionStickers.length > 0) {
        await supabase.from('story_mentions').insert(
          payload.mentionStickers.map((m) => ({
            story_id: inserted.id,
            friend_id: m.friendId,
            x: m.x,
            y: m.y,
          }))
        );
      }

      setComposerUri(null);
      loadStories();
    } catch (err) {
      Alert.alert('Error', 'Something went wrong while uploading your story. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const markViewed = useCallback(
    async (storyId: string) => {
      if (viewedIds.has(storyId) || !currentUserId) return;
      setViewedIds((prev) => new Set(prev).add(storyId));
      const { error } = await supabase
        .from('story_views')
        .insert({ story_id: storyId, viewer_id: currentUserId });
      if (error) {
        // Roll back so a retry (e.g. reopening the story) is possible
        // instead of leaving a view marked locally that never made it
        // to the server.
        setViewedIds((prev) => {
          const next = new Set(prev);
          next.delete(storyId);
          return next;
        });
      }
    },
    [viewedIds, currentUserId]
  );

  const markAllNotifsRead = useCallback(async () => {
    if (!currentUserId) return;
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', currentUserId);
    if (error) {
      // Roll back the optimistic update so the unread badge doesn't
      // lie about what's actually been persisted.
      setNotifications(previous);
    }
  }, [currentUserId, notifications]);

  // -------------------------------------------------------------
  // Like / unlike a story. A DB trigger creates the "liked your
  // story" notification server-side (see accompanying SQL).
  // Throws on failure so the viewer can roll back the optimistic
  // update and tell the user, instead of silently drifting out of
  // sync with the server.
  // -------------------------------------------------------------
  const toggleLike = useCallback(
    async (story: StoryRow) => {
      if (!currentUserId) return;
      const alreadyLiked = story.liked_by_me;

      const patch = (list: StoryRow[]) =>
        list.map((s) =>
          s.id === story.id
            ? {
                ...s,
                liked_by_me: !alreadyLiked,
                like_count: (s.like_count ?? 0) + (alreadyLiked ? -1 : 1),
              }
            : s
        );
      const revert = (list: StoryRow[]) =>
        list.map((s) => (s.id === story.id ? { ...s, ...story } : s));

      setMyStories((prev) => patch(prev));
      setFriendStories((prev) => patch(prev));

      const { error } = alreadyLiked
        ? await supabase
            .from('story_likes')
            .delete()
            .eq('story_id', story.id)
            .eq('user_id', currentUserId)
        : await supabase.from('story_likes').insert({ story_id: story.id, user_id: currentUserId });

      if (error) {
        setMyStories((prev) => revert(prev));
        setFriendStories((prev) => revert(prev));
        throw error;
      }
    },
    [currentUserId]
  );

  // -------------------------------------------------------------
  // Save an existing story into a highlight (a permanent copy
  // flagged is_highlight = true, so it survives past the 24h
  // expiry of the original). expires_at is null rather than a
  // far-future placeholder date — loadHighlights never filters on
  // expires_at, so "permanent" is expressed as "no expiry" instead
  // of "expires in the year 2099". Requires the stories.expires_at
  // column to allow NULL (see accompanying SQL).
  // -------------------------------------------------------------
  const addToHighlight = useCallback(
    async (story: StoryRow, title: string) => {
      if (!currentUserId) return;
      const { error } = await supabase.from('stories').insert({
        owner_id: currentUserId,
        media_url: story.media_url,
        media_type: story.media_type,
        caption: story.caption,
        is_highlight: true,
        highlight_title: title,
        expires_at: null,
        text_stickers: story.text_stickers ?? [],
        location_label: story.location_label ?? null,
        location_x: story.location_x ?? null,
        location_y: story.location_y ?? null,
      });
      if (error) {
        Alert.alert('Error', 'Could not save to highlights.');
        return;
      }
      Alert.alert('Saved', `Added to "${title}" highlights.`);
      loadHighlights();
    },
    [currentUserId, loadHighlights]
  );

  const deleteStory = useCallback(
    async (story: StoryRow) => {
      const { error } = await supabase.from('stories').delete().eq('id', story.id);
      if (error) {
        Alert.alert('Error', 'Could not delete this story.');
        return;
      }
      loadStories();
      loadHighlights();
    },
    [loadStories, loadHighlights]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ---------------------------------------------------- */}
        {/* Header: title + add + search + bell (matches sketch)  */}
        {/* ---------------------------------------------------- */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.header}>Stories</Text>
            <Text style={styles.subheader}>Visible to friends only · Disappears after 24h</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtnAccent}
              onPress={handlePickMedia}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Plus size={20} color={colors.bg} strokeWidth={2.5} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setSearchOpen(true)}>
              <Search size={20} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {
                setNotifOpen(true);
                markAllNotifsRead();
              }}
            >
              <Bell size={20} color={colors.text} strokeWidth={2} />
              {unreadNotifCount > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ---------------------------------------------------- */}
        {/* Friends row — everyone else's stories, one ring each  */}
        {/* ---------------------------------------------------- */}
        <SectionLabel icon={<Users size={13} color={colors.textDim} strokeWidth={2.2} />} title="Friends" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          {loading && <ActivityIndicator style={{ marginLeft: spacing.lg }} color={colors.primary} />}

          {!loading && groups.length === 0 && (
            <Text style={styles.emptyRowText}>None of your friends have posted a story yet</Text>
          )}

          {groups.map((g) => (
            <TouchableOpacity
              key={g.friendId}
              style={styles.storyBubble}
              onPress={() => setActiveGroup(g)}
              activeOpacity={0.8}
            >
              <View
                style={[styles.ring, { borderColor: g.allViewed ? colors.border : colors.primary }]}
              >
                <Avatar emoji={g.emoji} color={g.color} size={58} />
              </View>
              <Text style={styles.storyName} numberOfLines={1}>
                {g.friendName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ---------------------------------------------------- */}
        {/* My Story row — only the owner ever sees these here    */}
        {/* ---------------------------------------------------- */}
        <SectionLabel title="My story" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
          <TouchableOpacity style={styles.storyBubble} onPress={handlePickMedia} activeOpacity={0.8}>
            <View style={[styles.ring, styles.addRing]}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Plus size={26} color={colors.primary} strokeWidth={2.5} />
              )}
            </View>
            <Text style={styles.storyName} numberOfLines={1}>
              Add
            </Text>
          </TouchableOpacity>

          {myStories.map((s, i) => (
            <MyStoryBubble
              key={s.id}
              story={s}
              index={i}
              onPress={() =>
                setActiveGroup({
                  friendId: currentUserId ?? 'me',
                  friendName: 'My story',
                  emoji: '🙂',
                  color: colors.primary,
                  stories: myStories,
                  allViewed: true,
                  isMine: true,
                })
              }
              onDelete={() => deleteStory(s)}
              onAddToHighlight={(title) => addToHighlight(s, title)}
            />
          ))}
        </ScrollView>

        {/* ---------------------------------------------------- */}
        {/* Highlights row — permanent, saved-for-later stories.  */}
        {/* Rendered as a 4-up grid of tall rounded cards, not     */}
        {/* circular rings, to match the highlight-shelf design.   */}
        {/* ---------------------------------------------------- */}
        <SectionLabel icon={<Star size={13} color={colors.textDim} strokeWidth={2.2} />} title="Highlights" />
        {highlights.length === 0 ? (
          <Text style={styles.emptyRowText}>Save your best stories here to keep them forever</Text>
        ) : (
          <View style={styles.highlightGrid}>
            {highlights.map((h) => (
              <TouchableOpacity
                key={h.id}
                style={styles.highlightCard}
                onPress={() => setActiveHighlight(h)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: h.coverUrl }} style={styles.highlightCardImage} />
                <View style={styles.highlightCardOverlay} />
                <Text style={styles.highlightCardTitle} numberOfLines={1}>
                  {h.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && groups.length === 0 && myStories.length === 0 && (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionHeader
              title="Nothing here yet"
              subtitle="Friends' stories will show up here once posted"
            />
          </View>
        )}
      </ScrollView>

      {/* Story viewer (friends or my own), sized to the device screen */}
      {activeGroup && (
        <StoryViewerModal
          group={activeGroup}
          onClose={() => setActiveGroup(null)}
          onViewed={markViewed}
          onToggleLike={toggleLike}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
        />
      )}

      {/* Highlight viewer reuses the same full-screen player */}
      {activeHighlight && (
        <StoryViewerModal
          group={{
            friendId: activeHighlight.id,
            friendName: activeHighlight.title,
            emoji: '⭐',
            color: colors.primary,
            stories: activeHighlight.stories,
            allViewed: true,
            isMine: true,
          }}
          onClose={() => setActiveHighlight(null)}
          onViewed={() => {}}
          onToggleLike={toggleLike}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
        />
      )}

      {/* Full-screen composer: add text/location/mentions before publishing */}
      {composerUri && (
        <StoryComposerModal
          uri={composerUri}
          mediaType={composerType}
          uploading={uploading}
          onCancel={() => setComposerUri(null)}
          onPublish={(payload) => handlePublishStory(composerUri, composerType, payload)}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
        />
      )}

      {/* Global search: find anyone, incl. private accounts */}
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} currentUserId={currentUserId} />

      {/* Notifications: likes + friend requests + new stories */}
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
      />
    </SafeAreaView>
  );
};

const SectionLabel: React.FC<{ title: string; icon?: React.ReactNode }> = ({ title, icon }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelLeft}>
        {icon}
        <Text style={styles.sectionLabel}>{title}</Text>
      </View>
      <TouchableOpacity style={styles.sectionMoreBtn} activeOpacity={0.6}>
        <Text style={styles.sectionMoreText}>More</Text>
        <ChevronRight size={13} color={colors.textFaint} strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  );
};

// ---------------------------------------------------------------------
// My-story bubble with a 3-dot menu: save to highlight / delete
// ---------------------------------------------------------------------

const MyStoryBubble: React.FC<{
  story: StoryRow;
  index: number;
  onPress: () => void;
  onDelete: () => void;
  onAddToHighlight: (title: string) => void;
}> = ({ story, index, onPress, onDelete, onAddToHighlight }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickTitleOpen, setPickTitleOpen] = useState(false);

  return (
    <View style={styles.storyBubble}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <View style={[styles.ring, { borderColor: colors.primary }]}>
          <Image source={{ uri: story.media_url }} style={styles.bubbleThumb} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dotsBtn} onPress={() => setMenuOpen(true)}>
        <MoreHorizontal size={14} color={colors.bg} strokeWidth={2.5} />
      </TouchableOpacity>

      <Text style={styles.storyName} numberOfLines={1}>
        {index === 0 ? 'My story' : `Story ${index + 1}`}
      </Text>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setPickTitleOpen(true);
              }}
            >
              <BookmarkPlus size={18} color={colors.text} strokeWidth={2} />
              <Text style={styles.menuItemText}>Add to highlights</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                Alert.alert('Delete story', 'Are you sure you want to delete this story?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                ]);
              }}
            >
              <Trash2 size={18} color={colors.danger ?? '#ff3b30'} strokeWidth={2} />
              <Text style={[styles.menuItemText, { color: colors.danger ?? '#ff3b30' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={pickTitleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickTitleOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setPickTitleOpen(false)}
        >
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>Choose a highlight</Text>
            {HIGHLIGHT_TITLES.map((title: string) => (
              <TouchableOpacity
                key={title}
                style={styles.menuItem}
                onPress={() => {
                  setPickTitleOpen(false);
                  onAddToHighlight(title);
                }}
              >
                <Star size={16} color={colors.primary} strokeWidth={2} />
                <Text style={styles.menuItemText}>{title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------
// Global search modal — find anyone by name/username, including
// private accounts you're not yet friends with.
// ---------------------------------------------------------------------

const SearchModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  currentUserId: string | null;
}> = ({ visible, onClose, currentUserId }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      // Friendship status is checked from BOTH directions: the
      // current user may have sent the request (requester_id) or
      // received it (friend_id). The previous query only joined on
      // friend_id, so a friendship the current user had initiated
      // was invisible here and those users showed an "Add" button
      // even though they were already friends (or pending).
      const [asRequester, asTarget] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, username, emoji, avatar_color, is_private')
          .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
          .neq('id', currentUserId ?? '')
          .limit(20),
        supabase
          .from('friendships')
          .select('requester_id, friend_id, status')
          .or(`requester_id.eq.${currentUserId ?? ''},friend_id.eq.${currentUserId ?? ''}`)
          .eq('status', 'accepted'),
      ]);

      if (asRequester.data) {
        const friendIds = new Set<string>(
          (asTarget.data ?? []).map((f: any) =>
            f.requester_id === currentUserId ? f.friend_id : f.requester_id
          )
        );
        setResults(
          asRequester.data.map((u: any) => ({
            id: u.id,
            name: u.name,
            username: u.username,
            emoji: u.emoji ?? '🙂',
            color: u.avatar_color ?? colors.primary,
            is_friend: friendIds.has(u.id),
            is_private: !!u.is_private,
          }))
        );
      }
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentUserId]);

  const sendFriendRequest = async (targetId: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('friendships').insert({
      requester_id: currentUserId,
      friend_id: targetId,
      status: 'pending',
    });
    if (error) {
      Alert.alert('Error', 'Could not send friend request.');
      return;
    }
    Alert.alert('Request sent', 'Your friend request has been sent.');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
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
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <View style={styles.searchRow}>
              <Avatar emoji={item.emoji} color={item.color} size={44} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.searchName}>{item.name}</Text>
                <Text style={styles.searchUsername}>
                  @{item.username} {item.is_private ? '· Private' : ''}
                </Text>
              </View>
              {!item.is_friend && (
                <TouchableOpacity style={styles.addFriendBtn} onPress={() => sendFriendRequest(item.id)}>
                  <UserPlus size={14} color={colors.bg} strokeWidth={2.5} />
                  <Text style={styles.addFriendBtnText}>{item.is_private ? 'Request' : 'Add'}</Text>
                </TouchableOpacity>
              )}
              {item.is_friend && (
                <View style={styles.friendBadgeWrap}>
                  <UserCheck size={14} color={colors.textFaint} strokeWidth={2} />
                  <Text style={styles.friendBadge}>Friend</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            !searching && query.trim() ? <Text style={styles.emptyRowText}>No results found</Text> : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Notifications modal — story likes + follow requests + new stories
// ---------------------------------------------------------------------

const NotificationsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  notifications: NotificationRow[];
}> = ({ visible, onClose, notifications }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const describe = (n: NotificationRow) => {
    switch (n.type) {
      case 'like':
        return `${n.actor_name} liked your story`;
      case 'follow_request':
        return `${n.actor_name} sent you a friend request`;
      case 'new_story':
        return `${n.actor_name} posted a new story`;
      case 'mention':
        return `${n.actor_name} mentioned you in a story`;
      default:
        return '';
    }
  };

  const NotifIcon: React.FC<{ type: NotificationRow['type'] }> = ({ type }) => {
    switch (type) {
      case 'like':
        return <Heart size={16} color={colors.danger ?? '#ff3b30'} fill={colors.danger ?? '#ff3b30'} />;
      case 'follow_request':
        return <UserPlus size={16} color={colors.primary} strokeWidth={2.5} />;
      case 'new_story':
      case 'mention':
        return <Star size={16} color={colors.primary} strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeaderRow}>
          <Text style={styles.modalTitle}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <View style={[styles.notifRow, !item.read && styles.notifRowUnread]}>
              <View style={styles.notifAvatarWrap}>
                <Avatar emoji={item.actor_emoji} color={item.actor_color} size={40} />
                <View style={styles.notifIconBadge}>
                  <NotifIcon type={item.type} />
                </View>
              </View>
              <Text style={styles.notifText}>{describe(item)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyRowText}>No notifications yet</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

const makeStyles = (colors: ColorScheme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
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
  sectionMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionMoreText: { ...typography.small, color: colors.textFaint, fontWeight: '600' },

  rowScroll: { marginTop: 2 },
  emptyRowText: { ...typography.small, color: colors.textFaint, paddingVertical: spacing.md },

  storyBubble: { alignItems: 'center', marginRight: spacing.md, width: 72 },
  ring: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addRing: {
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.card,
  },
  highlightRing: { borderColor: colors.border },

  highlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  highlightCard: {
    width: '23.5%',
    aspectRatio: 0.68,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  highlightCardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  highlightCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
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
  bubbleThumb: { width: '100%', height: '100%' },

  dotsBtn: {
    position: 'absolute',
    bottom: 20,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  storyName: { ...typography.small, color: colors.textDim, marginTop: 6, textAlign: 'center' },

  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  menuSheetTitle: {
    ...typography.body,
    color: colors.textFaint,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  menuItemText: { ...typography.body, color: colors.text, fontWeight: '600' },

  modalSafe: { flex: 1, backgroundColor: colors.bg },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  modalTitle: { ...typography.h1, color: colors.text },
  modalCloseBtn: { padding: spacing.sm },
  modalCloseText: { color: colors.primary, fontWeight: '700' },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInputIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.text,
    ...typography.body,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  notifText: { ...typography.body, color: colors.text, flex: 1 },
});

export default StoriesScreen;