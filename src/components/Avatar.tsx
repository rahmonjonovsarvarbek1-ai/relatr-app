import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AvatarProps {
  emoji: string;
  color: string;
  size?: number;
}

const Avatar: React.FC<AvatarProps> = ({ emoji, color, size = 52 }) => {
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + '33',
          borderColor: color,
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.46 }}>{emoji}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});

export default Avatar;
