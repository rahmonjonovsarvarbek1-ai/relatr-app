import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../utils/supabase';
import Avatar from '../../components/Avatar';
import { spacing, radius, typography } from '../../theme/theme';
import type { ColorScheme } from '../../theme/theme';
import OnboardingLayout from './OnboardingLayout';

interface SuggestedPerson {
  id: string;
  full_name: string;
  username: string | null;
  avatar_emoji: string;
  avatar_color: string;
}

interface Props {
  onBack: () => void;
  onFinish: (followedIds: string[]) => void;
}

const OnboardingFollowScreen: React.FC<Props> = ({ onBack, onFinish }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    // discoverable_profiles: profiles jadvalidan private_account = false
    // va joriy foydalanuvchidan tashqari hammani ko'rsatuvchi view.
    // Onboarding bosqichida hali joylashuv ruxsati so'ralmagani uchun
    // eng yangi qo'shilgan / eng ko'p do'stga ega profillarni tavsiya qilamiz.
    let query = supabase
      .from('discoverable_profiles')
      .select('id, full_name, username, avatar_emoji, avatar_color')
      .limit(12);

    if (userId) {
      query = query.neq('id', userId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setPeople(data as SuggestedPerson[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFinish = async () => {
    if (selected.size === 0) {
      onFinish([]);
      return;
    }

    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (userId) {
      const rows = Array.from(selected).map((targetId) => ({
        user_id: userId,
        friend_id: targetId,
        status: 'pending' as const,
      }));
      const { error } = await supabase.from('friendships').insert(rows);
      if (error) {
        console.error('onboarding follow error:', error.message);
      }
    }

    setSubmitting(false);
    onFinish(Array.from(selected));
  };

  return (
    <OnboardingLayout
      step={3}
      totalSteps={3}
      title="Kimlarni kuzatmoqchisiz?"
      subtitle="Tanlagan odamlaringizga do'stlik so'rovi yuboriladi"
      canContinue
      loading={submitting}
      nextLabel={selected.size > 0 ? `Davom etish (${selected.size})` : 'Yakunlash'}
      onNext={handleFinish}
      onBack={onBack}
      onSkip={() => onFinish([])}
    >
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : people.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Hozircha tavsiya qilish uchun odam topilmadi.</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {people.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.personCard, isSelected && styles.personCardSelected]}
                onPress={() => toggle(p.id)}
                activeOpacity={0.85}
              >
                <View>
                  <Avatar emoji={p.avatar_emoji || '🙂'} color={p.avatar_color || colors.primary} size={56} />
                  {isSelected && (
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={12} color={colors.bg} />
                    </View>
                  )}
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                  {p.full_name || 'Foydalanuvchi'}
                </Text>
                {!!p.username && (
                  <Text style={styles.personHandle} numberOfLines={1}>
                    @{p.username}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </OnboardingLayout>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    loadingWrap: { paddingTop: spacing.xxl, alignItems: 'center' },
    emptyWrap: { paddingTop: spacing.xxl, alignItems: 'center' },
    emptyText: { ...typography.body, color: colors.textFaint, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    personCard: {
      width: '31%',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: colors.cardAlt,
    },
    personCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '14',
    },
    checkBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.bg,
    },
    personName: { ...typography.small, color: colors.text, marginTop: spacing.xs, fontWeight: '600', textAlign: 'center' },
    personHandle: { ...typography.small, color: colors.textFaint, marginTop: 1, textAlign: 'center' },
  });

export default OnboardingFollowScreen;