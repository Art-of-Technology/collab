"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Plus, Sparkles, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  noteTitle: string;
  workspaceId: string;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  noteId,
  noteTitle,
  workspaceId,
}: SaveAsTemplateDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("{{title}}");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Save as template mutation
  const saveAsTemplate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notes/${noteId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          titleTemplate,
          defaultTags: tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save as template");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["note-templates", workspaceId] });
      toast.success("Template saved successfully!");
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleClose = () => {
    setName("");
    setDescription("");
    setTitleTemplate("{{title}}");
    setTags([]);
    setTagInput("");
    onOpenChange(false);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    saveAsTemplate.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-[#0d0d0e] border-[#1f1f1f]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-[#fafafa] flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#3b82f6]" />
            Save as Template
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#6e7681]">
            Create a reusable template from "{noteTitle}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Template Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[12px] text-[#8b949e]">
              Template Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Weekly Report"
              className="h-9 text-[13px] bg-[#0a0a0b] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b]"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-[12px] text-[#8b949e]">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this template is for..."
              rows={2}
              className="text-[13px] bg-[#0a0a0b] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b] resize-none"
            />
          </div>

          {/* Title Template */}
          <div className="space-y-1.5">
            <Label htmlFor="titleTemplate" className="text-[12px] text-[#8b949e]">
              Title Template
            </Label>
            <Input
              id="titleTemplate"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="{{title}}"
              className="h-9 text-[13px] font-mono bg-[#0a0a0b] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b]"
            />
            <div className="flex items-start gap-1.5 text-[10px] text-[#6e7681]">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Use placeholders like {`{{title}}`}, {`{{date}}`}, {`{{projectName}}`} for dynamic values
              </span>
            </div>
          </div>

          {/* Default Tags */}
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#8b949e]">Default Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a tag..."
                className="h-8 text-[12px] bg-[#0a0a0b] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#52525b]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                className="h-8 px-3 text-[12px] border-[#1f1f1f] bg-[#0a0a0b] hover:bg-[#1f1f1f]"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[11px] px-2 py-0.5 bg-[#1f1f1f] text-[#8b949e] hover:bg-[#2a2a2d]"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-red-400"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-[12px] h-8 text-[#6e7681] hover:text-[#e6edf3]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || saveAsTemplate.isPending}
              className="text-[12px] h-8 bg-[#3b82f6] hover:bg-[#2563eb] text-white"
            >
              {saveAsTemplate.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Template"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
