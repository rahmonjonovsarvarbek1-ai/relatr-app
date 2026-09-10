import { Platform } from 'react-native';

// ---------------------------------------------------------------------
// Core story types
// ---------------------------------------------------------------------

export type StoryTextSticker = {
  id: string;
  text: string;
  x: number; // 0..1 relative position (relative to screenW)
  y: number; // 0..1 relative position (relative to screenH)
  fontFamily: string;
  color: string;
  bgMode: 'none' | 'solid' | 'soft';
  scale: number;
  rotation: number;
};

export type StoryMentionSticker = {
  id: string;
  friendId: string;
  friendName: string;
  x: number;
  y: number;
};

export type StoryLocationSticker = {
  id: string;
  label: string; // e.g. "Tashkent, Uzbekistan"
  x: number;
  y: number;
};

export type StoryRow = {
  [x: string]: any;
  id: string;
  owner_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string | null;
  is_highlight?: boolean;
  highlight_title?: string | null;
  like_count?: number;
  liked_by_me?: boolean;
  text_stickers?: StoryTextSticker[];
  location_label?: string | null;
  location_x?: number | null;
  location_y?: number | null;
};

export type FriendStoryGroup = {
  avatarUrl: any;
  friendId: string;
  friendName: string;
  emoji: string;
  color: string;
  stories: StoryRow[];
  allViewed: boolean;
  isMine?: boolean;
};

export type HighlightGroup = {
  id: string;
  title: string;
  coverUrl: string;
  stories: StoryRow[];
};

export type NotificationRow = {
  id: string;
  type: 'like' | 'follow_request' | 'new_story' | 'mention';
  actor_name: string;
  actor_emoji: string;
  actor_color: string;
  created_at: string;
  read: boolean;
};

export type SearchUser = {
  avatarUrl: string | undefined;
  id: string;
  name: string;
  username: string;
  emoji: string;
  color: string;
  is_friend: boolean;
  is_private: boolean;
};

export const HIGHLIGHT_TITLES = ['Travel', 'Friends', 'Food', 'Memories', 'Events'];

// ---------------------------------------------------------------------
// Composer options — fonts and colors for the Relatr text sticker tool
// ---------------------------------------------------------------------

export const STORY_FONTS: { id: string; label: string; fontFamily: string | undefined }[] = [
  { id: 'classic', label: 'Classic', fontFamily: undefined },
  {
    id: 'bold',
    label: 'Bold',
    fontFamily: Platform.select({ ios: 'HelveticaNeue-Bold', android: 'sans-serif-black' }),
  },
  {
    id: 'serif',
    label: 'Serif',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
  },
  {
    id: 'mono',
    label: 'Mono',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  {
    id: 'script',
    label: 'Script',
    fontFamily: Platform.select({ ios: 'Snell Roundhand', android: 'cursive' }),
  },
];

export const STORY_TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF3B5C', '#FFD93D', '#4ADE80', '#38BDF8', '#A78BFA', '#FB923C',
];

/**
 * Additions to types/storyTypes.ts to support:
 *  - showing who posted the story (poster identity on the frame)
 *  - showing the viewer count (only visible to the poster, i.e. group.isMine)
 *
 * Merge these into the existing storyTypes.ts file.
 */

export type StoryViewerEntry = {
  id: string;
  friendId: string;
  friendName: string;
  emoji?: string | null;
  color?: string | null;
  viewedAt: string; // ISO timestamp
};

// Extend StoryRow (already existing) with a denormalized viewer_count
// column so the UI can render it instantly without a join, plus poster
// display fields resolved from the profiles table.
export type StoryRowExtras = {
  viewer_count: number;
  poster_name: string;
  poster_emoji?: string | null;
  poster_color?: string | null;
  created_at: string; // ISO timestamp, used for "2h ago" style labels
};