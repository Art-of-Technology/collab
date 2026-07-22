"use client";

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { RichTextRenderer } from '../RichTextRenderer';
import { parseMarkdownToTipTap } from '../utils/ai-improve';

interface AIImprovePopoverProps {
  isVisible: boolean;
  improvedText: string;
  position: { top: number; left: number };
  onApply: () => void;
  onCancel: () => void;
  isImproving?: boolean;
}

export function AIImprovePopover({
  isVisible,
  improvedText,
  position,
  onApply,
  onCancel,
  isImproving = false
}: AIImprovePopoverProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isVisible || !improvedText || !mounted) {
    return null;
  }

  const popover = (
    <div
      className="fixed z-[99999] w-72 bg-collab-900 border border-collab-600 rounded-md shadow-xl overflow-hidden pointer-events-auto"
      data-ai-improve-popover
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="p-3 border-b border-collab-600 bg-collab-800">
        <h4 className="text-sm font-semibold text-collab-50">AI Improved Text</h4>
        <p className="text-xs text-gray-400 mt-1">Review and apply the AI improved version</p>
      </div>
      <div
        className="max-h-48 bg-collab-900 overflow-y-auto overscroll-contain"
        style={{ scrollBehavior: 'smooth' }}
        onWheel={(e) => {
          // Ensure wheel events are properly handled
          e.stopPropagation();
        }}
      >
        <div className="p-3 text-sm">
          <RichTextRenderer
            content={parseMarkdownToTipTap(improvedText) || improvedText}
            className="text-collab-50 prose-sm [&_*]:text-collab-50"
          />
        </div>
      </div>
      <div className="border-t border-collab-600 p-2 flex justify-end gap-2 bg-collab-800">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={isImproving}
          className="text-gray-400 hover:text-white"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onApply}
          disabled={isImproving}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Apply
        </Button>
      </div>
    </div>
  );

  if (typeof window === 'undefined' || !document?.body) return null;
  return createPortal(popover, document.body);
}
