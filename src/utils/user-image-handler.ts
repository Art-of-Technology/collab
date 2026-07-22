// This file re-exports server-side cloudinary functions
// For client-side usage, use the API routes instead

// Re-export server functions for use in server components and API routes
export {
  uploadProfileImageFromUrlServer as uploadProfileImageFromUrl,
  processUserProfileImageServer as processUserProfileImage,
  updateUserProfileImageIfNeededServer as updateUserProfileImageIfNeeded,
} from "./cloudinary-server";
