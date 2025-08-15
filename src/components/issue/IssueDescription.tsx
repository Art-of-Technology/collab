"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  PenLine, 
  Check, 
  X, 
  Loader2,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichEditor } from "@/components/RichEditor";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type { Issue } from "@/types/issue";

interface IssueDescriptionProps {
  issue: Issue;
  onUpdateDescription: (description: string) => Promise<void>;
  isUpdating?: boolean;
}

export function IssueDescription({ 
  issue, 
  onUpdateDescription,
  isUpdating = false 
}: IssueDescriptionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(issue.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();

  const handleEditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onUpdateDescription(description);
      setIsEditing(false);
      toast({
        title: "Updated",
        description: "Issue description updated successfully",
      });
    } catch (error) {
      console.error("Failed to update description:", error);
      toast({
        title: "Error",
        description: "Failed to update description",
        variant: "destructive",
      });
      setDescription(issue.description || ""); // Reset to original
    } finally {
      setIsSaving(false);
    }
  }, [description, onUpdateDescription, toast, issue.description]);

  const handleCancel = useCallback(() => {
    setDescription(issue.description || "");
    setIsEditing(false);
  }, [issue.description]);

  const handleAiImprove = useCallback(async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;

    setIsImproving(true);
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error("Failed to improve text");
      }

      const data = await response.json();
      const improvedText = data.message || data.improvedText || text;
      
      toast({
        title: "AI Enhancement",
        description: "Description has been improved with AI",
      });

      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text with AI",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  }, [isImproving, toast]);

  if (isEditing) {
    return (
      <div className={cn(
        "space-y-4 p-6 rounded-xl border border-border/50",
        "bg-gradient-to-br from-background/80 to-muted/20",
        "backdrop-blur-sm shadow-sm"
      )}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Description</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className={isSaving ? "opacity-50 pointer-events-none" : ""}>
            <RichEditor
              value={description}
              onChange={(html, text) => handleDescriptionChange(html)}
              onAiImprove={handleAiImprove}
              placeholder="Add a description..."
              minHeight="200px"
              maxHeight="500px"
            />
          </div>
          {isSaving && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative rounded-xl border border-border/50",
      "bg-gradient-to-br from-background/80 to-muted/20",
      "backdrop-blur-sm shadow-sm hover:shadow-md",
      "transition-all duration-200",
      isUpdating && "opacity-60 pointer-events-none"
    )}>
      <div className="flex items-center justify-between p-6 pb-3">
        <h3 className="font-semibold text-lg">Description</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEditClick}
          className={cn(
            "h-8 w-8 p-0 rounded-full",
            "opacity-0 group-hover:opacity-100",
            "transition-opacity duration-200"
          )}
        >
          <PenLine className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div 
        className={cn(
          "px-6 pb-6 cursor-pointer min-h-[120px]",
          "hover:bg-muted/10 transition-colors duration-200"
        )}
        onClick={handleEditClick}
      >
        {issue.description ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownContent 
              content={issue.description} 
              htmlContent={issue.description}
            />
          </div>
        ) : (
          <div className={cn(
            "flex items-center justify-center h-32",
            "border-2 border-dashed border-border/50 rounded-lg",
            "text-muted-foreground hover:text-foreground",
            "hover:border-border/80 transition-colors duration-200"
          )}>
            <div className="text-center space-y-2">
              <PenLine className="h-5 w-5 mx-auto opacity-60" />
              <p className="text-sm">Click to add a description</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 