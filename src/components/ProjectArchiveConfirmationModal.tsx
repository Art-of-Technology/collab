"use client";

import { AlertTriangle, Archive, X, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectArchiveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  project: {
    id: string;
    name: string;
    isArchived: boolean;
  } | null;
  isLoading?: boolean;
}

export function ProjectArchiveConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  project,
  isLoading = false
}: ProjectArchiveConfirmationModalProps) {
  if (!isOpen || !project) return null;

  const isArchiving = !project.isArchived;

  const handleConfirm = () => {
    onConfirm();
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
          <div className="flex items-center gap-2">
            {isArchiving ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <Folder className="h-5 w-5 text-blue-500" />
            )}
            <h2 className="text-lg font-semibold">
              {isArchiving ? "Archive Project" : "Unarchive Project"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="text-sm text-muted-foreground">
            {isArchiving ? (
              <>
                Are you sure you want to <strong>archive</strong> the project{' '}
                <strong className="text-foreground">"{project.name}"</strong>?
                <br /><br />
                <div className="bg-muted/50 p-3 rounded-md">
                  Archived projects will be:
                  <ul className="mt-2 space-y-1 text-xs">
                    <li>• Hidden from the default active view</li>
                    <li>• Still accessible through the archived filter</li>
                    <li>• Preserved with all their data intact</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                Are you sure you want to <strong>unarchive</strong> the project{' '}
                <strong className="text-foreground">"{project.name}"</strong>?
                <br /><br />
                <div className="bg-muted/50 p-3 rounded-md">
                  <div className="flex items-center gap-2 text-xs">
                    <Folder className="h-4 w-4 text-blue-500" />
                    This will make the project active again and it will appear in the active projects list.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant={isArchiving ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            {isLoading ? (
              "Processing..."
            ) : (
              <>
                <Archive className="h-4 w-4" />
                {isArchiving ? "Archive" : "Unarchive"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
