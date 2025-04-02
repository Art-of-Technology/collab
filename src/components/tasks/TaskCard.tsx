"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Paperclip } from "lucide-react";
import { useTaskModal } from "@/context/TaskModalContext";

export interface TaskCardProps {
  id: string;
  title: string;
  type: string;
  priority: string;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
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
              <Badge variant="outline" className="capitalize">
                {type}
              </Badge>
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
                <Avatar className="h-6 w-6">
                  <AvatarImage src={assignee.image || undefined} alt={assignee.name || ""} />
                  <AvatarFallback>{assignee.name?.substring(0, 2) || "U"}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-6 w-6" />
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