import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius, typography } from '../../theme/theme';
import type { ColorScheme } from '../../theme/theme';

interface Props {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  canContinue: boolean;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  loading?: boolean;
}

const OnboardingLayout: React.FC<Props> = ({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  canContinue,
  onNext,
  onBack,
  onSkip,
  nextLabel = 'Davom etish',
  loading = false,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}

        <View style={styles.progressTrack}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                i < step ? styles.progressSegmentActive : null,
                i === totalSteps - 1 ? { marginRight: 0 } : null,
              ]}
            />
          ))}
        </View>

        {onSkip ? (
          <TouchableOpacity onPress={onSkip} hitSlop={10}>
            <Text style={styles.skipText}>O'tkazib yuborish</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.body}>{children}</View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, (!canContinue || loading) && styles.nextBtnDisabled]}
          onPress={onNext}
          disabled={!canContinue || loading}
          activeOpacity={0.88}
        >
          <Text style={styles.nextBtnText}>{loading ? 'Saqlanmoqda...' : nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.md,
      gap: spacing.md,
    },
    backBtn: { width: 28, height: 28, alignItems: 'flex-start', justifyContent: 'center' },
    progressTrack: { flex: 1, flexDirection: 'row', gap: 6 },
    progressSegment: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.cardAlt,
      marginRight: 0,
    },
    progressSegmentActive: { backgroundColor: colors.primary },
    skipText: { ...typography.caption, color: colors.textFaint, fontWeight: '600' },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
    title: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
    subtitle: { ...typography.body, color: colors.textFaint, marginBottom: spacing.xl, lineHeight: 21 },
    body: { flex: 1 },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
    },
    nextBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 16,
      alignItems: 'center',
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { ...typography.bodyBold, color: colors.bg, fontSize: 16 },
  });

export default OnboardingLayout;