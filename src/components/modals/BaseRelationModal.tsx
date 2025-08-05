"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BaseRelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function BaseRelationModal({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  onCancel,
  confirmText = "Add",
  cancelText = "Cancel",
  isLoading = false
}: BaseRelationModalProps) {
  if (!isOpen) return null;

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-3xl mx-2 sm:mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b">
          <h2 className="text-base sm:text-lg font-semibold truncate pr-2 min-w-0 max-w-[200px] sm:max-w-[300px] md:max-w-[400px] lg:max-w-none">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          {children}
        </div>

        {/* Footer */}
        {(onConfirm || onCancel) && (
          <div className="flex justify-end gap-2 p-3 sm:p-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
              size="sm"
              className="text-sm"
            >
              {cancelText}
            </Button>
            {onConfirm && (
              <Button
                onClick={onConfirm}
                disabled={isLoading || !onConfirm}
                size="sm"
                className="text-sm"
              >
                {isLoading ? "Loading..." : confirmText}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}