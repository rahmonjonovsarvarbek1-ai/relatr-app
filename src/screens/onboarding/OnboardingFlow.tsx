import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { avatarPalette } from '../../theme/theme';
import OnboardingUsernameScreen from './OnboardingUsernameScreen';
import OnboardingPhotoScreen from './OnboardingPhotoScreen';
import OnboardingFollowScreen from './OnboardingFollowScreen';

type Step = 'username' | 'photo' | 'follow';

// Yangi (yoki onboarding'ni tugatmagan) foydalanuvchini uchta bosqich bo'ylab
// olib o'tadi: username -> profil rasmi -> follow tavsiyalari.
// RootNavigator shu komponentni faqat `profile.onboardingCompleted === false`
// bo'lganda ko'rsatadi (App.tsx / RootNavigator.tsx'dagi shart orqali).
const OnboardingFlow: React.FC = () => {
  const { profile, updateProfile } = useApp();
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState(profile.username || '');
  const [randomColor] = useState(
    () => avatarPalette[Math.floor(Math.random() * avatarPalette.length)]
  );

  const handleUsernameNext = (value: string) => {
    setUsername(value);
    setStep('photo');
  };

  const handlePhotoNext = (photoUri: string | undefined) => {
    // Username va rasmni birga saqlaymiz — foydalanuvchi keyingi bosqichda
    // ilovadan chiqib ketsa ham progress yo'qolmaydi.
    updateProfile({
      username,
      avatarColor: profile.avatarColor || randomColor,
      ...(photoUri ? ({ photoUri } as any) : {}),
    });
    setStep('follow');
  };

  const handleFinish = () => {
    // Follow so'rovlari OnboardingFollowScreen ichida to'g'ridan-to'g'ri
    // yuborilgan. Bu yerda faqat onboarding flag'ini yopamiz.
    updateProfile({ onboardingCompleted: true } as any);
  };

  if (step === 'username') {
    return <OnboardingUsernameScreen initialValue={username} onNext={handleUsernameNext} />;
  }

  if (step === 'photo') {
    return (
      <OnboardingPhotoScreen
        emoji={profile.emoji || '🌿'}
        color={profile.avatarColor || randomColor}
        onBack={() => setStep('username')}
        onNext={handlePhotoNext}
      />
    );
  }

  return (
    <OnboardingFollowScreen
      onBack={() => setStep('photo')}
      onFinish={handleFinish}
    />
  );
};

export default OnboardingFlow;