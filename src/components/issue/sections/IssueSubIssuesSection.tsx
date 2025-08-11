"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, Plus, ExternalLink, CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SubIssue {
  id: string;
  title: string;
  issueKey?: string;
  status?: string;
  priority?: string;
  type?: string;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface IssueSubIssuesSectionProps {
  issue: any;
  workspaceId: string;
  currentUserId: string;
  onRefresh?: () => void;
}

function SubIssueItem({ 
  subIssue, 
  workspaceId,
  onStatusChange
}: { 
  subIssue: SubIssue; 
  workspaceId: string;
  onStatusChange?: (issueId: string, newStatus: string) => void;
}) {
  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'low':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case 'epic':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'story':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'task':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'subtask':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'defect':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const isCompleted = subIssue.status?.toLowerCase() === 'done' || subIssue.status?.toLowerCase() === 'completed';

  const handleStatusToggle = () => {
    const newStatus = isCompleted ? 'todo' : 'done';
    onStatusChange?.(subIssue.id, newStatus);
  };

  return (
    <div className="group flex items-center gap-3 p-3 bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg hover:bg-[#111] transition-all">
      <button
        onClick={handleStatusToggle}
        className="flex-shrink-0 hover:scale-110 transition-transform"
      >
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Circle className="h-5 w-5 text-[#666] hover:text-green-500 transition-colors" />
        )}
      </button>

      <Link 
        href={`/${workspaceId}/views/${subIssue.id}`}
        className="flex-1 min-w-0 hover:text-[#e1e7ef] transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          {subIssue.issueKey && (
            <Badge className={getTypeColor(subIssue.type)} variant="outline">
              {subIssue.issueKey}
            </Badge>
          )}
          <span className={`text-sm font-medium truncate ${isCompleted ? 'line-through text-[#666]' : 'text-[#ccc]'}`}>
            {subIssue.title}
          </span>
          <ExternalLink className="h-3 w-3 text-[#666] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        
        <div className="flex items-center gap-2">
          {subIssue.priority && (
            <Badge className={getPriorityColor(subIssue.priority)} variant="outline">
              {subIssue.priority}
            </Badge>
          )}
          
          {subIssue.status && (
            <Badge 
              variant="outline" 
              className={`text-xs ${
                isCompleted 
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              }`}
            >
              {subIssue.status}
            </Badge>
          )}
          
          {subIssue.assignee && (
            <div className="flex items-center gap-1">
              <Avatar className="h-4 w-4">
                <AvatarImage src={subIssue.assignee.image || undefined} alt={subIssue.assignee.name || "User"} />
                <AvatarFallback className="bg-[#1a1a1a] text-[#ccc] text-xs">
                  {subIssue.assignee.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-[#666]">{subIssue.assignee.name}</span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

export function IssueSubIssuesSection({ 
  issue, 
  workspaceId, 
  currentUserId, 
  onRefresh 
}: IssueSubIssuesSectionProps) {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const subIssues: SubIssue[] = issue.children || [];
  const completedCount = subIssues.filter(sub => 
    sub.status?.toLowerCase() === 'done' || sub.status?.toLowerCase() === 'completed'
  ).length;

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/issues/${issueId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Sub-issue status updated to ${newStatus}`,
        });
        onRefresh?.();
      } else {
        throw new Error('Failed to update status');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update sub-issue status",
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateSubIssue = () => {
    // TODO: Implement create sub-issue modal
    toast({
      title: "Coming Soon",
      description: "Create sub-issue feature is coming soon",
    });
  };

  const progressPercentage = subIssues.length > 0 ? Math.round((completedCount / subIssues.length) * 100) : 0;

  return (
    <div>
      {/* Progress Bar */}
      {subIssues.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#888]">Progress</span>
            <span className="text-[#ccc]">
              {completedCount} of {subIssues.length} completed ({progressPercentage}%)
            </span>
          </div>
          <div className="w-full bg-[#1a1a1a] rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      <div>
        {subIssues.length === 0 ? (
          <div className="text-center py-8">
            <GitBranch className="h-12 w-12 mx-auto mb-4 text-[#333]" />
            <p className="text-[#ccc] text-sm mb-1">No sub-issues</p>
            <p className="text-[#666] text-xs mb-4">Break this issue down into smaller tasks</p>
            <Button 
              variant="outline" 
              size="sm"
              className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
              onClick={handleCreateSubIssue}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create sub-issue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {subIssues.map((subIssue) => (
              <SubIssueItem
                key={subIssue.id}
                subIssue={subIssue}
                workspaceId={workspaceId}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}

        {updating && (
          <div className="absolute inset-0 bg-[#0a0a0a]/50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Add sub-issue button */}
        <div className="flex justify-end mt-4">
          <Button 
            variant="outline" 
            size="sm"
            className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
            onClick={handleCreateSubIssue}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Sub-issue
          </Button>
        </div>
      </div>
    </div>
  );
}
