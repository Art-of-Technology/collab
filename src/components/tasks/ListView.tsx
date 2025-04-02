"use client";

import { useState, useEffect } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTasks } from "@/context/TasksContext";
import Link from "next/link";

export default function ListView() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedBoard, selectedBoardId } = useTasks();

  useEffect(() => {
    const fetchTasks = async () => {
      if (!selectedBoardId) return;
      
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks?boardId=${selectedBoardId}`);
        
        if (!response.ok) {
          throw new Error("Failed to fetch tasks");
        }
        
        const data = await response.json();
        setTasks(data);
      } catch (error) {
        console.error("Error fetching tasks:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [selectedBoardId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-medium">No tasks found</h3>
        <p className="text-muted-foreground">Create your first task to get started</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead className="w-[300px]">Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Assignee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="text-xs font-medium text-muted-foreground">
                {task.issueKey || task.id.substring(0, 8)}
              </TableCell>
              <TableCell>
                <Link href={`/tasks/${task.id}`} className="hover:underline font-medium">
                  {task.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{task.status || task.column?.name || "New"}</Badge>
              </TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={
                    task.priority === "high" 
                      ? "border-red-500 text-red-500" 
                      : task.priority === "medium"
                      ? "border-amber-500 text-amber-500"
                      : "border-blue-500 text-blue-500"
                  }
                >
                  {task.priority}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{task.type}</Badge>
              </TableCell>
              <TableCell>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={task.assignee.image || undefined} alt={task.assignee.name || ""} />
                      <AvatarFallback>{task.assignee.name?.substring(0, 2) || "U"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{task.assignee.name}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Unassigned</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
} 