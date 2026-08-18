import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Google OAuth on native goes through expo-auth-session, which
    // hands the resulting access/refresh tokens to setSession()
    // directly, so URL-based session detection isn't needed. On web,
    // Supabase's redirect flow lands with the tokens in the URL hash,
    // so we still want it there.
    detectSessionInUrl: true,
  },
});

// Supabase's client needs a nudge to refresh the session/token when the
// app comes back to the foreground — otherwise a long-backgrounded app
// can end up with a stale session and realtime silently stops working.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});