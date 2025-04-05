"use client";

import { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaskCard from "@/components/tasks/TaskCard";
import { Loader2, Plus, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/context/TasksContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { 
  useCreateColumn, 
  useUpdateColumn, 
  useDeleteColumn, 
  useReorderColumns, 
  useMoveTask,
  useCreateTask 
} from "@/hooks/queries/useTask";

export default function KanbanView() {
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const { toast } = useToast();
  const { selectedBoard, selectedBoardId, refreshBoards } = useTasks();
  const { currentWorkspace } = useWorkspace();
  const [localBoardState, setLocalBoardState] = useState(selectedBoard);
  const isDraggingRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const { canManageBoard, isLoading: permissionsLoading } = useWorkspacePermissions();

  // Set up mutation hooks
  const createColumnMutation = useCreateColumn(selectedBoardId || "");
  const updateColumnMutation = useUpdateColumn();
  const deleteColumnMutation = useDeleteColumn();
  const reorderColumnsMutation = useReorderColumns(selectedBoardId || "");
  const moveTaskMutation = useMoveTask();
  const createTaskMutation = useCreateTask();

  // Initialize local state when selected board changes, but not during drag operations
  useEffect(() => {
    if (!isDraggingRef.current && !pendingUpdateRef.current) {
      setLocalBoardState(selectedBoard);
    }
  }, [selectedBoard]);

  if (!localBoardState) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!localBoardState.columns || localBoardState.columns.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-xl font-medium">No columns found</h3>
        <p className="text-muted-foreground">This board doesn&apos;t have any columns yet.</p>
        
        {permissionsLoading ? (
          <Button className="mt-4" disabled>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading...
          </Button>
        ) : canManageBoard && (
          <Button
            className="mt-4"
            onClick={() => {
              setEditingColumnId(null);
              setNewColumnName("");
              setIsColumnDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Column
          </Button>
        )}
      </div>
    );
  }

  // Handle drag and drop
  const onDragEnd = async (result: DropResult) => {
    // Set dragging state to false
    isDraggingRef.current = false;
    
    const { source, destination, type } = result;
    
    // If dropped outside a droppable area
    if (!destination) return;
    
    // If dropped in the same place
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    
    pendingUpdateRef.current = true;
    
    // Handle column reordering
    if (type === "column") {
      try {
        const reorderedColumns = Array.from(localBoardState.columns || []);
        const [movedColumn] = reorderedColumns.splice(source.index, 1);
        reorderedColumns.splice(destination.index, 0, movedColumn);
        
        // Update local state with new order
        const updatedColumns = reorderedColumns.map((col, idx) => ({
          ...col,
          order: idx,
        }));
        
        setLocalBoardState({
          ...localBoardState,
          columns: updatedColumns,
        });
        
        // Update columns with new order for API
        const columnsWithUpdatedOrder = updatedColumns.map((col, idx) => ({
          id: col.id,
          order: idx,
        }));
        
        // Use the reorderColumns mutation
        await reorderColumnsMutation.mutateAsync(columnsWithUpdatedOrder);
        
        // Refresh server data after successful update
        await refreshBoards();
      } catch (error) {
        console.error("Error reordering columns:", error);
        toast({
          title: "Error",
          description: "Failed to update column order",
          variant: "destructive",
        });
      } finally {
        pendingUpdateRef.current = false;
      }
      return;
    }
    
    // Handle task movement between columns
    if (type === "task") {
      try {
        const sourceColumnId = source.droppableId;
        const destinationColumnId = destination.droppableId;
        
        // Clone the current board state for optimistic updates
        const updatedColumns = JSON.parse(JSON.stringify(localBoardState.columns || []));
        
        // Find source and destination columns
        const sourceColumnIndex = updatedColumns.findIndex((col: any) => col.id === sourceColumnId);
        const destColumnIndex = updatedColumns.findIndex((col: any) => col.id === destinationColumnId);
        
        if (sourceColumnIndex === -1 || destColumnIndex === -1) return;
        
        // Get the task and remove it from the source
        const [movedTask] = updatedColumns[sourceColumnIndex].tasks.splice(source.index, 1);
        
        // Insert the task into the destination
        updatedColumns[destColumnIndex].tasks.splice(destination.index, 0, movedTask);
        
        // Update positions for all affected tasks
        // First, update positions in source column
        updatedColumns[sourceColumnIndex].tasks.forEach((task: any, index: number) => {
          task.position = index;
        });
        
        // Then, update positions in destination column if different
        if (sourceColumnIndex !== destColumnIndex) {
          updatedColumns[destColumnIndex].tasks.forEach((task: any, index: number) => {
            task.position = index;
          });
        }
        
        // Update local state with new task positions
        setLocalBoardState({
          ...localBoardState,
          columns: updatedColumns,
        });
        
        // Use the moveTask mutation
        await moveTaskMutation.mutateAsync({
          taskId: movedTask.id,
          data: {
            columnId: destinationColumnId,
            position: destination.index,
          }
        });
        
        // Refresh server data after successful update
        await refreshBoards();
      } catch (error) {
        console.error("Error moving task:", error);
        toast({
          title: "Error",
          description: "Failed to move task",
          variant: "destructive",
        });
      } finally {
        pendingUpdateRef.current = false;
      }
    }
  };

  const onDragStart = () => {
    // Set dragging state to true to prevent selectedBoard updates
    isDraggingRef.current = true;
  };

  // Handle column creation or editing
  const handleColumnSubmit = async () => {
    if (!newColumnName.trim()) {
      toast({
        title: "Error",
        description: "Column name is required",
        variant: "destructive",
      });
      return;
    }
    
    pendingUpdateRef.current = true;
    
    try {
      if (editingColumnId) {
        // Optimistically update the column name in local state
        const updatedColumns = localBoardState.columns?.map(col => 
          col.id === editingColumnId ? { ...col, name: newColumnName } : col
        );
        
        setLocalBoardState({
          ...localBoardState,
          columns: updatedColumns || [],
        });
        
        // Use updateColumn mutation
        await updateColumnMutation.mutateAsync({
          columnId: editingColumnId,
          data: { name: newColumnName }
        });
        
        toast({
          title: "Column updated",
          description: "Column has been updated successfully",
        });
      } else {
        // Optimistically add new column to local state
        const newColumnOrder = localBoardState.columns?.length || 0;
        const tempId = `temp-${Date.now()}`;
        
        // Create new column for local state
        const newColumn = {
          id: tempId,
          name: newColumnName,
          order: newColumnOrder,
          tasks: [],
        };
        
        setLocalBoardState({
          ...localBoardState,
          columns: [...(localBoardState.columns || []), newColumn],
        });
        
        // Use createColumn mutation
        await createColumnMutation.mutateAsync({
          name: newColumnName,
          order: newColumnOrder,
        });
        
        toast({
          title: "Column created",
          description: "New column has been created successfully",
        });
      }
      
      // Refresh board data
      await refreshBoards();
    } catch (error) {
      console.error("Error with column:", error);
      toast({
        title: "Error",
        description: "Failed to save column",
        variant: "destructive",
      });
    } finally {
      setNewColumnName("");
      setEditingColumnId(null);
      setIsColumnDialogOpen(false);
      pendingUpdateRef.current = false;
    }
  };

  // Handle column deletion
  const handleDeleteColumn = async (columnId: string) => {
    if (!confirm("Are you sure you want to delete this column? All tasks will be moved to the first column.")) {
      return;
    }
    
    pendingUpdateRef.current = true;
    
    try {
      // Optimistically remove the column from local state
      const updatedColumns = localBoardState.columns?.filter(col => col.id !== columnId) || [];
      
      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns,
      });
      
      // Use deleteColumn mutation
      await deleteColumnMutation.mutateAsync(columnId);
      
      toast({
        title: "Column deleted",
        description: "Column has been deleted successfully",
      });
      
      await refreshBoards();
    } catch (error) {
      console.error("Error deleting column:", error);
      toast({
        title: "Error",
        description: "Failed to delete column",
        variant: "destructive",
      });
    } finally {
      pendingUpdateRef.current = false;
    }
  };

  // Handle task creation
  const handleCreateTask = async (columnId: string) => {
    if (!newTaskTitle.trim()) {
      return;
    }
    
    try {
      // Optimistically add task to local state
      const tempId = `temp-${Date.now()}`;
      const tempTask = {
        id: tempId,
        title: newTaskTitle,
        position: (localBoardState.columns?.find(col => col.id === columnId)?.tasks?.length || 0),
        type: "task",
        priority: "medium",
      };
      
      // Update local state with the new task
      const updatedColumns = localBoardState.columns?.map(col => {
        if (col.id === columnId) {
          return {
            ...col,
            tasks: [...(col.tasks || []), tempTask],
          };
        }
        return col;
      });
      
      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns || [],
      });
      
      // Get the workspaceId from context
      await createTaskMutation.mutateAsync({
        title: newTaskTitle,
        workspaceId: currentWorkspace?.id || "",
        priority: "MEDIUM",
        status: "TODO",
        taskBoardId: selectedBoardId || "",
        columnId: columnId
      });
      
      toast({
        title: "Task created",
        description: "New task has been created successfully",
      });
      
      // Refresh board data
      await refreshBoards();
    } catch (error) {
      console.error("Error creating task:", error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setNewTaskTitle("");
      setNewTaskColumnId(null);
    }
  };

  const isLoading = createColumnMutation.isPending || 
                    updateColumnMutation.isPending || 
                    deleteColumnMutation.isPending || 
                    reorderColumnsMutation.isPending ||
                    moveTaskMutation.isPending;
  const isCreatingTask = createTaskMutation.isPending;

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-md font-medium">Board Columns</h3>
        
        {permissionsLoading ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            Loading...
          </Button>
        ) : canManageBoard && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingColumnId(null);
              setNewColumnName("");
              setIsColumnDialogOpen(true);
            }}
            disabled={isLoading}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Column
          </Button>
        )}
      </div>
      
      <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
        <Droppable droppableId="columns" direction="horizontal" type="column">
          {(provided) => (
            <div
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-container"
              ref={provided.innerRef}
              {...provided.droppableProps}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
                paddingBottom: '12px', /* Ensure space for the scrollbar */
              }}
            >
              {(localBoardState.columns || []).sort((a, b) => a.order - b.order).map((column, index) => (
                <Draggable 
                  key={column.id} 
                  draggableId={column.id} 
                  index={index}
                  isDragDisabled={!canManageBoard}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="flex-shrink-0 w-[300px]"
                    >
                      <Card className="border-t-4" style={{ borderTopColor: column.color || undefined }}>
                        <CardHeader className="px-3 py-2" {...(canManageBoard ? provided.dragHandleProps : {})}>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              {column.name}
                              <span className="text-xs font-normal text-muted-foreground">
                                {column.tasks?.length || 0}
                              </span>
                            </CardTitle>
                            
                            {canManageBoard ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem 
                                    onClick={() => {
                                      setEditingColumnId(column.id);
                                      setNewColumnName(column.name);
                                      setIsColumnDialogOpen(true);
                                    }}
                                    disabled={isLoading}
                                  >
                                    Edit Column
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDeleteColumn(column.id)}
                                    disabled={isLoading}
                                  >
                                    Delete Column
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="px-2 pb-2 space-y-2 max-h-[60vh] overflow-y-auto relative group">
                          <Droppable droppableId={column.id} type="task">
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`min-h-[200px] rounded-sm transition-colors ${
                                  snapshot.isDraggingOver ? "bg-muted/50" : ""
                                }`}
                              >
                                {column.tasks && column.tasks.length > 0 ? (
                                  column.tasks.map((task, index) => (
                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                      {(provided, snapshot) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                          className={`mb-2 transition-shadow ${
                                            snapshot.isDragging ? "shadow-lg" : ""
                                          }`}
                                        >
                                          <TaskCard 
                                            key={task.id} 
                                            id={task.id}
                                            title={task.title}
                                            type={task.type}
                                            priority={task.priority}
                                            assignee={task.assignee || null}
                                            commentCount={task._count?.comments || 0}
                                            attachmentCount={task._count?.attachments || 0}
                                            issueKey={task.issueKey || null}
                                          />
                                        </div>
                                      )}
                                    </Draggable>
                                  ))
                                ) : (
                                  <div className="h-20 border border-dashed rounded-md flex items-center justify-center text-sm text-muted-foreground">
                                    No tasks
                                  </div>
                                )}
                                {provided.placeholder}

                                {/* Quick create task input */}
                                {newTaskColumnId === column.id ? (
                                  <form 
                                    className="mt-2 bg-background border rounded-md overflow-hidden"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      handleCreateTask(column.id);
                                    }}
                                  >
                                    <Input
                                      autoFocus
                                      placeholder="What needs to be done?"
                                      value={newTaskTitle}
                                      onChange={(e) => setNewTaskTitle(e.target.value)}
                                      disabled={isCreatingTask}
                                      className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                    />
                                    <div className="flex justify-between p-2 bg-muted/20">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        type="button"
                                        onClick={() => {
                                          setNewTaskColumnId(null);
                                          setNewTaskTitle("");
                                        }}
                                        disabled={isCreatingTask}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        type="submit"
                                        disabled={!newTaskTitle.trim() || isCreatingTask}
                                      >
                                        {isCreatingTask ? (
                                          <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creating...
                                          </>
                                        ) : (
                                          "Create"
                                        )}
                                      </Button>
                                    </div>
                                  </form>
                                ) : (
                                  <Button
                                    onClick={() => setNewTaskColumnId(column.id)}
                                    className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                    variant="ghost"
                                    disabled={isLoading}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Create task
                                  </Button>
                                )}
                              </div>
                            )}
                          </Droppable>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      {/* Column Dialog - Only shown for admins/owners */}
      {canManageBoard && (
        <Dialog open={isColumnDialogOpen} onOpenChange={setIsColumnDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingColumnId ? "Edit Column" : "Add New Column"}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="columnName">Column Name</Label>
                <Input
                  id="columnName"
                  placeholder="Enter column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewColumnName("");
                  setEditingColumnId(null);
                  setIsColumnDialogOpen(false);
                }}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleColumnSubmit} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
} 