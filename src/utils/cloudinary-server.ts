import "server-only";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary - Server-side only
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

/**
 * Generate a unique filename for user profile images
 * @param userId - The user ID
 * @param source - The source of the image (google, etc.)
 * @returns A unique filename for profile images
 */
function generateProfileImageFilename(
  userId: string,
  source: string = "profile"
): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);

  return `profile_${source}_${userId}_${timestamp}_${randomString}`;
}

/**
 * Upload a profile image from URL directly to Cloudinary (server-side only)
 * @param imageUrl - The URL of the image to upload
 * @param userId - The user ID for filename generation
 * @param source - The source of the image (google, etc.)
 * @returns The Cloudinary URL of the uploaded image
 */
export async function uploadProfileImageFromUrlServer(
  imageUrl: string,
  userId: string,
  source: string = "google"
): Promise<string> {
  // Generate unique filename for profile image
  const uniqueFilename = generateProfileImageFilename(userId, source);

  console.log("🔄 Server-side: Uploading profile image directly to Cloudinary");

  const result = await cloudinary.uploader.upload(imageUrl, {
    folder: "devitter/profiles",
    public_id: uniqueFilename,
    resource_type: "auto",
    transformation: [
      { width: 400, height: 400, crop: "fill", gravity: "face" },
      { quality: "auto", fetch_format: "auto" },
    ],
  });

  return result.secure_url;
}

/**
 * Process and upload user profile image to Cloudinary if it's from Google (server-side)
 * @param imageUrl - The original image URL (from Google OAuth)
 * @param userId - The user ID
 * @returns The Cloudinary URL or the original URL if not from Google
 */
export async function processUserProfileImageServer(
  imageUrl: string | null,
  userId: string
): Promise<string | null> {
  try {
    // Return null if no image
    if (!imageUrl) {
      return null;
    }

    // If it's a Google profile image, upload to Cloudinary
    const url = new URL(imageUrl);
    if (url.protocol === "https:" &&
        (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))) {
      console.log(
        "📷 Uploading Google profile image to Cloudinary for user:",
        userId
      );

      try {
        const cloudinaryUrl = await uploadProfileImageFromUrlServer(
          imageUrl,
          userId,
          "google"
        );
        console.log("✅ Successfully uploaded profile image to Cloudinary");
        return cloudinaryUrl;
      } catch (error) {
        console.error(
          "❌ Failed to upload profile image to Cloudinary:",
          error
        );
        // Fallback to original URL if Cloudinary upload fails
        return imageUrl;
      }
    }

    // For other image sources, return as is for now
    return imageUrl;
  } catch (error) {
    console.error("Error processing user profile image:", error);
    // Fallback to original URL if processing fails
    return imageUrl;
  }
}

/**
 * Update an existing user's profile image to Cloudinary if needed (server-side)
 * @param currentImageUrl - The current image URL in the database
 * @param userId - The user ID
 * @returns The updated image URL or the original if no update needed
 */
export async function updateUserProfileImageIfNeededServer(
  currentImageUrl: string | null,
  userId: string
): Promise<string | null> {
  return processUserProfileImageServer(currentImageUrl, userId);
}
