"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { MessageSquare, Paperclip } from "lucide-react";
import { useTaskModal } from "@/context/TaskModalContext";

export interface TaskRowProps {
  id: string;
  title: string;
  type: string;
  status: string;
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

export default function TaskRow({
  id,
  title,
  type,
  status,
  priority,
  assignee,
  commentCount,
  attachmentCount,
  issueKey,
}: TaskRowProps) {
  const { openTaskModal } = useTaskModal();

  // Helper to get status color
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "in progress":
        return "bg-amber-500 hover:bg-amber-600";
      case "done":
        return "bg-green-500 hover:bg-green-600";
      case "backlog":
        return "bg-slate-500 hover:bg-slate-600";
      case "todo":
        return "bg-blue-500 hover:bg-blue-600";
      default:
        return "bg-slate-500 hover:bg-slate-600";
    }
  };

  // Helper to get priority color
  const getPriorityVariant = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const handleClick = () => {
    openTaskModal(id);
  };

  return (
    <TableRow 
      className="cursor-pointer hover:bg-muted/50"
      onClick={handleClick}
    >
      <TableCell>
        {issueKey ? (
          <div className="text-xs font-medium text-muted-foreground">
            {issueKey}
          </div>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="font-medium">{title}</TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {type}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={getPriorityVariant(priority)} className="capitalize">
          {priority}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge className={`${getStatusColor(status)} capitalize text-white`}>
          {status}
        </Badge>
      </TableCell>
      <TableCell>
        {assignee ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={assignee.image || undefined} alt={assignee.name || ""} />
              <AvatarFallback>{assignee.name?.substring(0, 2) || "U"}</AvatarFallback>
            </Avatar>
            <span className="text-sm truncate max-w-[100px]">{assignee.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  );
} 