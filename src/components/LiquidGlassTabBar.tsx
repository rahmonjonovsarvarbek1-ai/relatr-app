// components/LiquidGlassTabBar.tsx
import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/theme';

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

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const LiquidGlassTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
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

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.glassContainer}>
        {/* Asosiy blur qatlami — haqiqiy Liquid Glass materiali */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 55 : 90}
          tint={Platform.OS === 'ios' ? 'systemUltraThinMaterialDark' : 'dark'}
          style={StyleSheet.absoluteFill}
        />

        {/* Bazaviy shaffof qora qatlam — Android fallback va rang chuqurligi uchun */}
        <View style={styles.tintOverlay} pointerEvents="none" />

        {/* Suv tomchisidek yaltiroq ustki qatlam */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Pastki nozik yorug'lik chizig'i — shisha qirrasining refleksi */}
        <LinearGradient
          colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.12)']}
          start={{ x: 0, y: 0.85 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Nozik ichki chegara — shisha qirrasi hissi */}
        <View style={styles.innerBorder} pointerEvents="none" />

        {/* Harakatlanuvchi faol pill (suzuvchi shisha tomchisi) */}
        <Animated.View style={[styles.activePill, { width: PILL_SIZE, height: PILL_SIZE }, pillAnimatedStyle]}>
          <AnimatedBlurView
            intensity={Platform.OS === 'ios' ? 35 : 60}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.18)', 'rgba(255,255,255,0.05)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.pillBorder} pointerEvents="none" />
        </Animated.View>

        <View style={styles.tabsRow}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const icon = ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };

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
                <Ionicons
                  name={isFocused ? icon.active : icon.inactive}
                  size={24}
                  color={isFocused ? colors.primary : colors.textFaint}
                  style={{ zIndex: 1 }}
                />
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
    backgroundColor: 'rgba(20,20,22,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
  },
  tintOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,12,0.25)',
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

export default LiquidGlassTabBar;