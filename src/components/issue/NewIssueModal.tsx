"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X, Plus, Maximize2, Minimize2 } from "lucide-react";
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";
import { IssueReporterSelector } from "./selectors/IssueReporterSelector";
import { IssueDateSelector } from "./selectors/IssueDateSelector";
import { IssueProjectSelector } from "./selectors/IssueProjectSelector";
import { IssueTypeSelector } from "./selectors/IssueTypeSelector";
import { IssueRichEditor } from "@/components/RichEditor/IssueRichEditor";
import { normalizeDescriptionHTML } from "@/utils/html-normalizer";
import { IssueRelationsManager } from "./IssueRelationsManager";

export interface IssueRelation {
  id: string;
  type: 'create' | 'link';
  relationType: 'parent' | 'child' | 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'duplicated_by';
  // For creating new issues
  title?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  issueType?: "TASK" | "EPIC" | "STORY" | "MILESTONE" | "BUG" | "SUBTASK";
  assigneeId?: string;
  labels?: string[];
  // For linking existing issues
  targetIssue?: {
    id: string;
    title: string;
    issueKey: string;
    type: string;
    status?: string;
    priority?: string;
    assignee?: {
      id: string;
      name: string;
      avatarUrl?: string;
    };
    workspace?: {
      id: string;
      name: string;
      slug: string;
    };
    project?: {
      id: string;
      name: string;
      slug: string;
    };
  };
}
import { IssueTitleInput, type IssueTitleInputRef } from "./IssueTitleInput";
import { useCreateIssue } from "@/hooks/queries/useIssues";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { IssueType } from "@/constants/issue-types";

interface NewIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId?: string | null;
  defaultStatus?: string;
  currentUserId?: string;
  onCreated?: (issueId: string) => void;
  fullscreen?: boolean;
}

export default function NewIssueModal({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  defaultStatus,
  currentUserId,
  onCreated,
  fullscreen = false,
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
  const [relations, setRelations] = useState<IssueRelation[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);

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

  // Sync internal fullscreen state with prop
  useEffect(() => {
    setIsFullscreen(fullscreen);
  }, [fullscreen]);

  const canCreate = title.trim().length > 0 && !!selectedProjectId;

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

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

  // Relations management
  const handleCreateSubIssue = useCallback((selectedText: string) => {
    const newRelation: IssueRelation = {
      id: `temp-${Date.now()}`,
      type: 'create',
      relationType: 'child',
      title: selectedText,
      issueType: "SUBTASK",
      priority: "MEDIUM",
    };
    setRelations(prev => [...prev, newRelation]);
  }, []);

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
      const normalizedDescription = description.trim() ? normalizeDescriptionHTML(description.trim()) : undefined;
      const result = await createIssueMutation.mutateAsync({
        title: title.trim(),
        description: normalizedDescription,
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
      const mainIssueKey = result.issue?.issueKey || result.issueKey;
      
      // Process relations if any
      if (relations.length > 0) {
        for (const relation of relations) {
          if (relation.type === 'create') {
            // Create new issue
            const normalizedRelationDescription = relation.description ? normalizeDescriptionHTML(relation.description) : undefined;
            const childResult = await createIssueMutation.mutateAsync({
              title: relation.title!,
              description: normalizedRelationDescription,
              type: relation.issueType || "SUBTASK",
              status: status,
              priority: relation.priority || "MEDIUM",
              projectId: selectedProjectId,
              workspaceId,
              assigneeId: relation.assigneeId,
              reporterId: reporterId || currentUserId,
              labels: relation.labels || [],
              parentId: relation.relationType === 'child' ? mainIssueId : undefined,
            });

            const childIssueId = childResult.issue?.id || childResult.id;

            // Create the relation record
            try {
              await fetch(`/api/workspaces/${workspaceId}/issues/${mainIssueKey}/relations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  targetIssueId: childIssueId,
                  relationType: relation.relationType
                }),
              });
            } catch (relationError) {
              console.error('Failed to create relation:', relationError);
              // Don't fail the whole operation if relation creation fails
            }
          } else if (relation.type === 'link' && relation.targetIssue) {
            // Link existing issue
            try {
              await fetch(`/api/workspaces/${workspaceId}/issues/${mainIssueKey}/relations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  targetIssueId: relation.targetIssue.id,
                  relationType: relation.relationType
                }),
              });
            } catch (relationError) {
              console.error('Failed to create relation:', relationError);
              // Don't fail the whole operation if relation creation fails
            }
          }
        }

        // Invalidate relations query so the new relations appear in the issue detail view
        queryClient.invalidateQueries({
          queryKey: ["issue-relations", workspaceId, mainIssueKey],
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
        setRelations([]); // Clear relations
        // Keep project and type the same
        setTimeout(() => titleRef.current?.focus(), 100);
        toast({
          title: "Success",
          description: `Issue created${relations.length > 0 ? ` with ${relations.length} relation${relations.length === 1 ? '' : 's'}` : ''}`,
        });
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
        setRelations([]);
        
        toast({
          title: "Success",
          description: `Issue created${relations.length > 0 ? ` with ${relations.length} relation${relations.length === 1 ? '' : 's'}` : ''}`,
        });
        
        onCreated?.(mainIssueId);
      }
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
  }, [canCreate, selectedProjectId, createIssueMutation, title, description, issueType, status, priority, workspaceId, assigneeId, reporterId, currentUserId, labels, dueDate, relations, createMore, defaultStatus, onOpenChange, onCreated, projectId, toast, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden flex flex-col",
        isFullscreen 
          ? "w-full h-[95vh] max-w-7xl mx-auto my-4 rounded-lg" 
          : "max-w-2xl max-h-[90vh]"
      )}>
        <VisuallyHidden>
          <DialogTitle>New issue</DialogTitle>
        </VisuallyHidden>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-purple-500 flex items-center justify-center">
              <span className="text-xs text-white font-medium">W</span>
            </div>
            <span className="text-[#9ca3af] text-sm">New issue</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              onClick={toggleFullscreen}
              variant="ghost"
              size="sm"
              className="text-[#6e7681] hover:text-white p-1"
              title={isFullscreen ? "Minimize" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="ghost"
              size="sm"
              className="text-[#6e7681] hover:text-white p-1"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4 flex-1 min-h-0 overflow-y-auto">
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
            minHeight={isFullscreen ? "400px" : "200px"}
            maxHeight={isFullscreen ? "600px" : "300px"}
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

          {/* Relations Section */}
          <IssueRelationsManager
            relations={relations}
            onRelationsChange={setRelations}
            workspaceId={workspaceId}
            projectId={selectedProjectId}
            currentUserId={currentUserId}
          />

        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1a1a1a] flex-shrink-0 bg-[#0e0e0e]">
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
            <Button 
              onClick={handleCreate} 
              disabled={!canCreate || creating || createIssueMutation.isPending}
              className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium"
            >
              {creating || createIssueMutation.isPending ? "Creating..." : "Create issue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



