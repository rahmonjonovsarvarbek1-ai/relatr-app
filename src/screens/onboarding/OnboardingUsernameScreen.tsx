import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../utils/supabase';
import { spacing, radius, typography } from '../../theme/theme';
import type { ColorScheme } from '../../theme/theme';
import OnboardingLayout from './OnboardingLayout';

interface Props {
  initialValue: string;
  onNext: (username: string) => void;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

const OnboardingUsernameScreen: React.FC<Props> = ({ initialValue, onNext }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [value, setValue] = useState(initialValue);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const clean = value.trim().toLowerCase();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!clean) {
      setCheckState('idle');
      return;
    }

    if (!USERNAME_RE.test(clean)) {
      setCheckState('invalid');
      return;
    }

    setCheckState('checking');
    const myRequestId = ++requestId.current;

    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', clean)
        .maybeSingle();

      if (myRequestId !== requestId.current) return; // stale response, ignore

      if (error) {
        setCheckState('idle');
        return;
      }
      setCheckState(data ? 'taken' : 'available');
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const helperText = () => {
    switch (checkState) {
      case 'checking':
        return "Tekshirilmoqda...";
      case 'available':
        return "Bu username mavjud ✓";
      case 'taken':
        return 'Bu username band, boshqasini sinab ko\'ring';
      case 'invalid':
        return "3-20 belgi, faqat kichik harflar, raqamlar va pastki chiziq (_)";
      default:
        return "Do'stlaringiz sizni shu nom bilan topishadi";
    }
  };

  const helperColor = () => {
    if (checkState === 'available') return colors.success;
    if (checkState === 'taken' || checkState === 'invalid') return colors.danger;
    return colors.textFaint;
  };

  const canContinue = checkState === 'available';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingLayout
        step={1}
        totalSteps={3}
        title="Username tanlang"
        subtitle="Bu sizning noyob profil manzilingiz bo'ladi"
        canContinue={canContinue}
        onNext={() => onNext(value.trim().toLowerCase())}
      >
        <View style={[styles.inputWrap, checkState === 'taken' || checkState === 'invalid' ? styles.inputWrapError : null, checkState === 'available' ? styles.inputWrapSuccess : null]}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            value={value}
            onChangeText={(t) => setValue(t.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="username"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            autoFocus
          />
          {checkState === 'checking' && <ActivityIndicator size="small" color={colors.textFaint} />}
          {checkState === 'available' && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
          {(checkState === 'taken' || checkState === 'invalid') && (
            <Ionicons name="close-circle" size={20} color={colors.danger} />
          )}
        </View>
        <Text style={[styles.helper, { color: helperColor() }]}>{helperText()}</Text>
      </OnboardingLayout>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      height: 54,
      gap: 6,
    },
    inputWrapError: { borderColor: colors.danger },
    inputWrapSuccess: { borderColor: colors.success },
    atSign: { ...typography.h3, color: colors.textFaint },
    input: { flex: 1, ...typography.h3, color: colors.text, height: '100%' },
    helper: { ...typography.caption, marginTop: spacing.sm, marginLeft: 2 },
  });

export default OnboardingUsernameScreen;