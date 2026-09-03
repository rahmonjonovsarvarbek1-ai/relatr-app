import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useProfileSettings } from '../hooks/useProfileSettings';
import { supabase } from '../utils/supabase';
import Avatar from '../components/Avatar';
import StoryViewerModal from './StoryViewerModal';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import type { FriendshipStatus } from '../types';
import type { StoryRow, FriendStoryGroup } from '../types/storyTypes';
// ---------------------------------------------------------------------
// Route params this screen accepts. It can be reached two ways:
//  1) From StoriesScreen's search/notifications with just a profile id
//     (friendshipId is unknown yet — no friendships row may exist).
//  2) From ProfileScreen's Contacts list, which already has the full
//     AppContact (friendshipId, status, isIncoming all known up front).
// Either way this screen resolves the current friendship state itself
// via `friendships`, so navigation can pass whichever it has.
// ---------------------------------------------------------------------
type ContactProfileParams = {
  userId: string;
  // Optional pre-known values to avoid a flash of "not connected" while
  // the fresh fetch resolves. Safe to omit.
  name?: string;
  username?: string;
  emoji?: string;
  avatarColor?: string;
  avatarUrl?: string;
};

type ResolvedProfile = {
  id: string;
  name: string;
  username: string;
  emoji: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  school?: string;
  instagram?: string;
  interests: string[];
  isPrivate: boolean;
};

type Friendship = {
  id: string;
  status: FriendshipStatus;
  isIncoming: boolean; // true if THEY sent it to me
};

