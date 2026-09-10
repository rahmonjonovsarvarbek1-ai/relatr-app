import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

export type ConnectedFriend = {
  id: string; // profiles.id — HAQIQIY
  name: string;
  username: string;
  emoji: string;
  avatarColor: string;
  avatarUrl?: string;
};

export function useConnectedFriends() {
  const { session } = useAuth();
  const meId = session?.user?.id ?? null;
  const [friends, setFriends] = useState<ConnectedFriend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!meId) {
      setFriends([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, user_id, friend_id, status,
         requester:profiles!friendships_user_id_fkey(id, name, username, emoji, avatar_color, avatar_url),
         target:profiles!friendships_friend_id_fkey(id, name, username, emoji, avatar_color, avatar_url)`
      )
      .eq('status', 'accepted')
      .or(`user_id.eq.${meId},friend_id.eq.${meId}`);

    if (error) {
      console.error('useConnectedFriends error:', error.message);
      setLoading(false);
      return;
    }

    const list: ConnectedFriend[] = (data ?? []).map((row: any) => {
      const other = row.user_id === meId ? row.target : row.requester;
      return {
        id: other.id,
        name: other.name,
        username: other.username,
        emoji: other.emoji ?? '🙂',
        avatarColor: other.avatar_color ?? '#8B5FE0',
        avatarUrl: other.avatar_url ?? undefined,
      };
    });

    setFriends(list);
    setLoading(false);
  }, [meId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`connected-friends-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, meId]);

  return { friends, loading, refresh: load };
}