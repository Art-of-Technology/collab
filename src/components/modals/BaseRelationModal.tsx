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
  isConfirmDisabled?: boolean;
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
  isLoading = false,
  isConfirmDisabled = false
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
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {children}
        </div>

        {/* Footer */}
        {(onConfirm || onCancel) && (
          <div className="flex justify-end gap-2 p-4 border-t">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            {onConfirm && (
              <Button
                onClick={onConfirm}
                disabled={isLoading || !onConfirm || isConfirmDisabled}
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