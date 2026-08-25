import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Modal,
  Dimensions,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from '../components/Avatar';
import { SectionHeader } from '../components/Card';
import { supabase } from '../utils/supabase';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

type StoryRow = {
  id: string;
  owner_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string;
};

type FriendStoryGroup = {
  friendId: string;
  friendName: string;
  emoji: string;
  color: string;
  stories: StoryRow[];
  allViewed: boolean;
};

const { width: SCREEN_W } = Dimensions.get('window');
const STORY_DURATION_MS = 5000;

// ---------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------

const StoriesScreen: React.FC = () => {
  const { friends } = useApp();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myStories, setMyStories] = useState<StoryRow[]>([]);
  const [friendStories, setFriendStories] = useState<StoryRow[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeGroup, setActiveGroup] = useState<FriendStoryGroup | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // -------------------------------------------------------------
  // Load + realtime subscribe to stories (only non-expired ones,
  // enforced additionally by RLS policy on the stories table)
  // -------------------------------------------------------------
  const loadStories = useCallback(async () => {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const mine = (data as StoryRow[]).filter((s) => s.owner_id === currentUserId);
    const others = (data as StoryRow[]).filter((s) => s.owner_id !== currentUserId);
    setMyStories(mine);
    setFriendStories(others);
    setLoading(false);
  }, [currentUserId]);

  const loadViewedIds = useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', currentUserId);
    if (data) setViewedIds(new Set(data.map((r: { story_id: string }) => r.story_id)));
  }, [currentUserId]);

  useEffect(() => {
    loadStories();
    loadViewedIds();

    const channel = supabase
      .channel('stories-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        loadStories();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStories, loadViewedIds]);

  // -------------------------------------------------------------
  // Group friend stories by friend (so each avatar = 1 ring)
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

    // Ko'rilmaganlar birinchi bo'lib chiqadi
    return result.sort((a, b) => Number(a.allViewed) - Number(b.allViewed));
  }, [friendStories, friends, viewedIds]);

  // -------------------------------------------------------------
  // Upload a new story (image only in this base version)
  // -------------------------------------------------------------
  const handleAddStory = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Ruxsat kerak', 'Galereyaga kirish uchun ruxsat bering.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [9, 16],
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const fileExt = asset.uri.split('.').pop() ?? 'jpg';
      const fileName = `${currentUserId}/${Date.now()}.${fileExt}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(fileName, blob, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('story-media')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from('stories').insert({
        owner_id: currentUserId,
        media_url: publicUrlData.publicUrl,
        media_type: 'image',
      });

      if (insertError) throw insertError;

      loadStories();
    } catch (err) {
      Alert.alert('Xatolik', "Story yuklashda muammo yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setUploading(false);
    }
  };

  const markViewed = useCallback(
    async (storyId: string) => {
      if (viewedIds.has(storyId) || !currentUserId) return;
      setViewedIds((prev) => new Set(prev).add(storyId));
      await supabase.from('story_views').insert({ story_id: storyId, viewer_id: currentUserId });
    },
    [viewedIds, currentUserId]
  );

  const myAllViewed = myStories.length > 0; // egasi o'z storysini har doim "ko'rgan" sanaladi

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>Stories</Text>
        <Text style={styles.subheader}>Faqat do'stlaringiz ko'radi · 24 soatda yo'qoladi</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.lg }}>
          {/* Add / My story bubble */}
          <TouchableOpacity
            style={styles.storyBubble}
            onPress={() => (myStories.length > 0 ? setActiveGroup(myStoryGroup(myStories, currentUserId)) : handleAddStory())}
            onLongPress={handleAddStory}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.ring,
                { borderColor: myStories.length > 0 ? colors.primary : colors.border },
              ]}
            >
              <Avatar emoji="🙂" color={colors.primary} size={58} />
              <View style={styles.plusBadge}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Text style={styles.plusBadgeText}>+</Text>
                )}
              </View>
            </View>
            <Text style={styles.storyName} numberOfLines={1}>
              Mening storyim
            </Text>
          </TouchableOpacity>

          {loading && <ActivityIndicator style={{ marginLeft: spacing.lg }} color={colors.primary} />}

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

        {!loading && groups.length === 0 && myStories.length === 0 && (
          <View style={{ marginTop: spacing.xxl }}>
            <SectionHeader title="Hozircha bo'sh" subtitle="Do'stlaringiz story qo'shganda shu yerda ko'rinadi" />
          </View>
        )}
      </ScrollView>

      {activeGroup && (
        <StoryViewerModal
          group={activeGroup}
          onClose={() => setActiveGroup(null)}
          onViewed={markViewed}
        />
      )}
    </SafeAreaView>
  );
};

function myStoryGroup(stories: StoryRow[], userId: string | null): FriendStoryGroup {
  return {
    friendId: userId ?? 'me',
    friendName: 'Mening storyim',
    emoji: '🙂',
    color: colors.primary,
    stories,
    allViewed: true,
  };
}

// ---------------------------------------------------------------------
// Full-screen story viewer with auto-advancing progress bars
// ---------------------------------------------------------------------

const StoryViewerModal: React.FC<{
  group: FriendStoryGroup;
  onClose: () => void;
  onViewed: (storyId: string) => void;
}> = ({ group, onClose, onViewed }) => {
  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const current = group.stories[index];

  useEffect(() => {
    if (!current) return;
    onViewed(current.id);
    progress.setValue(0);

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });

    anim.start(({ finished }) => {
      if (finished) goNext();
    });

    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

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

  if (!current) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerContainer}>
        <View style={styles.progressRow}>
          {group.stories.map((s, i) => (
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
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <Image source={{ uri: current.media_url }} style={styles.viewerImage} resizeMode="cover" />

        {current.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{current.caption}</Text>
          </View>
        ) : null}

        <View style={styles.tapZones}>
          <TouchableOpacity style={styles.tapZoneLeft} onPress={goPrev} />
          <TouchableOpacity style={styles.tapZoneRight} onPress={goNext} />
        </View>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  header: { ...typography.h1, color: colors.text },
  subheader: { ...typography.body, color: colors.textFaint, marginTop: 4 },

  storyBubble: { alignItems: 'center', marginRight: spacing.md, width: 72 },
  ring: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBadge: {
    position: 'absolute',
    bottom: -2,
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
  plusBadgeText: { color: colors.bg, fontWeight: '800', fontSize: 14, lineHeight: 16 },
  storyName: { ...typography.small, color: colors.textDim, marginTop: 6, textAlign: 'center' },

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
  closeBtnText: { color: '#fff', fontSize: 18 },
  viewerImage: { flex: 1, width: SCREEN_W, marginTop: spacing.sm },
  captionWrap: {
    position: 'absolute',
    bottom: 40,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  captionText: { color: '#fff', ...typography.body },
  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', top: 60 },
  tapZoneLeft: { flex: 1 },
  tapZoneRight: { flex: 2 },
});

export default StoriesScreen;