import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  ImageSourcePropType,
} from 'react-native';

export interface AvatarProps {
  /** Rasm URL manzili yoki local require() rasmi */
  source?: string | ImageSourcePropType | null;
  /** Rasm bo'lmaganda yoki yuklanmay qolganda ko'rinadigan emoji */
  emoji?: string;
  /** Border va fon rangining asosiy kodi (HEX) */
  color?: string;
  /** Avatar hajmi (pikselda) */
  size?: number;
  /** Qo'shimcha style berish imkoniyati */
  style?: StyleProp<ViewStyle>;
  /** Online indicator (yashil nuqta) ko'rsatish */
  isOnline?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  source,
  emoji = '👤',
  color = '#6C5CE7',
  size = 56,
  style,
  isOnline,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Rasm manbasini aniqlash (string URL yoki require() obyekti)
  const imageSource = typeof source === 'string' ? { uri: source } : source;

  // Rasm mavjudligi va xatosiz yuklanganini tekshirish
  const hasValidImage = Boolean(source) && !imageError;

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: `${color}20`, // 12% shaffoflik
            borderColor: color,
            borderWidth: Math.max(1.5, size * 0.03), // Hajmga mos dinamik border
          },
        ]}
      >
        {hasValidImage ? (
          <>
            <Image
              source={imageSource as ImageSourcePropType}
              style={{
                width: size,
                height: size,
                borderRadius: size / 2,
              }}
              resizeMode="cover"
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => {
                setImageError(true);
                setIsLoading(false);
              }}
            />
            {isLoading && (
              <View style={[StyleSheet.absoluteFill, styles.loadingContainer]}>
                <ActivityIndicator size="small" color={color} />
              </View>
            )}
          </>
        ) : (
          <Text style={{ fontSize: size * 0.45 }} adjustsFontSizeToFit numberOfLines={1}>
            {emoji}
          </Text>
        )}
      </View>

      {/* Online indicator (agar true bo'lsa) */}
      {isOnline !== undefined && (
        <View
          style={[
            styles.onlineBadge,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: (size * 0.28) / 2,
              backgroundColor: isOnline ? '#2ECC71' : '#95A5A6',
              borderWidth: Math.max(1.5, size * 0.04),
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  loadingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderColor: '#000000', // Orqa fonga mos hoshiya
  },
});

export default Avatar;
