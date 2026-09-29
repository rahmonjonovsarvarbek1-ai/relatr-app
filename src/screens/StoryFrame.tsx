import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * StoryFrame
 * ----------
 * Story to'liq ekranni egallaydi (chetlarda bo'sh joy yo'q).
 * Notch / status bar / home indicator ostiga TUSHMASLIGI kerak bo'lgan
 * boshqaruv elementlari (progress, avatar, tugmalar) uchun `insets` qaytariladi:
 *
 *   const { frameW, frameH, insets } = useStoryFrameMetrics();
 *   <View style={{ paddingTop: insets.top + 8 }} />
 *
 * Media va stikerlar esa to'liq ekran bo'yicha joylashadi.
 */
export function useStoryFrameMetrics() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return useMemo(
    () => ({
      frameW: width,
      frameH: height,
      insets,
      screenW: width,
      screenH: height,
    }),
    [width, height, insets.top, insets.bottom, insets.left, insets.right]
  );
}

type Props = {
  width: number;
  height: number;
  children: React.ReactNode;
  backdropStyle?: any;
};

const StoryFrame: React.FC<Props> = ({ width, height, children, backdropStyle }) => {
  return (
    <View style={[styles.backdrop, backdropStyle]}>
      <View style={[styles.frame, { width, height }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  frame: { overflow: 'hidden', backgroundColor: '#000' },
});

export default StoryFrame;