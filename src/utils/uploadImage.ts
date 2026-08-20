import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';

/**
 * Uploads a local image URI (from ImagePicker) to the "friend-photos"
 * Supabase Storage bucket and returns the public URL.
 *
 * Requires: expo install expo-file-system base64-arraybuffer
 * Requires a public Storage bucket named "friend-photos" to exist in Supabase.
 */
export async function uploadFriendPhoto(localUri: string, ownerId: string): Promise<string | null> {
  try {
    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error(`Unable to read image: ${response.status}`);
    }
    const imageData = await response.arrayBuffer();

    const ext = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${ownerId}/${Date.now()}.${ext}`;
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const { error: uploadError } = await supabase.storage
      .from('friend-photos')
      .upload(path, imageData, { contentType, upsert: true });

    if (uploadError) {
      console.error('uploadFriendPhoto error:', uploadError.message);
      return null;
    }

    const { data } = supabase.storage.from('friend-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error('uploadFriendPhoto exception:', e);
    return null;
  }
}