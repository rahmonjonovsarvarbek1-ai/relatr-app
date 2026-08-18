import * as Crypto from 'expo-crypto';

// Supabase's id columns are `uuid`, so every locally-generated id must be
// a real UUID (not the old `f_${Date.now()}` style strings) or inserts
// will be rejected by Postgres.
export function newId(): string {
  return Crypto.randomUUID();
}
