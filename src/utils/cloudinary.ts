import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Generate a unique filename to prevent overwrites and caching issues
 * @param originalFilename - The original file name
 * @returns A unique filename with timestamp and random string
 */
function generateUniqueFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const fileExtension = originalFilename.split('.').pop() || 'png';
  
  return `image_${timestamp}_${randomString}.${fileExtension}`;
}

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
 * Upload an image to Cloudinary
 * @param file - The file to upload
 * @returns The URL of the uploaded image
 */
export async function uploadImage(file: File): Promise<string> {
  try {
    // Convert file to base64 for uploading
    const base64Data = await fileToBase64(file);
    
    // Generate unique filename to prevent overwrites
    const uniqueFilename = generateUniqueFilename(file.name);
    
    // Upload to Cloudinary via API route to protect API key and secret
    const response = await fetch('/api/upload/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        image: base64Data,
        filename: uniqueFilename
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to upload image');
    }
    
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/**
 * Upload a profile image from URL to Cloudinary
 * @param imageUrl - The URL of the image to upload
 * @param userId - The user ID for filename generation
 * @param source - The source of the image (google, etc.)
 * @returns The Cloudinary URL of the uploaded image
 */
export async function uploadProfileImageFromUrl(imageUrl: string, userId: string, source: string = 'google'): Promise<string> {
  try {
    // Generate unique filename for profile image
    const uniqueFilename = generateProfileImageFilename(userId, source);
    
    // Upload to Cloudinary via API route
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
  } catch (error) {
    console.error('Error uploading profile image from URL:', error);
    throw error;
  }
}

/**
 * Convert a file to base64
 * @param file - The file to convert
 * @returns The base64 representation of the file
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove data:image/jpeg;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    
    reader.onerror = () => {
      reject(reader.error);
    };
    
    reader.readAsDataURL(file);
  });
} 