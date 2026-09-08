import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, typography } from '../theme/theme';
import type { ColorScheme } from '../theme/theme';

type Mode = 'signIn' | 'signUp';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [infoMessage, setInfoMessage] = useState<string | undefined>();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passwordInputRef = useRef<TextInput>(null);
  const confirmInputRef = useRef<TextInput>(null);

  const busy = googleLoading || emailLoading;

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.timing(shakeAnim, {
      toValue: 1,
      duration: 380,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  const shakeStyle = {
    transform: [
      {
        translateX: shakeAnim.interpolate({
          inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 1],
          outputRange: [0, -8, 8, -6, 6, -3, 0],
        }),
      },
    ],
  };

  const clearErrors = () => {
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);
    setFormError(undefined);
    setInfoMessage(undefined);
  };

  const switchMode = (next: Mode) => {
    if (next === mode || busy) return;
    clearErrors();
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  };

  const validate = () => {
    let ok = true;
    clearErrors();

    if (!email.trim()) {
      setEmailError('Please enter your email address');
      ok = false;
    } else if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Please enter a valid email address');
      ok = false;
    }

    if (!password) {
      setPasswordError('Please enter your password');
      ok = false;
    } else if (mode === 'signUp' && password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      ok = false;
    }

    if (mode === 'signUp' && password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      ok = false;
    }

    if (!ok) triggerShake();
    return ok;
  };

  const handleGoogle = async () => {
    if (busy) return;
    clearErrors();
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setFormError(error);
      triggerShake();
    }
  };

  const handleEmailSubmit = async () => {
    if (busy) return;
    if (!validate()) return;

    setEmailLoading(true);
    const result =
      mode === 'signIn'
        ? await signInWithEmail(email.trim(), password)
        : await signUpWithEmail(email.trim(), password);
    setEmailLoading(false);

    if (result.error) {
      // signUpWithEmail returns a friendly "check your inbox" message inside
      // `error` when confirmation email is required — show it as info, not
      // as a red error, since it's not actually a failure.
      if (mode === 'signUp' && result.error.toLowerCase().includes('confirm')) {
        setInfoMessage(result.error);
        return;
      }
      setFormError(translateAuthError(result.error));
      triggerShake();
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="people" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>Relatr</Text>
          <Text style={styles.subtitle}>
            {mode === 'signIn'
              ? 'Remember the people who matter. Sign in to sync across every device in real time.'
              : 'Create an account and never forget the people who matter most.'}
          </Text>
        </View>

        <Animated.View style={[styles.card, shakeStyle]}>
          {/* Mode toggle */}
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'signIn' && styles.segmentBtnActive]}
              onPress={() => switchMode('signIn')}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentText, mode === 'signIn' && styles.segmentTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'signUp' && styles.segmentBtnActive]}
              onPress={() => switchMode('signUp')}
              activeOpacity={0.85}
            >
              <Text style={[styles.segmentText, mode === 'signUp' && styles.segmentTextActive]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Google button */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
            onPress={handleGoogle}
            activeOpacity={0.85}
            disabled={busy}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={19} color={colors.text} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or with email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={[styles.inputWrap, !!emailError && styles.inputWrapError]}>
              <Ionicons name="mail-outline" size={18} color={colors.textFaint} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(undefined);
                  if (formError) setFormError(undefined);
                }}
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!busy}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>
            {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
          </View>

          {/* Password field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={[styles.inputWrap, !!passwordError && styles.inputWrapError]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textFaint} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (passwordError) setPasswordError(undefined);
                  if (formError) setFormError(undefined);
                }}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                secureTextEntry={!showPassword}
                textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                returnKeyType={mode === 'signUp' ? 'next' : 'done'}
                editable={!busy}
                onSubmitEditing={() => {
                  if (mode === 'signUp') confirmInputRef.current?.focus();
                  else handleEmailSubmit();
                }}
              />
              <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textFaint}
                />
              </TouchableOpacity>
            </View>
            {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
          </View>

          {/* Confirm password — sign up only */}
          {mode === 'signUp' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <View style={[styles.inputWrap, !!confirmError && styles.inputWrapError]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textFaint} style={styles.inputIcon} />
                <TextInput
                  ref={confirmInputRef}
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (confirmError) setConfirmError(undefined);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  returnKeyType="done"
                  editable={!busy}
                  onSubmitEditing={handleEmailSubmit}
                />
              </View>
              {!!confirmError && <Text style={styles.errorText}>{confirmError}</Text>}
            </View>
          )}

          {mode === 'signIn' && (
            <TouchableOpacity style={styles.forgotBtn} disabled={busy}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {!!formError && (
            <View style={styles.formErrorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          {!!infoMessage && (
            <View style={styles.infoBox}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, busy && styles.btnDisabled]}
            onPress={handleEmailSubmit}
            activeOpacity={0.88}
            disabled={busy}
          >
            {emailLoading ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === 'signIn' ? 'Sign In' : 'Sign Up'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {mode === 'signIn' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')} disabled={busy}>
              <Text style={styles.switchLink}>
                {mode === 'signIn' ? 'Sign up' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Text style={styles.footerNote}>
          By continuing, you agree to Relatr's Terms of Service and Privacy Policy.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// Translates Supabase auth errors into friendly, user-facing messages.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password';
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'This email is already registered. Try signing in instead.';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email has not been confirmed yet. Please check your inbox.';
  }
  if (m.includes('password should be at least')) {
    return 'Password must be at least 6 characters';
  }
  if (m.includes('network')) {
    return 'No internet connection. Please try again.';
  }
  return message;
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xxl + spacing.md,
      paddingBottom: spacing.xl,
    },
    header: { alignItems: 'center', marginBottom: spacing.xl },
    logoCircle: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
    subtitle: {
      ...typography.body,
      color: colors.textFaint,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
      lineHeight: 21,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.pill,
      padding: 4,
      marginBottom: spacing.lg,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.pill,
      alignItems: 'center',
    },
    segmentBtnActive: { backgroundColor: colors.primary },
    segmentText: { ...typography.bodyBold, color: colors.textFaint },
    segmentTextActive: { color: colors.bg },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    googleBtnText: { ...typography.bodyBold, color: colors.text },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.lg,
      gap: spacing.sm,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { ...typography.small, color: colors.textFaint },
    fieldGroup: { marginBottom: spacing.md },
    fieldLabel: { ...typography.caption, color: colors.textDim, marginBottom: 6, fontWeight: '600' },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      height: 50,
      gap: spacing.sm,
    },
    inputWrapError: { borderColor: colors.danger },
    inputIcon: { marginTop: 1 },
    input: { flex: 1, ...typography.body, color: colors.text, height: '100%' },
    errorText: { ...typography.small, color: colors.danger, marginTop: 6, marginLeft: 2 },
    forgotBtn: { alignSelf: 'flex-end', marginTop: -spacing.xs, marginBottom: spacing.sm },
    forgotText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    formErrorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.danger + '1a',
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    formErrorText: { ...typography.caption, color: colors.danger, flex: 1 },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.success + '1a',
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    infoText: { ...typography.caption, color: colors.success, flex: 1 },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    btnDisabled: { opacity: 0.6 },
    submitBtnText: { ...typography.bodyBold, color: colors.bg, fontSize: 16 },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.lg,
    },
    switchText: { ...typography.caption, color: colors.textFaint },
    switchLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    footerNote: {
      ...typography.small,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: spacing.xl,
      paddingHorizontal: spacing.lg,
      lineHeight: 16,
    },
  });

export default LoginScreen;