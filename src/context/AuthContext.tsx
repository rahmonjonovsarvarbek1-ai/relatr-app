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
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'relatr',
  preferLocalhost: true,
});

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
      // Kick off the Supabase Google OAuth request.
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

      // Open the auth flow in an in-app browser session.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success' || !result.url) {
        return {};
      }

      // Extract the Supabase tokens from the redirect URL.
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

  // Sign in with an existing email + password account.
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, []);

  // Create a new account with email + password.
  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) return { error: error.message };

      // If "Confirm Email" is enabled in Supabase, no session is returned yet.
      if (data.user && !data.session) {
        return { error: 'A confirmation email has been sent. Please check your inbox.' };
      }
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('SignOut error:', e);
    } finally {
      // Move the UI back to the login screen immediately even if the
      // Supabase call itself failed.
      setSession(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        initializing,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const authRedirectUri = redirectTo;


