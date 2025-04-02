"use client";

import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import the task edit form
const TaskEditForm = dynamic(() => import("./TaskEditForm"), {
  loading: () => <div className="p-4 text-center">Loading form...</div>
});

export interface TaskEditButtonProps {
  taskId: string;
  onEditSuccess?: () => void;
}

export function TaskEditButton({ taskId, onEditSuccess }: TaskEditButtonProps) {
  const [open, setOpen] = useState(false);
  
  const handleClose = () => {
    setOpen(false);
    if (onEditSuccess) {
      onEditSuccess();
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit
      </Button>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update the details of this task
          </DialogDescription>
        </DialogHeader>
        {open && (
          <TaskEditForm 
            taskId={taskId} 
            isOpen={open}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
} 