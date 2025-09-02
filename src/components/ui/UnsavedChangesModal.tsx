"use client";

import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDiscard: () => void;
  title?: string;
  description?: string;
  saveLabel?: string;
  discardLabel?: string;
}

export function UnsavedChangesModal({
  isOpen,
  onClose,
  onSave,
  onDiscard,
  title = "Unsaved description changes",
  description = "You have unsaved changes in the issue description. Would you like to save them before closing?",
  saveLabel = "Save and close",
  discardLabel = "Discard changes",
}: UnsavedChangesModalProps) {
  // Handle ESC key press when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    // Add event listener with capture to ensure it fires first
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-[#9ca3af] text-sm">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#6e7681] hover:text-white transition-colors p-1 rounded-md hover:bg-[#1a1a1a]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          <DialogDescription className="text-[#e6edf3] text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a1a1a]">
          <div></div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="text-[#6e7681] hover:text-white h-8 px-3 text-sm"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={onDiscard}
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-8 px-3 text-sm"
            >
              {discardLabel}
            </Button>
            <Button
              onClick={onSave}
              className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium"
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}