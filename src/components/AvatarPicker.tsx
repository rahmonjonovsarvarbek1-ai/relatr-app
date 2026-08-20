import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/theme';
// The upload helper may not have a TypeScript declaration in older project setups.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- keep this component compatible with the existing JavaScript helper.
import { uploadFriendPhoto } from '../utils/uploadImage';
import { useAuth } from '../context/AuthContext';

interface Props {
  photoUri?: string;
  emoji: string;
  color: string;
  size?: number;
  onChangePhoto: (uri: string | undefined) => void;
}

const AvatarPicker: React.FC<Props> = ({ photoUri, emoji, color, size = 84, onChangePhoto }) => {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    if (uploading) return;

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

    if (result.canceled || !result.assets?.[0]?.uri) return;

    const localUri = result.assets[0].uri;
    const ownerId = session?.user?.id;
    if (!ownerId) {
      Alert.alert('Not signed in', 'Please sign in again before adding a photo.');
      return;
    }

    setUploading(true);
    const publicUrl = await uploadFriendPhoto(localUri, ownerId);
    setUploading(false);

    if (!publicUrl) {
      Alert.alert('Upload failed', 'Could not upload the photo. Please try again.');
      return;
    }
    onChangePhoto(publicUrl);
  };

  const removePhoto = () => onChangePhoto(undefined);

  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity onPress={pickImage} activeOpacity={0.8} disabled={uploading}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={[styles.photo, { width: size, height: size, borderRadius: size / 2 }]} />
        ) : (
          <View style={[styles.emojiCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
            <Text style={{ fontSize: size * 0.42 }}>{emoji}</Text>
          </View>
        )}

        {uploading ? (
          <View style={[styles.uploadingOverlay, { width: size, height: size, borderRadius: size / 2 }]}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={14} color={colors.bg} />
          </View>
        )}
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
        <TouchableOpacity onPress={pickImage} style={styles.linkBtn} disabled={uploading}>
          <Text style={styles.linkText}>
            {uploading ? 'Uploading...' : photoUri ? 'Change photo' : 'Add photo'}
          </Text>
        </TouchableOpacity>
        {photoUri && !uploading && (
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
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000099',
  },
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