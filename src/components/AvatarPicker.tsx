import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';

/**
 * NEW component: lets the user attach a real photo to a friend,
 * falling back to the existing emoji+color avatar when no photo is set.
 * Drop this in components/AvatarPicker.tsx
 *
 * Requires: expo install expo-image-picker
 */

interface Props {
  photoUri?: string;
  emoji: string;
  color: string;
  size?: number;
  onChangePhoto: (uri: string | undefined) => void;
}

const AvatarPicker: React.FC<Props> = ({ photoUri, emoji, color, size = 84, onChangePhoto }) => {
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      onChangePhoto(result.assets[0].uri);
    }
  };

  const removePhoto = () => onChangePhoto(undefined);

  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={[styles.photo, { width: size, height: size, borderRadius: size / 2 }]} />
        ) : (
          <View style={[styles.emojiCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
            <Text style={{ fontSize: size * 0.42 }}>{emoji}</Text>
          </View>
        )}
        <View style={styles.editBadge}>
          <Ionicons name="camera" size={14} color={colors.bg} />
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
        <TouchableOpacity onPress={pickImage} style={styles.linkBtn}>
          <Text style={styles.linkText}>{photoUri ? 'Change photo' : 'Add photo'}</Text>
        </TouchableOpacity>
        {photoUri && (
          <TouchableOpacity onPress={removePhoto} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: colors.danger }]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.cardAlt },
  emojiCircle: { alignItems: 'center', justifyContent: 'center' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  linkBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
});

export default AvatarPicker;