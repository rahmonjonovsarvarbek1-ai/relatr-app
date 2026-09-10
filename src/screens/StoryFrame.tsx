import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * StoryFrame
 * ----------
 * Relatr does not open stories as a naive edge-to-edge full screen like
 * Instagram/Facebook. Instead it renders the story inside its own
 * self-contained 9:16 "card", respecting the device safe area (notch,
 * status bar, home indicator) on all sides, with soft rounded corners
 * and a subtle ambient glow behind it. This is Relatr's signature
 * "framed" look — the canvas never touches the physical screen edges.
 *
 * Usage:
 *   const { frameW, frameH, insets } = useStoryFrameMetrics();
 *   <StoryFrame>{...media, stickers, chrome...}</StoryFrame>
 */

const HORIZONTAL_MARGIN = 10;
const TOP_MARGIN_EXTRA = 8;
const BOTTOM_MARGIN_EXTRA = 8;
const FRAME_RATIO = 9 / 16; // width / height, canonical story shape

export function useStoryFrameMetrics() {
  const insets = useSafeAreaInsets();
  const win = Dimensions.get('window');

  return useMemo(() => {
    const availableW = win.width - HORIZONTAL_MARGIN * 2;
    const availableH =
      win.height - insets.top - insets.bottom - TOP_MARGIN_EXTRA - BOTTOM_MARGIN_EXTRA;

    // Fit the 9:16 rectangle inside the available safe-area box without
    // ever exceeding it in either dimension.
    let frameW = availableW;
    let frameH = frameW / FRAME_RATIO;

    if (frameH > availableH) {
      frameH = availableH;
      frameW = frameH * FRAME_RATIO;
    }

    return {
      frameW,
      frameH,
      insets,
      screenW: win.width,
      screenH: win.height,
    };
  }, [win.width, win.height, insets.top, insets.bottom]);
}

type Props = {
  width: number;
  height: number;
  children: React.ReactNode;
  /** Background behind the framed card — Relatr uses a dim ambient wash, not pure black. */
  backdropStyle?: any;
};

const StoryFrame: React.FC<Props> = ({ width, height, children, backdropStyle }) => {
  return (
    <View style={[styles.backdrop, backdropStyle]}>
      <View style={[styles.frameShadowWrap, { width, height }]}>
        <View style={[styles.frame, { width, height }]}>{children}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
  },
  frameShadowWrap: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  frame: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
});

export default StoryFrame;