import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const FALLBACK_ICON: IoniconName = 'calendar-outline';
const GLYPHS = Ionicons.glyphMap as Record<string, number>;

/** Uses the icon name from the database if it exists in Ionicons, else a calendar. */
export function resolveIcon(name?: string | null): IoniconName {
  return name && name in GLYPHS ? (name as IoniconName) : FALLBACK_ICON;
}

interface Props {
  icon?: string | null;
  category?: string | null;
  /** Diameter of the circle. */
  size?: number;
}

/** Round, tinted icon badge that replaces the old emoji "stickers". */
const SpecialDayIcon: React.FC<Props> = ({ icon, category, size = 44 }) => {
  const { colors } = useTheme();

  const tone =
    category === 'religious'
      ? colors.gold
      : category === 'international' || category === 'observance'
        ? colors.textDim
        : colors.primary;

  const containerStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: tone + '22', // tone must be a #RRGGBB colour
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }),
    [size, tone],
  );

  return (
    <View
      style={containerStyle}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={resolveIcon(icon)} size={Math.round(size * 0.5)} color={tone} />
    </View>
  );
};

export default memo(SpecialDayIcon);