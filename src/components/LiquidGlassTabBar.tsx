// components/LiquidGlassTabBar.tsx
import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TAB_BAR_HORIZONTAL_MARGIN = 16;
const TAB_BAR_WIDTH = SCREEN_WIDTH - TAB_BAR_HORIZONTAL_MARGIN * 2;
const TAB_COUNT_DEFAULT = 3;
const PILL_SIZE = 48;

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  DatesTab: { active: 'calendar', inactive: 'calendar-outline' },
  FriendsTab: { active: 'people', inactive: 'people-outline' },
  ProfileTab: { active: 'person-circle', inactive: 'person-circle-outline' },
};

// routes that render a custom SVG instead of an Ionicon glyph
const CUSTOM_ICON_ROUTES = new Set(['StoryTab']);

const StoryIcon: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = '#fff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* solid ring, most of the circle */}
    <Path
      d="M12 3 A9 9 0 1 1 4.5 17"
      stroke={color}
      strokeWidth={2.3}
      strokeLinecap="round"
      fill="none"
    />
    {/* dashes filling the empty side */}
    <Path
      d="M4.5 17 A9 9 0 0 1 12 3"
      stroke={color}
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeDasharray="1.8 3"
      fill="none"
      opacity="0.9"
    />
  </Svg>
);

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const LiquidGlassTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { colors, isDark } = useTheme();

  const tabCount = state.routes.length || TAB_COUNT_DEFAULT;
  const tabWidth = TAB_BAR_WIDTH / tabCount;

  const translateX = useSharedValue(state.index * tabWidth);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateX.value = withSpring(state.index * tabWidth, {
      damping: 16,
      stiffness: 180,
      mass: 0.9,
    });
    scale.value = withTiming(1.08, { duration: 120 }, () => {
      scale.value = withTiming(1, { duration: 180 });
    });
  }, [state.index, tabWidth]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value + (tabWidth - PILL_SIZE) / 2 },
      { scale: scale.value },
    ],
  }));

  // Glass tint, borders, and icon colors all switch with the theme so the
  // bar reads correctly in both light and dark mode instead of always
  // rendering as a dark glass pill.
  const blurTint = isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight';
  const androidBlurTint = isDark ? 'dark' : 'light';
  const barBackground = isDark ? 'rgba(20,20,22,0.35)' : 'rgba(255,255,255,0.55)';
  const barTintOverlay = isDark ? 'rgba(10,10,12,0.25)' : 'rgba(255,255,255,0.35)';
  const barInnerBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const shadowColor = isDark ? '#000' : colors.text;

  const pillBackground = isDark ? colors.primary + '33' : colors.primary + '22';
  const pillBorder = isDark ? colors.primary + '55' : colors.primary + '40';

  const activeTint = colors.primary;
  const inactiveTint = colors.textFaint;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.glassContainer, { backgroundColor: barBackground, shadowColor }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 55 : 90}
          tint={Platform.OS === 'ios' ? blurTint : androidBlurTint}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.tintOverlay, { backgroundColor: barTintOverlay }]} pointerEvents="none" />

        <View style={[styles.innerBorder, { borderColor: barInnerBorder }]} pointerEvents="none" />

        <Animated.View
          style={[
            styles.activePill,
            { width: PILL_SIZE, height: PILL_SIZE, backgroundColor: pillBackground },
            pillAnimatedStyle,
          ]}
        >
          <View style={[styles.pillBorder, { borderColor: pillBorder }]} pointerEvents="none" />
        </Animated.View>

        <View style={styles.tabsRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const icon = ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
            const tintColor = isFocused ? activeTint : inactiveTint;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onPress={onPress}
                activeOpacity={0.75}
                style={styles.tabItem}
              >
                {CUSTOM_ICON_ROUTES.has(route.name) ? (
                  <StoryIcon size={24} color={tintColor} />
                ) : (
                  <Ionicons
                    name={isFocused ? icon.active : icon.inactive}
                    size={24}
                    color={tintColor}
                    style={{ zIndex: 1 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: TAB_BAR_HORIZONTAL_MARGIN,
  },
  glassContainer: {
    width: TAB_BAR_WIDTH,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
  },
  tintOverlay: {
    ...StyleSheet.absoluteFill,
  },
  innerBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 32,
    borderWidth: 1,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  activePill: {
    position: 'absolute',
    top: 8,
    left: 0,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1,
  },
});

export default LiquidGlassTabBar;