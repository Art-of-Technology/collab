"use client";

import React from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ActionConfirmationProps {
  title: string;
  description: string;
  changes?: Array<{
    field: string;
    from?: string;
    to: string;
  }>;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ActionConfirmation({
  title,
  description,
  changes,
  onConfirm,
  onCancel,
  isLoading,
}: ActionConfirmationProps) {
  return (
    <div className="p-3 rounded-lg bg-[#1f1f1f]/60 border border-[#8b5cf6]/20">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-[#8b5cf6] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#e4e4e7]">{title}</p>
          <p className="text-xs text-[#71717a] mt-0.5">{description}</p>
        </div>
      </div>

      {/* Changes preview */}
      {changes && changes.length > 0 && (
        <div className="mb-3 space-y-1 ml-6">
          {changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-[#52525b] w-16">{change.field}</span>
              {change.from && (
                <>
                  <span className="text-red-400/70 line-through">
                    {change.from}
                  </span>
                  <span className="text-[#3f3f46]">&rarr;</span>
                </>
              )}
              <span className="text-emerald-400">{change.to}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 ml-6">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isLoading}
          className="h-7 px-3 text-xs bg-[#8b5cf6] hover:bg-[#7c3aed] text-white"
        >
          <Check className="h-3 w-3 mr-1" />
          Confirm
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="h-7 px-3 text-xs text-[#71717a] hover:text-white"
        >
          <X className="h-3 w-3 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
