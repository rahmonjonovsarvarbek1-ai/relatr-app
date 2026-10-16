import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const FALLBACK_ICON: IoniconName = 'calendar-outline';

/** Uses the icon name from the database if it exists in Ionicons, else a calendar. */
export function resolveIcon(name?: string | null): IoniconName {
  const glyphs = Ionicons.glyphMap as Record<string, number>;
  return name && name in glyphs ? (name as IoniconName) : FALLBACK_ICON;
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

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={resolveIcon(icon)} size={Math.round(size * 0.5)} color={tone} />
    </View>
  );
};

export default SpecialDayIcon;