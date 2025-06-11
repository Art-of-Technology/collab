import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Generate a unique filename for user profile images
 * @param userId - The user ID
 * @param source - The source of the image (google, etc.)
 * @returns A unique filename for profile images
 */
function generateProfileImageFilename(userId: string, source: string = 'profile'): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  
  return `profile_${source}_${userId}_${timestamp}_${randomString}`;
}

/**
 * Upload a profile image from URL directly to Cloudinary (server-side)
 * @param imageUrl - The URL of the image to upload
 * @param userId - The user ID for filename generation
 * @param source - The source of the image (google, etc.)
 * @returns The Cloudinary URL of the uploaded image
 */
export async function uploadProfileImageFromUrl(imageUrl: string, userId: string, source: string = 'google'): Promise<string> {
  try {
    // Generate unique filename for profile image
    const uniqueFilename = generateProfileImageFilename(userId, source);
    
    // Check if we're in a server environment
    if (typeof window === 'undefined') {
      // Server-side: Upload directly to Cloudinary
      console.log('🔄 Server-side: Uploading profile image directly to Cloudinary');
      
      const result = await cloudinary.uploader.upload(imageUrl, {
        folder: 'devitter/profiles',
        public_id: uniqueFilename,
        resource_type: 'auto',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      });
      
      return result.secure_url;
    } else {
      // Client-side: Use API route
      console.log('🔄 Client-side: Using API route for profile image upload');
      
      const response = await fetch('/api/upload/profile-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          imageUrl,
          filename: uniqueFilename,
          userId
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload profile image');
      }
      
      const data = await response.json();
      return data.url;
    }
  } catch (error) {
    console.error('Error uploading profile image from URL:', error);
    throw error;
  }
}

/**
 * Process and upload user profile image to Cloudinary if it's from Google
 * @param imageUrl - The original image URL (from Google OAuth)
 * @param userId - The user ID
 * @returns The Cloudinary URL or the original URL if not from Google
 */
export async function processUserProfileImage(
  imageUrl: string | null, 
  userId: string
): Promise<string | null> {
  try {
    // Return null if no image
    if (!imageUrl) {
      return null;
    }
    
    // If already a Cloudinary URL, return as is
    if (imageUrl.includes('cloudinary.com')) {
      return imageUrl;
    }
    
    // If it's a Google profile image, upload to Cloudinary
    if (imageUrl.includes('googleusercontent.com')) {
      console.log('📷 Uploading Google profile image to Cloudinary for user:', userId);
      
      try {
        const cloudinaryUrl = await uploadProfileImageFromUrl(imageUrl, userId, 'google');
        console.log('✅ Successfully uploaded profile image to Cloudinary');
        return cloudinaryUrl;
      } catch (error) {
        console.error('❌ Failed to upload profile image to Cloudinary:', error);
        // Fallback to original URL if Cloudinary upload fails
        return imageUrl;
      }
    }
    
    // For other image sources, return as is for now
    return imageUrl;
    
  } catch (error) {
    console.error('Error processing user profile image:', error);
    // Fallback to original URL if processing fails
    return imageUrl;
  }
}

/**
 * Update an existing user's profile image to Cloudinary if needed
 * @param currentImageUrl - The current image URL in the database
 * @param userId - The user ID
 * @returns The updated image URL or the original if no update needed
 */
export async function updateUserProfileImageIfNeeded(
  currentImageUrl: string | null,
  userId: string
): Promise<string | null> {
  try {
    // Skip if no image or already using Cloudinary
    if (!currentImageUrl || currentImageUrl.includes('cloudinary.com')) {
      return currentImageUrl;
    }
    
    // Only process Google images for now
    if (currentImageUrl.includes('googleusercontent.com')) {
      return await processUserProfileImage(currentImageUrl, userId);
    }
    
    return currentImageUrl;
    
  } catch (error) {
    console.error('Error updating user profile image:', error);
    return currentImageUrl;
  }
} 