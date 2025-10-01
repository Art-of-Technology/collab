"use client";

import React from 'react';
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
  if (!isVisible || !improvedText) {
    return null;
  }

  const popover = (
    <div 
      className="fixed z-[99999] w-72 bg-[#0e0e0e] border border-[#333] rounded-md shadow-xl overflow-hidden pointer-events-auto"
      data-ai-improve-popover
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="p-3 border-b border-[#333] bg-[#1a1a1a]">
        <h4 className="text-sm font-semibold text-[#e6edf3]">AI Improved Text</h4>
        <p className="text-xs text-[#9ca3af] mt-1">Review and apply the AI improved version</p>
      </div>
        <div 
          className="max-h-48 bg-[#0e0e0e] overflow-y-auto overscroll-contain"
          style={{ scrollBehavior: 'smooth' }}
          onWheel={(e) => {
            // Ensure wheel events are properly handled
            e.stopPropagation();
          }}
        >
          <div className="p-3 text-sm">
            <RichTextRenderer 
              content={parseMarkdownToTipTap(improvedText) || improvedText}
              className="text-[#e6edf3] prose-sm [&_*]:text-[#e6edf3]"
            />
          </div>
        </div>
      <div className="border-t border-[#333] p-2 flex justify-end gap-2 bg-[#1a1a1a]">
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={onCancel}
          disabled={isImproving}
          className="text-[#9ca3af] hover:text-white"
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

  // Use createPortal to render the popover at the document body level
  // This ensures it's positioned relative to the viewport, not a parent container
  return typeof window !== 'undefined' ? createPortal(popover, document.body) : null;
}
