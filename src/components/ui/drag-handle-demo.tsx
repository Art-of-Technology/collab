"use client";

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { Button } from '@/components/ui/button';

export default function DragHandleDemo() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: `
      <h1>
        This is a very unique heading.
      </h1>
      <p>
        This is a unique paragraph. It's so unique, it even has an ID attached to it.
      </p>
      <p>
        And this one, too. Try hovering over the lines to see the drag handle appear!
      </p>
      <ul>
        <li>List item 1</li>
        <li>List item 2</li>
        <li>List item 3</li>
      </ul>
      <p>
        You can drag and drop any of these blocks to reorder them.
      </p>
    `,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert focus:outline-none max-w-full min-h-[300px] p-4 rounded-md border',
      },
    },
  });

  const toggleEditable = () => {
    if (editor) {
      editor.setEditable(!editor.isEditable);
      editor.view.dispatch(editor.view.state.tr);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold">Drag Handle Demo</h2>
        <Button onClick={toggleEditable} variant="outline">
          {editor?.isEditable ? 'Disable Editing' : 'Enable Editing'}
        </Button>
      </div>
      
      <div className="border rounded-lg p-4 bg-background">
        <DragHandle editor={editor}>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            strokeWidth="1.5" 
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
          </svg>
        </DragHandle>
        <EditorContent editor={editor} className="w-full" />
      </div>
      
      <div className="text-sm text-muted-foreground">
        <p><strong>Instructions:</strong></p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Hover over any block (paragraph, heading, list) to see the drag handle appear on the left</li>
          <li>Click and drag the handle to reorder blocks</li>
          <li>Toggle editing to see how it behaves in read-only mode</li>
        </ul>
      </div>
    </div>
  );
} 