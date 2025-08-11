"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SubIssueCreateProps {
  onAdd: (title: string) => void;
}

export function SubIssueCreate({ onAdd }: SubIssueCreateProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");

  const handleSubmit = () => {
    if (title.trim()) {
      onAdd(title.trim());
      setTitle("");
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      setTitle("");
      setIsCreating(false);
    }
  };

  if (isCreating) {
    return (
      <div className="flex items-center gap-2 p-2 bg-[#161b22] border border-[#30363d] rounded-md">
        <div className="h-4 w-4" /> {/* Spacer for icon alignment */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (!title.trim()) {
              setIsCreating(false);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Sub-issue title"
          className="flex-1 bg-transparent text-sm text-[#e1e7ef] border-none outline-none placeholder-[#768390]"
          autoFocus
        />
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => setIsCreating(true)}
      className="w-full justify-start p-2 h-auto text-[#768390] hover:text-[#e1e7ef] hover:bg-[#161b22] border border-dashed border-[#30363d] hover:border-[#444c56]"
    >
      <Plus className="h-4 w-4 mr-2" />
      <span className="text-sm">Add sub-issue</span>
    </Button>
  );
}

