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
      <div className="flex items-center px-3 py-2 bg-[#0f1011] border border-[#1f1f1f] rounded-md">
        <div className="w-5 mr-2" /> {/* Spacer for status icon alignment */}
        <div className="w-5 mr-2" /> {/* Spacer for type icon alignment */}
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
          className="flex-1 bg-transparent text-sm text-[#e6edf3] border-none outline-none placeholder-[#8b949e] font-medium"
          autoFocus
        />
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => setIsCreating(true)}
      className="w-full justify-start px-3 py-2 h-auto text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#0f1011] border border-dashed border-[#1f1f1f] hover:border-[#333] rounded-md transition-all"
    >
      <Plus className="h-4 w-4 mr-2" />
      <span className="text-sm">Add sub-issue</span>
    </Button>
  );
}

