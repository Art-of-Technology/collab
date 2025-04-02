"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";

interface CreateTaskButtonProps {
  postId: string;
  postTitle: string;
  postContent: string;
}

export default function CreateTaskButton({
  postId,
  postTitle,
  postContent,
}: CreateTaskButtonProps) {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => setIsCreateTaskOpen(true)}
      >
        <ClipboardList className="h-4 w-4" />
        <span className="hidden md:inline">Create Task</span>
      </Button>

      <CreateTaskForm
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        initialData={{
          title: `Task for: ${postTitle}`,
          description: `Created from post: ${postContent.substring(0, 100)}...`,
          postId: postId,
        }}
      />
    </>
  );
} 