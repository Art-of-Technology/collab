"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, Copy, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface SecretVariableData {
  key: string;
  value: string;
  masked: boolean;
  description?: string;
}

interface SecretVariableRowProps {
  variable: SecretVariableData;
  index: number;
  onUpdate: (index: number, updates: Partial<SecretVariableData>) => void;
  onDelete: (index: number) => void;
  onCopy?: (key: string) => void;
  disabled?: boolean;
  autoHideDelay?: number; // Delay in ms before auto-hiding revealed value
}

export function SecretVariableRow({
  variable,
  index,
  onUpdate,
  onDelete,
  onCopy,
  disabled = false,
  autoHideDelay = 30000 // 30 seconds default
}: SecretVariableRowProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const { toast } = useToast();

  // Auto-hide revealed value after delay
  useEffect(() => {
    if (isRevealed && autoHideDelay > 0) {
      const timer = setTimeout(() => {
        setIsRevealed(false);
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [isRevealed, autoHideDelay]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(variable.value);
      toast({
        title: "Copied",
        description: `${variable.key} copied to clipboard`,
      });

      // Log the copy action
      if (onCopy) {
        onCopy(variable.key);
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  }, [variable.key, variable.value, toast, onCopy]);

  const handleKeyChange = (newKey: string) => {
    onUpdate(index, { key: newKey });
  };

  const handleValueChange = (newValue: string) => {
    onUpdate(index, { value: newValue });
  };

  const handleMaskedChange = (masked: boolean) => {
    onUpdate(index, { masked });
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-[#0d0d0e] border border-[#1f1f1f]",
        "hover:border-[#27272a] transition-colors",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      {/* Drag handle */}
      <div className="cursor-grab text-[#3f3f46] hover:text-[#52525b]">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Key input */}
      <Input
        value={variable.key}
        onChange={(e) => handleKeyChange(e.target.value)}
        placeholder="KEY"
        className={cn(
          "flex-shrink-0 w-[180px] h-8 px-2",
          "bg-[#18181b] border-[#27272a] text-[#e6edf3]",
          "font-mono text-sm placeholder:text-[#52525b]",
          "focus:border-[#3b82f6] focus:ring-0"
        )}
        disabled={disabled}
      />

      <span className="text-[#52525b] text-lg">=</span>

      {/* Value input */}
      <Input
        type={isRevealed ? "text" : "password"}
        value={variable.value}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="value"
        className={cn(
          "flex-1 h-8 px-2",
          "bg-[#18181b] border-[#27272a] text-[#e6edf3]",
          "font-mono text-sm placeholder:text-[#52525b]",
          "focus:border-[#3b82f6] focus:ring-0"
        )}
        disabled={disabled}
      />

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Reveal toggle */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsRevealed(!isRevealed)}
          className={cn(
            "h-7 w-7",
            isRevealed ? "text-amber-400" : "text-[#52525b] hover:text-[#a1a1aa]"
          )}
          title={isRevealed ? "Hide value" : "Reveal value"}
        >
          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>

        {/* Copy button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-7 w-7 text-[#52525b] hover:text-[#a1a1aa]"
          title="Copy value"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>

        {/* Masked checkbox */}
        <div className="flex items-center gap-1.5 px-1" title="Mask by default">
          <Checkbox
            checked={variable.masked}
            onCheckedChange={(checked) => handleMaskedChange(checked === true)}
            className="h-3.5 w-3.5 border-[#3f3f46] data-[state=checked]:bg-[#3b82f6]"
          />
          <span className="text-[10px] text-[#52525b]">Mask</span>
        </div>

        {/* Delete button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className="h-7 w-7 text-[#52525b] hover:text-red-400"
          title="Delete variable"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default SecretVariableRow;
