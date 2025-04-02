"use client";

import { useState } from "react";
import { Kanban, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskBoardSelector from "@/components/tasks/TaskBoardSelector";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";
import { useTasks } from "@/context/TasksContext";

export default function TasksHeader() {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const { selectedBoardId, view, setView, refreshBoards } = useTasks();

  const handleCreate = () => {
    setIsCreateTaskOpen(true);
  };

  const handleCreateTaskClose = () => {
    setIsCreateTaskOpen(false);
    refreshBoards(); // Refresh boards instead of the whole page
  };

  const handleViewChange = (newView: 'kanban' | 'list') => {
    setView(newView);
  };

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">
            Manage and track your team's tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="default" 
            className="gap-1"
            onClick={handleCreate}
          >
            <Plus size={16} />
            Create Task
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <TaskBoardSelector />
          <div className="hidden md:flex">
            <Button
              variant="ghost"
              className={`px-3 py-1.5 rounded-l-md border border-r-0 ${
                view === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => handleViewChange('kanban')}
            >
              <Kanban size={16} />
            </Button>
            <Button
              variant="ghost"
              className={`px-3 py-1.5 rounded-r-md border ${
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              onClick={() => handleViewChange('list')}
            >
              <List size={16} />
            </Button>
          </div>
        </div>
      </div>

      <CreateTaskForm
        key={`task-form-${selectedBoardId}`}
        isOpen={isCreateTaskOpen}
        onClose={handleCreateTaskClose}
        initialData={{ taskBoardId: selectedBoardId }}
      />
    </>
  );
} 