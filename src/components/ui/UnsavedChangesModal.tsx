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
      <DialogContent className="max-w-md p-0 bg-collab-900 border-collab-700 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-collab-700">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-amber-500 flex items-center justify-center">
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-gray-400 text-sm">{title}</span>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-auto w-auto p-1 text-collab-500 hover:text-white hover:bg-collab-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          <DialogDescription className="text-collab-50 text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-collab-700">
          <div></div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="text-collab-500 hover:text-white h-8 px-3 text-sm"
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
              className="bg-green-700 hover:bg-green-600 text-white border-0 h-8 px-3 text-sm font-medium"
            >
              {saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}