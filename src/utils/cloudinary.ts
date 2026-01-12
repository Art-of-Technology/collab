// Note: The cloudinary SDK is only used in API routes (server-side)
// This file contains client-side utilities that use API routes for uploads
// Do NOT import 'cloudinary' here as it uses Node.js 'fs' module

/**
 * Allowed file extensions for different media types
 */
const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

/**
 * Extract and validate file extension from filename
 * @param filename - The original filename
 * @param allowedExtensions - Array of allowed extensions
 * @param defaultExtension - Default extension if none found or invalid
 * @returns The validated file extension
 */
function extractFileExtension(
  filename: string, 
  allowedExtensions: string[], 
  defaultExtension: string
): string {
  // Match the last extension in the filename (e.g., 'file.tar.gz' -> 'gz')
  const match = filename.match(/\.([^.]+)$/);
  
  if (match) {
    const ext = match[1].toLowerCase();
    // Return the extension if it's in the allowed list
    if (allowedExtensions.includes(ext)) {
      return ext;
    }
  }
  
  // Return default if no valid extension found
  return defaultExtension;
}

/**
 * Generate a unique filename to prevent overwrites and caching issues
 * @param originalFilename - The original file name
 * @param prefix - The prefix for the filename (image, video, etc.)
 * @returns A unique filename with timestamp and random string
 */
function generateUniqueFilename(originalFilename: string, prefix: string = 'image'): string {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  
  // Determine allowed extensions and default based on prefix
  const isVideo = prefix === 'video';
  const allowedExtensions = isVideo ? ALLOWED_VIDEO_EXTENSIONS : ALLOWED_IMAGE_EXTENSIONS;
  const defaultExtension = isVideo ? 'mp4' : 'png';
  
  const fileExtension = extractFileExtension(originalFilename, allowedExtensions, defaultExtension);
  
  return `${prefix}_${timestamp}_${randomString}.${fileExtension}`;
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
    const uniqueFilename = generateUniqueFilename(file.name, 'image');
    
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
 * Upload a video to Cloudinary
 * @param file - The file to upload
 * @returns The URL of the uploaded video
 */
export async function uploadVideo(file: File): Promise<string> {
  try {
    // Create FormData and append the video file
    const formData = new FormData();
    formData.append('video', file);
    
    // Upload to Cloudinary via API route to protect API key and secret
    const response = await fetch('/api/upload/video', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to upload video');
    }
    
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error uploading video:', error);
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
        // Remove data:image/jpeg;base64, or data:video/mp4;base64, prefix
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

/**
 * Check if a file is a video
 * @param file - The file to check
 * @returns True if the file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Check if a file is an image
 * @param file - The file to check
 * @returns True if the file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
} 