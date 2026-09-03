import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  paused?: boolean;
  loop?: boolean;
  onEnd?: () => void;
  /** Allow pinch-to-zoom + pan gestures on top of the media (default: true). */
  zoomEnabled?: boolean;
  /** Called whenever the natural aspect ratio (w/h) of the media is known. */
  onAspectRatioChange?: (ratio: number) => void;
};

/**
 * Reference aspect ratios we snap "fit mode" decisions against.
 * STORY_RATIO matches the canonical 9:16 vertical story canvas.
 */
const STORY_RATIO = 9 / 16; // width / height
const SQUARE_RATIO = 1; // 1:1
const RATIO_TOLERANCE = 0.08;

type FitMode = 'cover-vertical' | 'cover-square' | 'cover-wide' | 'cover-default';

/**
 * Decides how media should be laid out on the 9:16 story canvas based on
 * its natural aspect ratio:
 *  - Near 9:16 (vertical, phone-shot) -> fill the whole canvas edge-to-edge.
 *  - Near 1:1 (square) -> fit centered, letterboxed top/bottom, no crop.
 *  - Wider than tall (landscape, e.g. 16:9) -> fit centered, letterboxed,
 *    so nothing important is cropped off the sides.
 *  - Anything else -> sensible default cover.
 */
function resolveFitMode(ratio: number | null): FitMode {
  if (ratio == null) return 'cover-default';
  if (Math.abs(ratio - STORY_RATIO) <= RATIO_TOLERANCE) return 'cover-vertical';
  if (Math.abs(ratio - SQUARE_RATIO) <= RATIO_TOLERANCE) return 'cover-square';
  if (ratio > SQUARE_RATIO + RATIO_TOLERANCE) return 'cover-wide';
  return 'cover-default';
}

/**
 * Computes the on-screen box (width/height/left/top) for media of a given
 * natural aspect ratio so it fits nicely inside the canvas without
 * distortion, following resolveFitMode's rules.
 */
