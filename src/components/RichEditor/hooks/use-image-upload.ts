import { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { handleImageUpload } from '../utils/upload-utils';

export function useImageUpload(editor: Editor | null) {
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

  const insertImageFromUrl = useCallback((url: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return {
    isUploading,
    uploadAndInsertImage,
    insertImageFromUrl
  };
}
