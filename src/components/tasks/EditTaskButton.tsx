"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import TaskEditForm from "@/components/tasks/TaskEditForm";

interface EditTaskButtonProps {
  taskId: string;
}

export function EditTaskButton({ taskId }: EditTaskButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  return (
    <>
      <Button 
        className="w-full" 
        size="sm" 
        onClick={() => setIsEditing(true)}
      >
        Edit Task
      </Button>
      
      {isEditing && (
        <TaskEditForm
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
          taskId={taskId}
        />
      )}
    </>
  );
} 