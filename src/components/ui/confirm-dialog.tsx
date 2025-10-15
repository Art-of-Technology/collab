import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: "danger" | "warning" | "info";
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  // Optional metadata to show in a highlighted box
  metadata?: {
    title?: string;
    subtitle?: string;
  };
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "danger",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  onConfirm,
  metadata,
}: ConfirmDialogProps) {
  // Variant-based styles
  const styles = {
    danger: {
      icon: "text-red-400",
      title: "text-red-400",
      confirmButton: "bg-red-500 hover:bg-red-600 text-white",
      metadataBox: "bg-red-500/10 border-red-500/20",
      metadataTitle: "text-white",
      metadataSubtitle: "text-red-400/80",
    },
    warning: {
      icon: "text-yellow-400",
      title: "text-yellow-400",
      confirmButton: "bg-yellow-500 hover:bg-yellow-600 text-white",
      metadataBox: "bg-yellow-500/10 border-yellow-500/20",
      metadataTitle: "text-white",
      metadataSubtitle: "text-yellow-400/80",
    },
    info: {
      icon: "text-blue-400",
      title: "text-blue-400",
      confirmButton: "bg-blue-500 hover:bg-blue-600 text-white",
      metadataBox: "bg-blue-500/10 border-blue-500/20",
      metadataTitle: "text-white",
      metadataSubtitle: "text-blue-400/80",
    },
  }[variant];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${styles.title}`}>
            <AlertTriangle className={`h-5 w-5 ${styles.icon}`} />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
            {metadata && (metadata.title || metadata.subtitle) && (
              <div className={`mt-4 p-3 border rounded-md ${styles.metadataBox}`}>
                {metadata.title && (
                  <div className={`text-sm font-medium ${styles.metadataTitle}`}>
                    {metadata.title}
                  </div>
                )}
                {metadata.subtitle && (
                  <div className={`text-xs font-mono mt-1 ${styles.metadataSubtitle}`}>
                    {metadata.subtitle}
                  </div>
                )}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="border-neutral-800 text-neutral-400 hover:bg-neutral-800"
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={styles.confirmButton}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
