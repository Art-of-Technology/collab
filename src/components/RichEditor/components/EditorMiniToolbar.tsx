"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Undo,
  Redo,
  History as HistoryIcon,
} from 'lucide-react';
import type { RichEditorRef } from '../types';

interface EditorMiniToolbarProps {
  editorRef: React.RefObject<RichEditorRef | null>;
  onHistoryClick?: () => void;
  className?: string;
}

export function EditorMiniToolbar({ 
  editorRef, 
  onHistoryClick, 
  className = "" 
}: EditorMiniToolbarProps) {
  const handleUndo = () => {
    editorRef.current?.getEditor()?.chain().focus().undo().run();
  };

  const handleRedo = () => {
    editorRef.current?.getEditor()?.chain().focus().redo().run();
  };

  const canUndo = editorRef.current?.getEditor()?.can().undo();
  const canRedo = editorRef.current?.getEditor()?.can().redo();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-white/10 text-[#8b949e] hover:text-white"
              onClick={handleUndo}
              disabled={!canUndo}
            >
              <Undo className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-white/5 py-1 px-2 text-xs">
            Undo
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-white/10 text-[#8b949e] hover:text-white"
              onClick={handleRedo}
              disabled={!canRedo}
            >
              <Redo className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-white/5 py-1 px-2 text-xs">
            Redo
          </TooltipContent>
        </Tooltip>

        {onHistoryClick && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-white/10 text-[#8b949e] hover:text-white"
                onClick={onHistoryClick}
              >
                <HistoryIcon className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-white/5 py-1 px-2 text-xs">
              History
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );
}
