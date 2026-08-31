import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { radius, spacing, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';
import { useTheme } from '../context/ThemeContext';

export const Card: React.FC<{ children: React.ReactNode; style?: ViewStyle }> = ({
  children,
  style,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={[styles.card, style]}>{children}</View>;
};

export const SectionHeader: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({
  title,
  subtitle,
  right,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeaderRow}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sectionTitle: {
      ...typography.h3,
      color: colors.text,
    },
    sectionSubtitle: {
      ...typography.caption,
      color: colors.textFaint,
      marginTop: 2,
    },
  });

export default Card;