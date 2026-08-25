import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { colors, radius, spacing, typography } from '../theme/theme';
import Avatar from './Avatar';
import { Card, SectionHeader } from './Card';
import { supabase } from '../utils/supabase';

type NearbyPerson = {
  user_id: string;
  distance_km: number;
  full_name: string;
  avatar_emoji: string;
  avatar_color: string;
};

// Ekranning istalgan joyiga qo'yish mumkin bo'lgan mustaqil komponent,
// masalan FriendsListScreen yoki HomeScreen yuqorisiga.
const NearbySuggestions: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle');
  const [people, setPeople] = useState<NearbyPerson[]>([]);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const loadNearby = useCallback(async () => {
    setStatus('loading');

    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setStatus('denied');
      return;
    }

    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      // Lokatsiyani serverga yozamiz (upsert), keyin RPC chaqiramiz
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setStatus('error');
        return;
      }

      await supabase.from('user_locations').upsert({
        user_id: userId,
        location: `POINT(${pos.coords.longitude} ${pos.coords.latitude})`,
        updated_at: new Date().toISOString(),
      });

      const { data: nearby, error } = await supabase.rpc('nearby_friend_suggestions', {
        radius_km: 25,
        max_results: 20,
      });

      if (error || !nearby) {
        setStatus('error');
        return;
      }

      if (nearby.length === 0) {
        setPeople([]);
        setStatus('ready');
        return;
      }

      const ids = nearby.map((n: { user_id: string }) => n.user_id);
      const { data: profiles } = await supabase
        .from('discoverable_profiles')
        .select('*')
        .in('id', ids);

      const merged: NearbyPerson[] = nearby.map((n: { user_id: string; distance_km: number }) => {
        const p = profiles?.find((pr: any) => pr.id === n.user_id);
        return {
          user_id: n.user_id,
          distance_km: n.distance_km,
          full_name: p?.full_name ?? 'Foydalanuvchi',
          avatar_emoji: p?.avatar_emoji ?? '🙂',
          avatar_color: p?.avatar_color ?? colors.primary,
        };
      });

      setPeople(merged);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  const sendRequest = async (targetId: string) => {
    setRequestedIds((prev) => new Set(prev).add(targetId));
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    await supabase.from('friendships').insert({
      user_id: userId,
      friend_id: targetId,
      status: 'pending',
    });
  };

  if (status === 'idle' || status === 'loading') {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Nearby People" subtitle="Based on your location" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Nearby People" subtitle="Based on your location" />
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={styles.emptyText}>
            Tavsiyalarni ko'rish uchun joylashuvga ruxsat bering.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadNearby}>
            <Text style={styles.retryBtnText}>Qayta urinish</Text>
          </TouchableOpacity>
        </Card>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Nearby People" subtitle="Based on your location" />
        <Card style={{ marginTop: spacing.sm }}>
          <Text style={styles.emptyText}>Yuklashda xatolik yuz berdi.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadNearby}>
            <Text style={styles.retryBtnText}>Qayta urinish</Text>
          </TouchableOpacity>
        </Card>
      </View>
    );
  }

  if (people.length === 0) {
    return (
      <View style={{ marginTop: spacing.lg }}>
        <SectionHeader title="Nearby People" subtitle="Based on your location" />
        <Text style={styles.emptyText}>Curently no nearby people found.</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: spacing.lg }}>
      <SectionHeader title="Nearby People" subtitle="Based on your location" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
        {people.map((p) => (
          <Card key={p.user_id} style={styles.personCard}>
            <Avatar emoji={p.avatar_emoji} color={p.avatar_color} size={54} />
            <Text style={styles.personName} numberOfLines={1}>
              {p.full_name}
            </Text>
            <Text style={styles.personDistance}>{p.distance_km} km narida</Text>
            <TouchableOpacity
              style={[styles.addBtn, requestedIds.has(p.user_id) && styles.addBtnDisabled]}
              onPress={() => sendRequest(p.user_id)}
              disabled={requestedIds.has(p.user_id)}
            >
              <Text style={styles.addBtnText}>
                {requestedIds.has(p.user_id) ? 'Yuborildi' : "Do'st qo'shish"}
              </Text>
            </TouchableOpacity>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  personCard: {
    width: 140,
    marginRight: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  personName: { ...typography.bodyBold, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  personDistance: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  addBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    width: '100%',
  },
  addBtnDisabled: { backgroundColor: colors.cardAlt },
  addBtnText: { ...typography.small, color: colors.bg, fontWeight: '700', textAlign: 'center' },
  emptyText: { ...typography.body, color: colors.textFaint, marginTop: spacing.sm },
  retryBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  retryBtnText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
});

export default NearbySuggestions;