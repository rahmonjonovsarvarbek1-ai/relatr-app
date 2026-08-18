import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  initializing: boolean;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Deep link back into the app once the OAuth provider redirects to
// Supabase and Supabase redirects back to us, e.g. relatr://auth-callback
const redirectTo = Linking.createURL('auth-callback');

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      // Ask Supabase for the provider auth URL, pointed back at our app.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error || !data?.url) {
        return { error: error?.message ?? 'Could not start Google sign-in.' };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        // User cancelled — not an error to surface loudly.
        return {};
      }

      // Supabase appends the session tokens as a URL fragment:
      // relatr://auth-callback#access_token=...&refresh_token=...
      const parsed = Linking.parse(result.url.replace('#', '?'));
      const accessToken = parsed.queryParams?.access_token as string | undefined;
      const refreshToken = parsed.queryParams?.refresh_token as string | undefined;

      if (!accessToken || !refreshToken) {
        return { error: 'Sign-in did not return a valid session.' };
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) return { error: sessionError.message };
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, initializing, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Exposed for AuthSession-based flows / debugging.
export const authRedirectUri = redirectTo;
