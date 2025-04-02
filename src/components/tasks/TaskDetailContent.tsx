"use client";

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { TaskEditButton } from "@/components/tasks/TaskEditButton";
import { TaskCommentForm } from "@/components/tasks/TaskCommentForm";
import { ShareButton } from "@/components/tasks/ShareButton";

// Format date helper
const formatDate = (date: Date | string) => {
  return format(new Date(date), 'MMM d, yyyy');
};

// Task interfaces
export interface TaskComment {
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface TaskAttachment {
  id: string;
  name?: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  createdAt: Date;
  comments: TaskComment[];
  labels: TaskLabel[];
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  reporter?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  column?: {
    id: string;
    name: string;
  };
  taskBoard?: {
    id: string;
    name: string;
  };
  attachments: TaskAttachment[];
  dueDate?: Date;
  storyPoints?: number;
  issueKey?: string | null;
  workspaceId: string;
}

interface TaskDetailContentProps {
  task: Task | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  showHeader?: boolean;
  onClose?: () => void;
}

// Client-side implementation of status badge
const getStatusBadge = (status: string) => {
  const statusColors: Record<string, string> = {
    "TO DO": "bg-slate-500",
    "IN PROGRESS": "bg-blue-500",
    "DONE": "bg-green-500",
    "CANCELLED": "bg-red-500",
    "BLOCKED": "bg-yellow-500"
  };
  
  return (
    <Badge className={`${statusColors[status] || "bg-slate-500"} text-white`}>
      {status}
    </Badge>
  );
};

// Client-side implementation of priority badge
const getPriorityBadge = (priority: string) => {
  const priorityColors: Record<string, string> = {
    "LOW": "bg-blue-100 text-blue-800",
    "MEDIUM": "bg-yellow-100 text-yellow-800",
    "HIGH": "bg-orange-100 text-orange-800",
    "CRITICAL": "bg-red-100 text-red-800"
  };
  
  const priorityIcons: Record<string, string> = {
    "LOW": "↓",
    "MEDIUM": "→",
    "HIGH": "↑",
    "CRITICAL": "‼️"
  };
  
  return (
    <Badge className={priorityColors[priority] || "bg-slate-100 text-slate-800"}>
      {priorityIcons[priority]} {priority}
    </Badge>
  );
};

export function TaskDetailContent({ 
  task, 
  isLoading, 
  error, 
  onRefresh, 
  showHeader = true,
  onClose
}: TaskDetailContentProps) {
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{error}</p>
        {onClose && (
          <Button variant="link" onClick={onClose}>Close</Button>
        )}
      </div>
    );
  }
  
  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Task not found.</p>
        {onClose && (
          <Button variant="link" onClick={onClose}>Close</Button>
        )}
      </div>
    );
  }

  return (
    <div className="pt-6 space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <Badge variant="outline" className="text-sm">
                {task.issueKey}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Created on {formatDate(task.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton taskId={task.id} issueKey={task.issueKey || ""} />
            <TaskEditButton 
              taskId={task.id}
              onEditSuccess={onRefresh}
            />
          </div>
        </div>
      )}
      
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <MarkdownContent content={task.description} />
                </div>
              ) : (
                <p className="text-muted-foreground italic">No description provided</p>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.comments.length > 0 ? (
                task.comments.map((comment: TaskComment) => (
                  <div key={comment.id} className="flex gap-4 pb-4 border-b">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={comment.author?.image || ""} alt={comment.author?.name || ""} />
                      <AvatarFallback>
                        {comment.author?.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1 flex-1">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-medium">{comment.author?.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <MarkdownContent content={comment.content} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground italic">No comments yet</p>
              )}
            </CardContent>
            <CardFooter>
              <TaskCommentForm 
                taskId={task.id} 
                onCommentAdded={onRefresh}
              />
            </CardFooter>
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Status</p>
                {getStatusBadge(task.column?.name || "TO DO")}
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Priority</p>
                {getPriorityBadge(task.priority || "MEDIUM")}
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Assignee</p>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage 
                        src={task.assignee.image || ""} 
                        alt={task.assignee.name || ""} 
                      />
                      <AvatarFallback>
                        {task.assignee.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{task.assignee.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Unassigned</span>
                )}
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Reporter</p>
                {task.reporter ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage 
                        src={task.reporter.image || ""} 
                        alt={task.reporter.name || ""} 
                      />
                      <AvatarFallback>
                        {task.reporter.name?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{task.reporter.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Unknown</span>
                )}
              </div>
              
              {task.dueDate && (
                <div>
                  <p className="text-sm font-medium mb-1">Due Date</p>
                  <span className="text-sm">{formatDate(task.dueDate)}</span>
                </div>
              )}
              
              {task.labels && task.labels.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Labels</p>
                  <div className="flex flex-wrap gap-1">
                    {task.labels.map((label: TaskLabel) => (
                      <Badge key={label.id} variant="outline">
                        {label.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {task.attachments && task.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {task.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <Link 
                        href={attachment.url} 
                        target="_blank" 
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {attachment.name || "File"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 