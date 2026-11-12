import { supabase } from "@/services/supabase";

export interface AvatarUploadResult {
  path: string;
  signedUrl: string | null;
}

/**
 * Upload an avatar image file to the protected 'avatars' Supabase Storage bucket.
 * Organizes files by user ID: `avatars/${userId}/avatar.jpg`.
 */
export async function uploadAvatar(
  userId: string,
  imageUri: string,
  contentType = "image/jpeg"
): Promise<AvatarUploadResult> {
  const fileExt = contentType.split("/")[1] || "jpeg";
  const filePath = `${userId}/avatar.${fileExt}`;

  // Fetch local URI into blob for uploading
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload avatar: ${uploadError.message}`);
  }

  // Generate signed URL (valid for 1 year = 31536000 seconds for client display)
  const { data: signedData, error: signError } = await supabase.storage
    .from("avatars")
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  const signedUrl = signError ? null : signedData?.signedUrl ?? null;

  // Persist avatar_url in the user's profile
  await supabase
    .from("profiles")
    .update({ avatar_url: filePath })
    .eq("id", userId);

  return { path: filePath, signedUrl };
}

/**
 * Resolves an avatar URL. If the input is a private storage path, generates a signed URL.
 */
export async function resolveAvatarUrl(avatarPathOrUrl: string | null | undefined): Promise<string | null> {
  if (!avatarPathOrUrl) return null;
  if (avatarPathOrUrl.startsWith("http://") || avatarPathOrUrl.startsWith("https://")) {
    return avatarPathOrUrl;
  }
  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(avatarPathOrUrl, 60 * 60 * 24);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}