function computeLayoutBox(
  canvasW: number,
  canvasH: number,
  ratio: number | null
): { width: number; height: number; left: number; top: number; resizeMode: 'cover' | 'contain' } {
  const mode = resolveFitMode(ratio);

  if (mode === 'cover-vertical' || mode === 'cover-default' || ratio == null) {
    // Fill edge-to-edge — this is the native shape for the 9:16 canvas.
    return { width: canvasW, height: canvasH, left: 0, top: 0, resizeMode: 'cover' };
  }

  // Square or landscape: fit the whole frame in view, centered, with
  // letterboxing rather than cropping subjects out.
  const canvasRatio = canvasW / canvasH;
  let boxW: number;
  let boxH: number;

  if (ratio! > canvasRatio) {
    // Media is relatively wider than the canvas -> constrain by width.
    boxW = canvasW;
    boxH = canvasW / ratio!;
  } else {
    // Media is relatively taller/narrower -> constrain by height.
    boxH = canvasH;
    boxW = canvasH * ratio!;
  }

  return {
    width: boxW,
    height: boxH,
    left: (canvasW - boxW) / 2,
    top: (canvasH - boxH) / 2,
    resizeMode: 'contain',
  };
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Wraps children in a pinch-to-zoom + pan-when-zoomed gesture layer.
 * Two-finger pinch scales (1x–4x); single-finger drag pans while zoomed.
 * Double behavior is intentionally simple/robust rather than
 * physics-heavy, matching what a story viewer/composer needs.
 */
const ZoomableStage: React.FC<{
  width: number;
  height: number;
  enabled: boolean;
  children: React.ReactNode;
}> = ({ width, height, enabled, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const scaleValue = useRef(1);
  const lastScale = useRef(1);
  const lastTranslate = useRef({ x: 0, y: 0 });
  const initialPinchDistance = useRef<number | null>(null);
  const initialTouches = useRef<{ x: number; y: number }[]>([]);

  const MIN_SCALE = 1;
  const MAX_SCALE = 4;

  const getDistance = (touches: any[]) => {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => enabled,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        enabled && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          initialPinchDistance.current = getDistance(touches);
          lastScale.current = scaleValue.current;
        }
        lastTranslate.current = {
          x: (translateX as any).__getValue(),
          y: (translateY as any).__getValue(),
        };
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          if (initialPinchDistance.current == null) {
            initialPinchDistance.current = getDistance(touches);
            lastScale.current = scaleValue.current;
            return;
          }
          const currentDistance = getDistance(touches);
          const rawScale =
            lastScale.current * (currentDistance / initialPinchDistance.current);
          const next = clamp(rawScale, MIN_SCALE, MAX_SCALE);
          scaleValue.current = next;
          scale.setValue(next);
          return;
        }

        // Single-finger pan — only meaningful once zoomed in, otherwise
        // let the outer view (tap zones / swipe-to-dismiss) handle it.
        if (scaleValue.current > 1.01) {
          translateX.setValue(lastTranslate.current.x + gestureState.dx);
          translateY.setValue(lastTranslate.current.y + gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        initialPinchDistance.current = null;

        // Snap back to bounds so the media never drifts fully off-screen.
        const currentScale = scaleValue.current;
        if (currentScale <= 1.01) {
          scaleValue.current = 1;
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start();
          return;
        }

        const maxOffsetX = (width * (currentScale - 1)) / 2;
        const maxOffsetY = (height * (currentScale - 1)) / 2;
        const boundedX = clamp((translateX as any).__getValue(), -maxOffsetX, maxOffsetX);
        const boundedY = clamp((translateY as any).__getValue(), -maxOffsetY, maxOffsetY);

        Animated.parallel([
          Animated.spring(translateX, { toValue: boundedX, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: boundedY, useNativeDriver: true }),
        ]).start();
      },
      onPanResponderTerminationRequest: () => scaleValue.current <= 1.01,
    })
  ).current;

  if (!enabled) {
    return <View style={{ width, height, overflow: 'hidden' }}>{children}</View>;
  }

  return (
    <View style={{ width, height, overflow: 'hidden' }} {...panResponder.panHandlers}>
      <Animated.View
        style={{
          width,
          height,
          transform: [{ scale }, { translateX }, { translateY }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const StoryMedia: React.FC<Props> = ({
  uri,
  mediaType,
  width,
  height,
  paused,
  loop,
  onEnd,
  zoomEnabled = true,
  onAspectRatioChange,
}) => {
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);

  useEffect(() => {
    setNaturalRatio(null);
    if (mediaType !== 'image') return;
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !h) return;
        const ratio = w / h;
        setNaturalRatio(ratio);
        onAspectRatioChange?.(ratio);
      },
      () => {
        // If dimensions can't be resolved, fall back to edge-to-edge cover
        // rather than blocking rendering.
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, mediaType]);

  const layoutBox = useMemo(
    () => computeLayoutBox(width, height, naturalRatio),
    [width, height, naturalRatio]
  );

  return (
    <ZoomableStage width={width} height={height} enabled={zoomEnabled}>
      <View style={[styles.canvas, { width, height }]}>
        {mediaType === 'video' ? (
          <VideoMedia
            uri={uri}
            width={width}
            height={height}
            paused={paused}
            loop={loop}
            onEnd={onEnd}
            onAspectRatioChange={(ratio) => {
              setNaturalRatio(ratio);
              onAspectRatioChange?.(ratio);
            }}
          />
        ) : (
          <Image
            source={{ uri }}
            style={{
              position: 'absolute',
              left: layoutBox.left,
              top: layoutBox.top,
              width: layoutBox.width,
              height: layoutBox.height,
            }}
            resizeMode={layoutBox.resizeMode}
          />
        )}
      </View>
    </ZoomableStage>
  );
};

const VideoMedia: React.FC<
  Omit<Props, 'mediaType' | 'zoomEnabled'> & { onAspectRatioChange?: (ratio: number) => void }
> = ({ uri, width, height, paused, loop, onEnd, onAspectRatioChange }) => {
  const [ratio, setRatio] = useState<number | null>(null);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = !!loop;
    p.play();
  });

  useEffect(() => {
    try {
      if (paused) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      // Player may not be ready yet on the very first mount tick;
      // safe to ignore since play()/pause() will be retried on the
      // next paused-state change.
    }
  }, [paused, player]);

  useEffect(() => {
    if (!onEnd) return;
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);

  // expo-video exposes natural video dimensions once metadata loads.
  useEffect(() => {
    const sub = player.addListener('sourceLoad' as any, () => {
      const w = (player as any).videoWidth;
      const h = (player as any).videoHeight;
      if (w && h) {
        const r = w / h;
        setRatio(r);
        onAspectRatioChange?.(r);
      }
    });
    return () => sub?.remove?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const layoutBox = useMemo(() => computeLayoutBox(width, height, ratio), [width, height, ratio]);

  return (
    <VideoView
      style={{
        position: 'absolute',
        left: layoutBox.left,
        top: layoutBox.top,
        width: layoutBox.width,
        height: layoutBox.height,
      }}
      player={player}
      contentFit={layoutBox.resizeMode === 'cover' ? 'cover' : 'contain'}
      nativeControls={false}
    />
  );
};

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
});

export default StoryMedia;