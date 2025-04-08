"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
}

interface LinkedTasksProps {
  postId: string;
}

// Function to fetch linked tasks
const fetchLinkedTasks = async (postId: string): Promise<Task[]> => {
  const response = await fetch(`/api/posts/${postId}/tasks`);
  if (!response.ok) {
    throw new Error("Failed to fetch linked tasks");
  }
  return response.json();
};

export default function LinkedTasks({ postId }: LinkedTasksProps) {
  // Use TanStack Query to fetch linked tasks
  const { data: tasks = [], isLoading, error } = useQuery<Task[]>({
    queryKey: ['linkedTasks', postId],
    queryFn: () => fetchLinkedTasks(postId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Linked Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Linked Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Error loading linked tasks
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Linked Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No tasks linked to this post
        </CardContent>
      </Card>
    );
  }

  // Helper to render status badge
  const renderStatusBadge = (status: string | null | undefined) => {
    if (!status) {
      return <Badge variant="outline">No Status</Badge>;
    }
    
    switch (status.toLowerCase()) {
      case "to do":
        return <Badge variant="outline">To Do</Badge>;
      case "in progress":
        return <Badge className="bg-blue-500">In Progress</Badge>;
      case "review":
        return <Badge className="bg-amber-500">Review</Badge>;
      case "done":
        return <Badge className="bg-green-500">Done</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Linked Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {tasks.map((task: Task) => (
            <Link href={`/tasks/${task.id}`} key={task.id}>
              <div className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-sm">{task.title}</h4>
                  <div>{renderStatusBadge(task.status)}</div>
                </div>
                <div className="flex gap-2 items-center mt-2">
                  <Badge variant="outline" className="text-xs">
                    {task.type}
                  </Badge>
                  <Badge variant={task.priority === "high" ? "destructive" : "outline"} className="text-xs">
                    {task.priority}
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 