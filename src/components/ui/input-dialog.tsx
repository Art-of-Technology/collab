import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  onConfirm: (value: string) => void;
  type?: "text" | "url" | "email";
  defaultValue?: string;
  // Optional validation function
  validate?: (value: string) => string | undefined;
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  onConfirm,
  type = "text",
  defaultValue = "",
  validate,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string>();

  const handleConfirm = () => {
    // Reset error
    setError(undefined);

    // Validate if validation function is provided
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(value);
  };

  // Reset value and error when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setValue(defaultValue);
      setError(undefined);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Input
              type={type}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={error ? "border-red-500 focus:border-red-500 focus-visible:ring-red-500 focus-visible:ring-1 focus:ring-offset-0 focus-visible:ring-offset-0" : ""}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              // Auto focus input when dialog opens
              autoFocus
            />
            {error && (
              <span className="text-sm text-red-500">{error}</span>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
            className="border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f]"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !value.trim()}
            className="bg-[#238636] hover:bg-[#2ea043] text-white"
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