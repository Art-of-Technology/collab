import { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { handleImageUpload, handleVideoUpload } from '../utils/upload-utils';

export function useMediaUpload(editor: Editor | null) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadAndInsertImage = useCallback(async (file: File) => {
    if (!editor) return;

    setIsUploading(true);
    try {
      const imageUrl = await handleImageUpload(file);
      
      // Insert image at current cursor position
      editor.chain().focus().setImage({ src: imageUrl }).run();
    } catch (error) {
      console.error('Failed to upload image:', error);
      // Could add toast notification here
    } finally {
      setIsUploading(false);
    }
  }, [editor]);

  const uploadAndInsertVideo = useCallback(async (file: File) => {
    if (!editor) return;

    setIsUploading(true);
    try {
      const videoUrl = await handleVideoUpload(file);
      
      // Insert video at current cursor position
      // @ts-ignore - Custom command from ResizableVideoExtension
      editor.chain().focus().setVideo({ src: videoUrl }).run();
    } catch (error) {
      console.error('Failed to upload video:', error);
      // Could add toast notification here
    } finally {
      setIsUploading(false);
    }
  }, [editor]);

  const insertImageFromUrl = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const insertVideoFromUrl = useCallback((url: string) => {
    if (!editor) return;
    // @ts-ignore - Custom command from ResizableVideoExtension
    editor.chain().focus().setVideo({ src: url }).run();
  }, [editor]);

  return {
    isUploading,
    uploadAndInsertImage,
    uploadAndInsertVideo,
    insertImageFromUrl,
    insertVideoFromUrl
  };
}

