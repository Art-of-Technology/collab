"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

interface IssueTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export interface IssueTitleInputRef {
  focus: () => void;
}

export const IssueTitleInput = forwardRef<IssueTitleInputRef, IssueTitleInputProps>(
  ({ value, onChange, placeholder = "Issue title", className, onKeyDown }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
    }));

    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full text-xl font-medium text-white bg-transparent border-none outline-none placeholder-[#6e7681]",
          "focus:ring-0 focus:border-none focus:outline-none resize-none",
          "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
          className
        )}
        onKeyDown={onKeyDown}
      />
    );
  }
);

IssueTitleInput.displayName = "IssueTitleInput";
