"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X, Plus } from "lucide-react";
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";
import { IssueReporterSelector } from "./selectors/IssueReporterSelector";
import { IssueDateSelector } from "./selectors/IssueDateSelector";
import { IssueProjectSelector } from "./selectors/IssueProjectSelector";
import { IssueTypeSelector } from "./selectors/IssueTypeSelector";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { SubIssueManager, SubIssue } from "./SubIssueManager";
import { IssueTitleInput, type IssueTitleInputRef } from "./IssueTitleInput";
import { useCreateIssue } from "@/hooks/queries/useIssues";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type IssueType = "TASK" | "EPIC" | "STORY" | "MILESTONE" | "BUG" | "SUBTASK";

interface NewIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId?: string | null;
  defaultStatus?: string;
  currentUserId?: string;
  onCreated?: (issueId: string) => void;
}

export default function NewIssueModal({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  defaultStatus,
  currentUserId,
  onCreated,
}: NewIssueModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<string | undefined>(defaultStatus);
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  const [reporterId, setReporterId] = useState<string | undefined>(undefined);
  const [labels, setLabels] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [issueType, setIssueType] = useState<IssueType>("TASK");
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId || undefined);
  const [creating, setCreating] = useState(false);
  const [createMore, setCreateMore] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [subIssues, setSubIssues] = useState<SubIssue[]>([]);

  const titleRef = useRef<IssueTitleInputRef>(null);
  const createIssueMutation = useCreateIssue();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Auto-set reporter to current user when modal opens
  useEffect(() => {
    if (open && currentUserId && !reporterId) {
      setReporterId(currentUserId);
    }
  }, [open, currentUserId, reporterId]);

  const canCreate = title.trim().length > 0 && !!selectedProjectId;

  // AI Improve functionality
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

  // Sub-issue management
  const handleCreateSubIssue = useCallback((selectedText: string) => {
    const newSubIssue: SubIssue = {
      id: `temp-${Date.now()}`,
      title: selectedText,
      type: "SUBTASK",
      priority: "MEDIUM",
      status: status || defaultStatus,
    };
    setSubIssues(prev => [...prev, newSubIssue]);
  }, [status, defaultStatus]);

  const handleSubIssueUpdate = useCallback((id: string, updates: Partial<SubIssue>) => {
    setSubIssues(prev => prev.map(sub => sub.id === id ? { ...sub, ...updates } : sub));
  }, []);

  const handleSubIssueRemove = useCallback((id: string) => {
    setSubIssues(prev => prev.filter(sub => sub.id !== id));
  }, []);

  const handleSubIssueAdd = useCallback((title: string) => {
    const newSubIssue: SubIssue = {
      id: `temp-${Date.now()}`,
      title,
      type: "SUBTASK",
      priority: "MEDIUM",
      status: status || defaultStatus,
    };
    setSubIssues(prev => [...prev, newSubIssue]);
  }, [status, defaultStatus]);

  // Auto-focus title when modal opens
  useEffect(() => {
    if (open && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCreate = useCallback(async () => {
    if (!canCreate || !selectedProjectId) return;
    setCreating(true);
    
    try {
      // Create main issue first
      const result = await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        type: issueType,
        status: status,
        priority,
        projectId: selectedProjectId,
        workspaceId,
        assigneeId: assigneeId || undefined,
        reporterId: reporterId || currentUserId,
        labels,
        dueDate,
      });
      
      const mainIssueId = result.issue?.id || result.id;
      
      // Create sub-issues sequentially if any (to avoid race conditions with issue key generation)
      if (subIssues.length > 0) {
        for (const subIssue of subIssues) {
          const childResult = await createIssueMutation.mutateAsync({
            title: subIssue.title,
            type: subIssue.type || "SUBTASK",
            status: subIssue.status || status,
            priority: subIssue.priority || "MEDIUM",
            projectId: selectedProjectId,
            workspaceId,
            assigneeId: subIssue.assigneeId,
            reporterId: reporterId || currentUserId,
            labels: subIssue.labels || [],
            parentId: mainIssueId, // Link to parent issue
          });

          const childIssueId = childResult.issue?.id || childResult.id;

          // Create the parent-child relation record for the relations system
          try {
            await fetch(`/api/workspaces/${workspaceId}/issues/${result.issue?.issueKey || result.issueKey}/relations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                targetIssueId: childIssueId,
                relationType: 'child'
              }),
            });
          } catch (relationError) {
            console.error('Failed to create parent-child relation:', relationError);
            // Don't fail the whole operation if relation creation fails
          }
        }

        // Invalidate relations query so the new sub-issues appear in the issue detail view
        queryClient.invalidateQueries({
          queryKey: ["issue-relations", workspaceId, result.issue?.issueKey || result.issueKey],
        });
      }
      
      if (createMore) {
        // Reset form but keep modal open
        setTitle("");
        setDescription("");
        setStatus(defaultStatus);
        setPriority("MEDIUM");
        setAssigneeId(undefined);
        setReporterId(currentUserId); // Keep reporter as current user
        setLabels([]);
        setDueDate(undefined);
        setSubIssues([]); // Clear sub-issues
        // Keep project and type the same
        setTimeout(() => titleRef.current?.focus(), 100);
      } else {
        onOpenChange(false);
        // Reset form
        setTitle("");
        setDescription("");
        setStatus(defaultStatus);
        setPriority("MEDIUM");
        setAssigneeId(undefined);
        setReporterId(currentUserId);
        setLabels([]);
        setDueDate(undefined);
        setIssueType("TASK");
        setSelectedProjectId(projectId || undefined);
        setSubIssues([]);
      }
      
      toast({
        title: "Success",
        description: `Issue created${subIssues.length > 0 ? ` with ${subIssues.length} sub-issue${subIssues.length === 1 ? '' : 's'}` : ''}`,
      });
      
      onCreated?.(mainIssueId);
    } catch (error) {
      console.error("Failed to create issue:", error);
      
      // Extract error message from the response
      let errorMessage = "Failed to create issue";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  }, [canCreate, selectedProjectId, createIssueMutation, title, description, issueType, status, priority, workspaceId, assigneeId, reporterId, currentUserId, labels, dueDate, subIssues, createMore, defaultStatus, onOpenChange, onCreated, projectId, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>New issue</DialogTitle>
        </VisuallyHidden>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-purple-500 flex items-center justify-center">
              <span className="text-xs text-white font-medium">W</span>
            </div>
            <span className="text-[#9ca3af] text-sm">New issue</span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-[#6e7681] hover:text-white transition-colors p-1 rounded-md hover:bg-[#1a1a1a]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {/* Title Input - No borders on focus */}
          <IssueTitleInput
            ref={titleRef}
            value={title}
            onChange={setTitle}
            placeholder="Issue title"
            className="mb-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // Focus description editor - we'll handle this differently now
              }
            }}
          />

          {/* Description Editor with Enhanced Features */}
          <IssueRichEditor
            value={description}
            onChange={setDescription}
            placeholder="Add description..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault();
                handleCreate();
              }
            }}
            onAiImprove={handleAiImprove}
            onCreateSubIssue={handleCreateSubIssue}
            className="mb-4"
            enableSlashCommands={true}
            enableFloatingMenu={true}
            enableSubIssueCreation={true}
            minHeight="200px"
            maxHeight="400px"
          />

          {/* Properties */}
          <div className="flex flex-wrap gap-1 mt-2 mb-6">
            <IssueStatusSelector 
              value={status} 
              onChange={setStatus as any} 
              projectId={selectedProjectId} 
            />
            <IssuePrioritySelector 
              value={priority} 
              onChange={setPriority} 
            />
            <IssueAssigneeSelector 
              value={assigneeId} 
              onChange={setAssigneeId as any} 
              workspaceId={workspaceId} 
            />
            <IssueReporterSelector 
              value={reporterId} 
              onChange={setReporterId as any} 
              workspaceId={workspaceId} 
            />
            <IssueProjectSelector 
              value={selectedProjectId} 
              onChange={setSelectedProjectId} 
              workspaceId={workspaceId} 
            />
            <IssueTypeSelector 
              value={issueType} 
              onChange={setIssueType} 
            />
            <IssueLabelSelector 
              value={labels} 
              onChange={setLabels} 
              workspaceId={workspaceId} 
            />
            <IssueDateSelector 
              value={dueDate} 
              onChange={setDueDate} 
            />
          </div>

          {/* Sub-issues Section */}
          <SubIssueManager
            subIssues={subIssues}
            onSubIssueUpdate={handleSubIssueUpdate}
            onSubIssueRemove={handleSubIssueRemove}
            onSubIssueAdd={handleSubIssueAdd}
            workspaceId={workspaceId}
            projectId={selectedProjectId}
            className="mb-6"
          />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
            <button
              type="button"
              onClick={() => setCreateMore(!createMore)}
              className="flex items-center gap-2 text-[#6e7681] hover:text-white transition-colors"
            >
              <div className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                createMore 
                  ? "bg-blue-500 border-blue-500" 
                  : "border-[#333] hover:border-[#555]"
              )}>
                {createMore && <Plus className="h-2.5 w-2.5 text-white" />}
              </div>
              <span className="text-sm">Create more</span>
            </button>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6e7681]">⌘↵</span>
              <Button 
                onClick={handleCreate} 
                disabled={!canCreate || creating || createIssueMutation.isPending}
                className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium"
              >
                {creating || createIssueMutation.isPending ? "Creating..." : "Create issue"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



