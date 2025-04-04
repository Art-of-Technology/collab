"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Paperclip, CheckSquare, Bug, Sparkles, TrendingUp } from "lucide-react";
import { useTaskModal } from "@/context/TaskModalContext";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import React from "react";

export interface TaskCardProps {
  id: string;
  title: string;
  type: string;
  priority: string;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  } | null;
  commentCount: number;
  attachmentCount: number;
  issueKey: string | null;
}

export default function TaskCard({
  id,
  title,
  type,
  priority,
  assignee,
  commentCount,
  attachmentCount,
  issueKey,
}: TaskCardProps) {
  const { openTaskModal } = useTaskModal();

  // Helper to render priority indicator
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-amber-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-slate-400";
    }
  };

  // Get type badge with icon
  const getTypeBadge = (type: string) => {
    // Ensure consistent uppercase formatting for types
    const normalizedType = type?.toUpperCase() || "TASK";
    
    const typeIcons: Record<string, React.ReactNode> = {
      "TASK": <CheckSquare className="h-3 w-3 mr-1" />,
      "BUG": <Bug className="h-3 w-3 mr-1" />,
      "FEATURE": <Sparkles className="h-3 w-3 mr-1" />,
      "IMPROVEMENT": <TrendingUp className="h-3 w-3 mr-1" />,
    };

    const typeColors: Record<string, string> = {
      "TASK": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "BUG": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      "FEATURE": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "IMPROVEMENT": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    };
    
    return (
      <Badge className={`${typeColors[normalizedType] || "bg-gray-100 text-gray-800"} px-1.5 py-0.5 flex items-center text-xs`}>
        {typeIcons[normalizedType] || <CheckSquare className="h-3 w-3 mr-1" />}
        <span>{normalizedType}</span>
      </Badge>
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openTaskModal(id);
  };

  return (
    <div onClick={handleClick}>
      <Card className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              {getTypeBadge(type)}
              <div className={`h-2 w-2 rounded-full ${getPriorityColor(priority)}`} />
            </div>
            
            <div className="space-y-1">
              {issueKey && (
                <div className="text-xs font-medium text-muted-foreground">
                  {issueKey}
                </div>
              )}
              <h3 className="text-sm font-medium line-clamp-2">{title}</h3>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              {assignee ? (
                assignee.useCustomAvatar ? (
                  <div className="w-6 h-6 min-w-[1.5rem] min-h-[1.5rem]">
                    <CustomAvatar user={assignee} size="sm" />
                  </div>
                ) : (
                  <Avatar className="h-6 w-6 min-h-[1.5rem] min-w-[1.5rem]">
                    <AvatarImage src={assignee.image || undefined} alt={assignee.name || ""} />
                    <AvatarFallback>{assignee.name?.substring(0, 2) || "U"}</AvatarFallback>
                  </Avatar>
                )
              ) : (
                <div className="h-6 w-6 min-h-[1.5rem] min-w-[1.5rem]" />
              )}
              
              <div className="flex items-center gap-2 text-muted-foreground">
                {commentCount > 0 && (
                  <div className="flex items-center text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {commentCount}
                  </div>
                )}
                
                {attachmentCount > 0 && (
                  <div className="flex items-center text-xs">
                    <Paperclip className="h-3 w-3 mr-1" />
                    {attachmentCount}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 