import { uploadImage, uploadVideo, isImageFile, isVideoFile } from '@/utils/cloudinary';

export async function handleImageUpload(file: File): Promise<string> {
  try {
    const imageUrl = await uploadImage(file);
    return imageUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Failed to upload image');
  }
}

export async function handleVideoUpload(file: File): Promise<string> {
  try {
    const videoUrl = await uploadVideo(file);
    return videoUrl;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw new Error('Failed to upload video');
  }
}

export function handlePaste(
  event: ClipboardEvent, 
  onImageUpload: (file: File) => Promise<void>,
  onVideoUpload?: (file: File) => Promise<void>
) {
  const items = event.clipboardData?.items;
  if (!items) return false;

  for (const item of Array.from(items)) {
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        onImageUpload(file);
        return true;
      }
    } else if (onVideoUpload && item.type.indexOf('video') !== -1) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        onVideoUpload(file);
        return true;
      }
    }
  }
  return false;
}

export function handleDrop(
  event: DragEvent, 
  onImageUpload: (file: File) => Promise<void>,
  onVideoUpload?: (file: File) => Promise<void>
) {
  const files = event.dataTransfer?.files;
  if (!files) return false;

  for (const file of Array.from(files)) {
    if (isImageFile(file)) {
      event.preventDefault();
      onImageUpload(file);
      return true;
    } else if (onVideoUpload && isVideoFile(file)) {
      event.preventDefault();
      onVideoUpload(file);
      return true;
    }
  }
  return false;
}

// Re-export from cloudinary utils for consistency
export { isImageFile, isVideoFile };
