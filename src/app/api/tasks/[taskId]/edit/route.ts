import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { updateTask } from "@/actions/task";

// PATCH /api/tasks/[taskId]/edit - Edit task details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const _params = await params;
    const taskId = _params.taskId;
    const { 
      title, 
      description, 
      priority, 
      status, 
      dueDate, 
      assigneeId,
      type,
      labels
    } = await request.json();

    // Use the server action which includes all notification logic
    const updatedTask = await updateTask(taskId, {
      title,
      description,
      priority,
      status,
      type,
      dueDate,
      assigneeId,
      labels
    });

    return NextResponse.json(updatedTask);
  } catch (error: any) {
    console.error("Error updating task:", error);
    
    // Check if it's a known error from the server action
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === 'Task not found') {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (error.message === 'You do not have access to modify this task') {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to update task" },
      { status: 500 }
    );
  }
} 