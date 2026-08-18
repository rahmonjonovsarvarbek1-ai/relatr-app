import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
// react-native o'rniga react-native-safe-area-context dan import qilamiz:
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme/theme';
import { useAuth } from '../context/AuthContext';

const AuthScreen: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🌿</Text>
        <Text style={styles.title}>Relatr</Text>
        <Text style={styles.subtitle}>
          Remember the people who matter. Sign in to sync your friends across
          every device, in real time.
        </Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.bg} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.footnote}>
          Apple sign-in can be added the same way once you have an Apple
          Developer account configured.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emoji: {
    fontSize: 56,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentAlt,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    width: '100%',
  },
  googleButtonText: {
    ...typography.bodyBold,
    color: colors.bg,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  footnote: {
    ...typography.small,
    color: colors.textFaint,
    marginTop: spacing.xxl,
    textAlign: 'center',
  },
});

export default AuthScreen;
