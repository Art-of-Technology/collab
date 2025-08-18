"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar as CalendarIcon,
  Loader2,
  Trash2,
  UserPlus,
  Tags,
  Clock,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIssueDate, formatIssueDateShort } from "@/utils/issueHelpers";
import type { Issue, IssueFieldUpdate } from "@/types/issue";

// Import selector components (to be created)
import { IssueStatusSelector } from "./selectors/IssueStatusSelector";
import { IssuePrioritySelector } from "./selectors/IssuePrioritySelector";
import { IssueAssigneeSelector } from "./selectors/IssueAssigneeSelector";
import { IssueReporterSelector } from "./selectors/IssueReporterSelector";
import { IssueDateSelector } from "./selectors/IssueDateSelector";
import { IssueLabelSelector } from "./selectors/IssueLabelSelector";

interface IssueSidebarProps {
  issue: Issue;
  onUpdate: (updates: IssueFieldUpdate) => Promise<void>;
  onDelete?: () => Promise<void>;
  isUpdating?: boolean;
}

export function IssueSidebar({ 
  issue, 
  onUpdate, 
  onDelete,
  isUpdating = false 
}: IssueSidebarProps) {
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();

  const handleFieldUpdate = async (field: string, value: any) => {
    setSavingField(field);
    try {
      await onUpdate({ [field]: value });
      toast({
        title: "Updated",
        description: `Issue ${field} updated successfully`,
      });
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
      toast({
        title: "Error",
        description: `Failed to update ${field}`,
        variant: "destructive",
      });
    } finally {
      setSavingField(null);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    
    try {
      await onDelete();
      toast({
        title: "Deleted",
        description: "Issue has been deleted successfully",
      });
    } catch (error) {
      console.error("Failed to delete issue:", error);
      toast({
        title: "Error",
        description: "Failed to delete issue",
        variant: "destructive",
      });
    }
  };

  const isFieldLoading = (field: string) => savingField === field;

  return (
    <div className="space-y-6">
      {/* Details Card */}
      <Card className={cn(
        "border-border/50 shadow-sm",
        "bg-gradient-to-br from-background/80 to-muted/20",
        "backdrop-blur-sm",
        isUpdating && "opacity-60 pointer-events-none"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Status
            </label>
            <div className="relative">
              <IssueStatusSelector
                value={issue.status || "Todo"}
                onChange={(status) => handleFieldUpdate("status", status)}
                disabled={isFieldLoading("status")}
                projectId={issue.projectId}
              />
              {isFieldLoading("status") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Priority
            </label>
            <div className="relative">
              <IssuePrioritySelector
                value={issue.priority}
                onChange={(priority) => handleFieldUpdate("priority", priority)}
                disabled={isFieldLoading("priority")}
              />
              {isFieldLoading("priority") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Assignee */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" />
              Assignee
            </label>
            <div className="relative">
              <IssueAssigneeSelector
                value={issue.assignee?.id}
                onChange={(assigneeId) => handleFieldUpdate("assigneeId", assigneeId)}
                disabled={isFieldLoading("assigneeId")}
                workspaceId={issue.workspaceId}
              />
              {isFieldLoading("assigneeId") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Reporter */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Reporter
            </label>
            <div className="relative">
              <IssueReporterSelector
                value={issue.reporter?.id}
                onChange={(reporterId) => handleFieldUpdate("reporterId", reporterId)}
                disabled={isFieldLoading("reporterId")}
                workspaceId={issue.workspaceId}
              />
              {isFieldLoading("reporterId") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Due Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarIcon className="h-3.5 w-3.5" />
              Due Date
            </label>
            <div className="relative">
              <IssueDateSelector
                value={issue.dueDate}
                onChange={(dueDate) => handleFieldUpdate("dueDate", dueDate)}
                disabled={isFieldLoading("dueDate")}
                placeholder="Set due date"
              />
              {isFieldLoading("dueDate") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Start Date (for Epics and Milestones) */}
          {(issue.type === "EPIC" || issue.type === "MILESTONE") && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Start Date
              </label>
              <div className="relative">
                <IssueDateSelector
                  value={issue.startDate}
                  onChange={(startDate) => handleFieldUpdate("startDate", startDate)}
                  disabled={isFieldLoading("startDate")}
                  placeholder="Set start date"
                />
                {isFieldLoading("startDate") && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Labels */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Tags className="h-3.5 w-3.5" />
              Labels
            </label>
            <div className="relative">
              <IssueLabelSelector
                value={issue.labels?.map(label => label.id) || []}
                onChange={(labelIds) => handleFieldUpdate("labels", labelIds)}
                disabled={isFieldLoading("labels")}
                workspaceId={issue.workspaceId}
              />
              {isFieldLoading("labels") && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Card (for Epics and Milestones) */}
      {(issue.type === "EPIC" || issue.type === "MILESTONE") && (
        <Card className={cn(
          "border-border/50 shadow-sm",
          "bg-gradient-to-br from-background/80 to-muted/20",
          "backdrop-blur-sm"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {issue.startDate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Starts</span>
                  <Badge variant="outline" className="font-mono">
                    {formatIssueDateShort(issue.startDate)}
                  </Badge>
                </div>
              )}
              {issue.dueDate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Due</span>
                  <Badge variant="outline" className="font-mono">
                    {formatIssueDateShort(issue.dueDate)}
                  </Badge>
                </div>
              )}
              {!issue.startDate && !issue.dueDate && (
                <p className="text-sm text-muted-foreground">No dates set</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Info */}
      {issue.project && (
        <Card className={cn(
          "border-border/50 shadow-sm",
          "bg-gradient-to-br from-background/80 to-muted/20",
          "backdrop-blur-sm"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm px-2 py-1 bg-muted/50 rounded">
                {issue.project.issuePrefix}
              </span>
              <span className="font-medium">{issue.project.name}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {onDelete && (
        <Card className={cn(
          "border-destructive/20 shadow-sm",
          "bg-gradient-to-br from-destructive/5 to-destructive/10",
          "backdrop-blur-sm"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Permanently delete this issue. This action cannot be undone.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Issue
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    Are you sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={handleDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 