import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/theme';
import { avatarPalette } from '../../theme/theme';
import AvatarPicker from '../../components/AvatarPicker';
import OnboardingLayout from './OnboardingLayout';

interface Props {
  emoji: string;
  color: string;
  onBack: () => void;
  onNext: (photoUri: string | undefined) => void;
}

const OnboardingPhotoScreen: React.FC<Props> = ({ emoji, color, onBack, onNext }) => {
  const { colors } = useTheme();
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  const pickedColor = color || avatarPalette[0];

  return (
    <OnboardingLayout
      step={2}
      totalSteps={3}
      title="Profil rasm qo'shing"
      subtitle="Do'stlaringiz sizni osongina tanishi uchun rasm qo'ying (ixtiyoriy)"
      canContinue
      onNext={() => onNext(photoUri)}
      onBack={onBack}
      onSkip={() => onNext(undefined)}
    >
      <View style={styles.center}>
        <AvatarPicker
          photoUri={photoUri}
          emoji={emoji || '🌿'}
          color={pickedColor}
          size={140}
          onChangePhoto={setPhotoUri}
        />
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
});

export default OnboardingPhotoScreen;