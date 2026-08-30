import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  paused?: boolean;
  loop?: boolean;
  onEnd?: () => void;
};

const StoryMedia: React.FC<Props> = ({ uri, mediaType, width, height, paused, loop, onEnd }) => {
  if (mediaType === 'video') {
    return (
      <VideoMedia
        uri={uri}
        width={width}
        height={height}
        paused={paused}
        loop={loop}
        onEnd={onEnd}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.fill, { width, height }]}
      resizeMode="cover"
    />
  );
};

const VideoMedia: React.FC<Omit<Props, 'mediaType'>> = ({ uri, width, height, paused, loop, onEnd }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = !!loop;
    p.play();
  });

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!onEnd) return;
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);

  return (
    <VideoView
      style={[styles.fill, { width, height }]}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0 },
});

export default StoryMedia;