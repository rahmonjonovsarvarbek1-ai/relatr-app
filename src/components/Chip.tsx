import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  style?: ViewStyle;
}

const Chip: React.FC<ChipProps> = ({ label, active, onPress, color, style }) => {
  const content = (
    <View
      style={[
        styles.chip,
        active && { backgroundColor: (color ?? colors.primary) + '30', borderColor: color ?? colors.primary },
        style,
      ]}
    >
      <Text style={[styles.label, active && { color: color ?? colors.primary }]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }
  return content;
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textDim,
    fontWeight: '600',
  },
});

export default Chip;
