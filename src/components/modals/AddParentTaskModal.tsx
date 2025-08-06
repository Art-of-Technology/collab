import { useState, useEffect } from "react";
import { BaseRelationModal } from "./BaseRelationModal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRelationsApi } from "@/hooks/useRelationsApi";

interface Task {
  id: string;
  title: string;
  status?: string;
  issueKey?: string;
}

interface AddParentTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddParentTask: (taskId: string) => Promise<void>;
  onAddMultipleParentTasks?: (taskIds: string[]) => Promise<void>; // New prop for multiple parent tasks
  currentTaskId: string; // Current task ID to prevent circular dependency
  currentParentTaskIds?: string[]; // Array of currently linked parent task IDs to exclude from list
}

export function AddParentTaskModal({
  isOpen,
  onClose,
  onAddParentTask,
  onAddMultipleParentTasks,
  currentTaskId,
  currentParentTaskIds = []
}: AddParentTaskModalProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Fetch tasks when modal opens
  useEffect(() => {
    if (isOpen && currentWorkspace) {
      fetchTasks();
    }
  }, [isOpen, currentWorkspace]);

  // Filter tasks based on search term and prevent circular dependencies
  useEffect(() => {
    const filtered = tasks.filter(task =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      task.id !== currentTaskId && // Can't be parent of itself
      !currentParentTaskIds.includes(task.id) // Exclude currently linked parents
      // TODO: Add more sophisticated circular dependency check
      // (e.g., check if currentTask is already parent/ancestor of this task)
    );
    setFilteredTasks(filtered);
  }, [tasks, searchTerm, currentTaskId, currentParentTaskIds]);

  const fetchTasks = async () => {
    if (!currentWorkspace?.id) return;

    setIsLoadingTasks(true);
    try {
      const fetchedTasks = await relationsApi.fetchTasks();
      setTasks(fetchedTasks);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedTaskIds.length === 0) return;

    setIsLoading(true);
    try {
      if (selectedTaskIds.length === 1) {
        // Single parent task
        await onAddParentTask(selectedTaskIds[0]);
      } else if (onAddMultipleParentTasks) {
        // Multiple parent tasks - use batch function if available
        await onAddMultipleParentTasks(selectedTaskIds);
      } else {
        // Fallback: add one by one
        for (const taskId of selectedTaskIds) {
          await onAddParentTask(taskId);
        }
      }
      handleClose();
    } catch (error) {
      console.error("Failed to add parent tasks:", error);

    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTaskIds([]);
    setSearchTerm("");
    onClose();
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;

    const statusColors = {
      'DONE': 'bg-green-500',
      'IN_PROGRESS': 'bg-blue-500',
      'TODO': 'bg-gray-500',
      'BACKLOG': 'bg-gray-500',
    };

    const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-500';

    return (
      <Badge className={`${color} text-white text-xs`}>
        {status}
      </Badge>
    );
  };

  return (
    <BaseRelationModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Parent Task"
      onConfirm={handleConfirm}
      onCancel={handleClose}
      confirmText="Add Parent"
      isLoading={isLoading}
    >
      <div className="space-y-4">
        {/* Warning Message */}
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            ⚠️ This task will become a subtask of the selected parent task.
          </p>
        </div>

        {/* Search Input */}
        <div>
          <Input
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Task List */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Select a task to be the parent:
          </p>

          {isLoadingTasks ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Loading tasks...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "No tasks found matching your search." : "No available tasks."}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2 space-y-2">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${selectedTaskIds.includes(task.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                      }`}
                    onClick={() => toggleTaskSelection(task.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                          {task.issueKey || "Task"}
                        </Badge>
                        <span className="text-sm truncate">{task.title}</span>
                      </div>
                      {getStatusBadge(task.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {selectedTaskIds.length > 0 && (
          <div className="p-3 bg-muted/20 rounded-md">
            <p className="text-sm text-muted-foreground">
              {selectedTaskIds.length} parent task{selectedTaskIds.length > 1 ? 's' : ''} selected
            </p>
          </div>
        )}
      </div>
    </BaseRelationModal>
  );
}