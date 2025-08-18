"use client";

import React from 'react';
import { Button } from '@/components/ui/button';

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

  return (
    <div 
      className="absolute z-[9999] w-80 bg-[#0e0e0e] border border-[#333] rounded-md shadow-xl overflow-hidden"
      style={{
        top: position.top + 45,
        left: Math.max(10, position.left + 200),
      }}
    >
      <div className="p-3 border-b border-[#333] bg-[#1a1a1a]">
        <h4 className="text-sm font-semibold text-[#e6edf3]">AI Improved Text</h4>
        <p className="text-xs text-[#9ca3af] mt-1">Review and apply the AI improved version</p>
      </div>
      
      <div className="p-3 max-h-48 overflow-y-auto text-sm bg-[#0e0e0e] text-[#e6edf3]">
        <div className="whitespace-pre-wrap">
          {improvedText}
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
}