// UUID v1-v5 shape check. `friendships.friend_id` / `requester_id` are
// uuid columns with a FK to `profiles(id)`, so anything that isn't a
// well-formed UUID can never satisfy that constraint and is worth
// catching client-side before we even hit Postgres.
const isValidUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const ContactProfileScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params as ContactProfileParams;
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();

  const settings = useProfileSettings();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ResolvedProfile | null>(null);
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [stories, setStories] = useState<StoryRow[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const isConnected = friendship?.status === 'accepted';
  const isPendingIncoming = friendship?.status === 'pending' && friendship.isIncoming;
  const isPendingOutgoing = friendship?.status === 'pending' && !friendship.isIncoming;

  // Dev-time sanity check: log once if the params this screen was
  // opened with look wrong, so a bad navigation call (missing/undefined
  // userId) is obvious in the console instead of surfacing later as an
  // opaque 23503 from Postgres.
  useEffect(() => {
    if (!isValidUuid(params?.userId)) {
      console.warn(
        '[ContactProfileScreen] route params.userId is missing or not a UUID:',
        params?.userId,
        '— check the navigation.navigate(...) call that opened this screen.'
      );
    }
  }, [params?.userId]);

  // -----------------------------------------------------------------
  // Load the target profile + the friendship row between me and them
  // (checked from both directions, same as StoriesScreen's search).
  // -----------------------------------------------------------------
  const load = useCallback(async () => {
    if (!meId || !params?.userId) return;
    setLoading(true);
    try {
      const [{ data: profileRow, error: profileError }, { data: friendshipRow, error: friendshipError }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, name, username, emoji, avatar_color, avatar_url, bio, city, school, instagram, interests, private_account')
            .eq('id', params.userId)
            .maybeSingle(),
          supabase
            .from('friendships')
            .select('id, requester_id, friend_id, status')
            .or(
              `and(requester_id.eq.${meId},friend_id.eq.${params.userId}),and(requester_id.eq.${params.userId},friend_id.eq.${meId})`
            )
            .maybeSingle(),
        ]);

      if (profileError) {
        console.error('ContactProfile load (profile) error:', profileError.message);
      }
      if (friendshipError) {
        console.error('ContactProfile load (friendship) error:', friendshipError.message);
      }

      if (profileRow) {
        setProfile({
          id: profileRow.id,
          name: profileRow.name,
          username: profileRow.username,
          emoji: profileRow.emoji ?? '🙂',
          avatarColor: profileRow.avatar_color ?? colors.primary,
          avatarUrl: profileRow.avatar_url ?? undefined,
          bio: profileRow.bio ?? undefined,
          city: profileRow.city ?? undefined,
          school: profileRow.school ?? undefined,
          instagram: profileRow.instagram ?? undefined,
          interests: profileRow.interests ?? [],
          isPrivate: !!profileRow.private_account,
        });
      } else if (params.name) {
        // Fallback to whatever the caller already passed in, so the
        // screen isn't blank if the profile fetch is denied by RLS
        // for a non-contact (e.g. private accounts).
        setProfile({
          id: params.userId,
          name: params.name,
          username: params.username ?? '',
          emoji: params.emoji ?? '🙂',
          avatarColor: params.avatarColor ?? colors.primary,
          avatarUrl: params.avatarUrl,
          interests: [],
          isPrivate: true,
        });
      } else {
        // Neither a real profiles row nor fallback params came through.
        // This is the same "id" mismatch that causes 23503 below — the
        // userId this screen was opened with does not correspond to any
        // row in `profiles`. Surfacing it here catches the problem
        // before the user even tries to send a request.
        console.error(
          'ContactProfile: no profiles row found for params.userId =',
          params.userId,
          '— this id will also fail the friendships FK if a request is sent.'
        );
      }

      if (friendshipRow) {
        setFriendship({
          id: friendshipRow.id,
          status: friendshipRow.status,
          isIncoming: friendshipRow.status === 'pending' && friendshipRow.friend_id === meId,
        });
      } else {
        setFriendship(null);
      }
    } finally {
      setLoading(false);
    }
  }, [meId, params, colors.primary]);

  useEffect(() => {
    load();
  }, [load]);

  // -----------------------------------------------------------------
  // Once connected (accepted), load this contact's active (non-
  // highlight, unexpired) stories — same shape StoriesScreen uses —
  // so they can be viewed right from this profile.
  // -----------------------------------------------------------------
  const loadStories = useCallback(async () => {
    if (!isConnected || !params?.userId) {
      setStories([]);
      return;
    }
    setStoriesLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('owner_id', params.userId)
        .eq('is_highlight', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      if (error) {
        console.error('ContactProfile loadStories error:', error.message);
        return;
      }
      setStories((data ?? []) as StoryRow[]);
    } finally {
      setStoriesLoading(false);
    }
  }, [isConnected, params]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // -----------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------
  // Confirms a row with the given id actually exists in `profiles`
  // before we let a friendships insert/update reference it. A 23503 on
  // friend_id/requester_id means Postgres rejected exactly this — doing
  // the check client-side lets us show the user (and yourself, via the
  // console) which id is the problem instead of a bare Postgres code.
  const ensureProfileExists = async (userId: string, label: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error(`ensureProfileExists(${label}) error:`, error.code, error.message);
      Alert.alert('Xatolik', `${label} profilini tekshirishda xatolik yuz berdi: ${error.message}`);
      return false;
    }
    if (!data) {
      // Either the row genuinely doesn't exist, or an RLS SELECT policy
      // on `profiles` is hiding it from the current user — both look
      // identical from here and both will trigger 23503 downstream.
      console.error(
        `ensureProfileExists(${label}): profiles jadvalida id=${userId} topilmadi (yoki RLS uni yashiryapti).`
      );
      Alert.alert(
        'Profil topilmadi',
        `${label} uchun profiles jadvalida mos yozuv topilmadi (ID: ${userId}). ` +
          'Foreign key xatosi (23503) aynan shu sabab bilan yuzaga kelmoqda.'
      );
      return false;
    }
    return true;
  };

  // Sends (or re-sends) a friend request between meId and params.userId.
  //
  // NOTE: `friendships` has a UNIQUE(requester_id, friend_id) constraint,
  // which is direction-sensitive. If a row already exists in EITHER
  // direction (e.g. a previous request was declined, or they had already
  // requested me before I looked), a plain `insert` here can violate that
  // constraint (or a symmetric unique index, if one was added) and always
  // resolve to the generic "Could not send friend request" error.
  //
  // To handle this correctly we:
  //   0) Validate meId/params.userId are well-formed UUIDs and that both
  //      correspond to real `profiles` rows (this is what 23503 checks
  //      at the DB level — we check it first so the failure is clear).
  //   1) Re-check for an existing row right before writing (covers races
  //      where `friendship` state is stale).
  //   2) If a row exists, UPDATE it back to 'pending' (reusing the same
  //      row/id) instead of inserting a duplicate.
  //   3) If no row exists, INSERT a fresh one.
  //   4) On any Supabase error, surface the real code/message so future
  //      failures are actionable instead of a generic alert.
  const sendRequest = async () => {
    if (!meId) {
      Alert.alert('Xatolik', 'Sessiya topilmadi. Iltimos, qaytadan tizimga kiring.');
      return;
    }
    if (!isValidUuid(params?.userId)) {
      console.error('sendRequest: params.userId is missing or not a valid UUID:', params?.userId);
      Alert.alert('Xatolik', "Foydalanuvchi ID topilmadi yoki noto'g'ri formatda.");
      return;
    }
    if (meId === params.userId) {
      Alert.alert('Xatolik', "O'zingizga do'stlik so'rovi yubora olmaysiz.");
      return;
    }

    setActionLoading(true);
    try {
      // Client-side pre-check for exactly the condition that causes
      // Postgres error 23503 on friendships_friend_id_fkey /
      // friendships_requester_id_fkey.
      const targetOk = await ensureProfileExists(params.userId, 'Maqsadli foydalanuvchi');
      if (!targetOk) return;

      const meOk = await ensureProfileExists(meId, 'Sizning');
      if (!meOk) return;

      const { data: existing, error: existingError } = await supabase
        .from('friendships')
        .select('id, status, requester_id, friend_id')
        .or(
          `and(requester_id.eq.${meId},friend_id.eq.${params.userId}),and(requester_id.eq.${params.userId},friend_id.eq.${meId})`
        )
        .maybeSingle();

      if (existingError) {
        console.error('sendRequest lookup error:', existingError.code, existingError.message);
        Alert.alert('Xatolik', `${existingError.message}${existingError.code ? ` (${existingError.code})` : ''}`);
        return;
      }

      let error;
      if (existing) {
        // Reuse the existing row — re-activate it as a pending request
        // from me, regardless of its previous status/direction.
        ({ error } = await supabase
          .from('friendships')
          .update({
            requester_id: meId,
            friend_id: params.userId,
            status: 'pending',
          })
          .eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('friendships').insert({
          requester_id: meId,
          friend_id: params.userId,
          status: 'pending',
        }));
      }

      if (error) {
        console.error('sendRequest write error:', error.code, error.message, error.details, error.hint);
        if (error.code === '23503') {
          // Should be rare now that ensureProfileExists runs first, but
          // can still happen on a race (the profile row was deleted
          // between the check and the write).
          Alert.alert(
            "Bog'lanish xatosi (23503)",
            "friendships.friend_id yoki requester_id qiymati profiles jadvalida mavjud emas. " +
              "Ushbu javob bilan birga berilgan SQL diagnostika skriptini ishga tushiring."
          );
        } else {
          Alert.alert('Xatolik', `${error.message}${error.code ? ` (${error.code})` : ''}`);
        }
        return;
      }

      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const acceptRequest = async () => {
    if (!friendship) return;
    setActionLoading(true);
    await settings.acceptContactRequest(friendship.id);
    setActionLoading(false);
    load();
  };

  const declineRequest = async () => {
    if (!friendship) return;
    setActionLoading(true);
    await settings.declineContactRequest(friendship.id);
    setActionLoading(false);
    setFriendship(null);
  };

  // Cancel an outgoing request, or remove an existing (accepted)
  // contact — both are just "delete the friendships row" per the
  // schema, matching removeContact/declineContactRequest in the hook.
  const cancelOrRemove = (mode: 'cancel' | 'remove') => {
    if (!friendship) return;
    const isRemove = mode === 'remove';
    Alert.alert(
      isRemove ? 'Remove contact' : 'Cancel request',
      isRemove
        ? `Remove ${profile?.name ?? 'this person'} from your contacts?`
        : 'Cancel your friend request?',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: isRemove ? 'Remove' : 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            await settings.removeContact(friendship.id);
            setActionLoading(false);
            setFriendship(null);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerFill}>
          <Text style={{ color: colors.textFaint, ...typography.body }}>User not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const metaLine = [profile.city, profile.school].filter(Boolean).join(' · ');
  const isMe = meId === profile.id;

  // Group this contact's stories into the shape StoryViewerModal expects
  const storyGroup: FriendStoryGroup = {
    friendId: profile.id,
    friendName: profile.name,
    emoji: profile.emoji,
    color: profile.avatarColor,
    stories,
    allViewed: true,
    isMine: false,
    avatarUrl: undefined
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          {!isMe && isConnected && (
            <TouchableOpacity onPress={() => cancelOrRemove('remove')} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>

        {/* Header — mirrors ProfileScreen's headerRow */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>
            {isConnected && !!metaLine && <Text style={styles.meta}>{metaLine}</Text>}
          </View>

          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Avatar emoji={profile.emoji} color={profile.avatarColor} size={68} />
          )}
        </View>

        {/* -------------------------------------------------- */}
        {/* NOT CONNECTED: private-style gate with request state */}
        {/* -------------------------------------------------- */}
        {!isMe && !isConnected && (
          <>
            <View style={styles.privateBanner}>
              <Ionicons name="lock-closed" size={16} color={colors.textDim} />
              <Text style={styles.privateBannerText}>
                {profile.isPrivate ? 'This account is private' : 'Not connected yet'}
              </Text>
              <Text style={styles.privateBannerSub}>
                Connect with {profile.name.split(' ')[0]} to see their profile details and stories.
              </Text>
            </View>

            {!friendship && (
              <TouchableOpacity
                style={[styles.primaryBtn, actionLoading && styles.btnDisabled]}
                onPress={sendRequest}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={16} color={colors.bg} />
                    <Text style={styles.primaryBtnText}>
                      {profile.isPrivate ? 'Request to connect' : 'Add contact'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {isPendingIncoming && (
              <View style={styles.requestRow}>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, actionLoading && styles.btnDisabled]}
                  onPress={acceptRequest}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Accept</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryBtn, actionLoading && styles.btnDisabled]}
                  onPress={declineRequest}
                  disabled={actionLoading}
                >
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}

            {isPendingOutgoing && (
              <TouchableOpacity
                style={[styles.secondaryBtn, actionLoading && styles.btnDisabled]}
                onPress={() => cancelOrRemove('cancel')}
                disabled={actionLoading}
              >
                <Ionicons name="time-outline" size={16} color={colors.textDim} />
                <Text style={styles.secondaryBtnText}>Requested · Cancel</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* -------------------------------------------------- */}
        {/* CONNECTED: full profile + stories                    */}
        {/* -------------------------------------------------- */}
        {(isMe || isConnected) && (
          <>
            {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

            {profile.instagram ? (
              <View style={styles.igRow}>
                <Ionicons name="logo-instagram" size={14} color={colors.textDim} />
                <Text style={styles.igText}>{profile.instagram}</Text>
              </View>
            ) : null}

            {profile.interests.length > 0 && (
              <View style={styles.interestsRow}>
                {profile.interests.map((i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionLabel}>STORY</Text>
            {storiesLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
            ) : stories.length === 0 ? (
              <Text style={styles.emptyText}>No active story right now.</Text>
            ) : (
              <TouchableOpacity
                style={styles.storyPreviewRow}
                activeOpacity={0.8}
                onPress={() => setViewerOpen(true)}
              >
                <View style={[styles.ring, { borderColor: colors.primary }]}>
                  <Image source={{ uri: stories[0].media_url }} style={styles.storyThumb} />
                </View>
                <View style={{ marginLeft: spacing.md, flex: 1 }}>
                  <Text style={styles.storyPreviewTitle}>
                    {stories.length === 1 ? '1 story' : `${stories.length} stories`}
                  </Text>
                  <Text style={styles.storyPreviewSub}>Tap to view</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </TouchableOpacity>
            )}

            {!isMe && (
              <TouchableOpacity
                style={[styles.dangerRow]}
                onPress={() => cancelOrRemove('remove')}
                disabled={actionLoading}
              >
                <Ionicons name="person-remove-outline" size={16} color="#FF3B30" />
                <Text style={styles.dangerRowText}>Remove contact</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      {viewerOpen && stories.length > 0 && (
        <StoryViewerModal
          group={storyGroup}
          onClose={() => setViewerOpen(false)}
          onViewed={() => {}}
          onToggleLike={async () => {}}
          screenW={SCREEN_W}
          screenH={SCREEN_H}
        />
      )}
    </SafeAreaView>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },

    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginTop: spacing.sm,
    },
    name: { ...typography.h2, color: colors.text, fontWeight: '700' },
    username: { ...typography.body, color: colors.textDim, marginTop: 2 },
    meta: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
    avatarImage: { width: 68, height: 68, borderRadius: 34 },

    privateBanner: {
      backgroundColor: colors.cardAlt,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginTop: spacing.lg,
      alignItems: 'flex-start',
    },
    privateBannerText: {
      ...typography.bodyBold,
      color: colors.text,
      marginTop: spacing.xs,
    },
    privateBannerSub: {
      ...typography.caption,
      color: colors.textFaint,
      marginTop: 4,
    },

    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.md,
      gap: 6,
    },
    primaryBtnText: { ...typography.bodyBold, color: colors.bg },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.md,
      gap: 6,
    },
    secondaryBtnText: { ...typography.bodyBold, color: colors.textDim },
    requestRow: { flexDirection: 'row', gap: spacing.sm },
    btnDisabled: { opacity: 0.6 },

    bio: { ...typography.body, color: colors.text, marginTop: spacing.md, lineHeight: 20 },
    igRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
    igText: { ...typography.caption, color: colors.textDim, marginLeft: 6 },
    interestsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
    chip: {
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
      marginRight: spacing.xs,
      marginBottom: spacing.xs,
    },
    chipText: { ...typography.caption, color: colors.textDim },

    sectionLabel: {
      ...typography.caption,
      color: colors.textFaint,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginTop: spacing.xl,
      marginBottom: spacing.xs,
      marginLeft: 2,
    },
    emptyText: { ...typography.caption, color: colors.textFaint, marginTop: spacing.xs },

    storyPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    ring: {
      width: 54,
      height: 54,
      borderRadius: 27,
      borderWidth: 2.5,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    storyThumb: { width: '100%', height: '100%' },
    storyPreviewTitle: { ...typography.bodyBold, color: colors.text },
    storyPreviewSub: { ...typography.caption, color: colors.textFaint, marginTop: 2 },

    dangerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.xl,
      gap: 6,
    },
    dangerRowText: { ...typography.bodyBold, color: '#FF3B30' },
  });

export default ContactProfileScreen;