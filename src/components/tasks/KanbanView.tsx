"use client";

import { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TaskCard from "@/components/tasks/TaskCard";
import { Loader2, Plus, MoreVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTasks } from "@/context/TasksContext";
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

export default function KanbanView() {
  const [loading, setLoading] = useState(false);
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const { toast } = useToast();
  const { selectedBoard, selectedBoardId, refreshBoards } = useTasks();
  const [localBoardState, setLocalBoardState] = useState(selectedBoard);
  const isDraggingRef = useRef(false);
  const pendingUpdateRef = useRef(false);

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
        setLoading(true);
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
        
        // Save new order to server
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}/columns/reorder`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columns: columnsWithUpdatedOrder }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update column order");
        }
        
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
        setLoading(false);
        pendingUpdateRef.current = false;
      }
      return;
    }
    
    // Handle task movement between columns
    if (type === "task") {
      try {
        setLoading(true);
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
        
        // Send task move request to server
        const response = await fetch(`/api/tasks/${movedTask.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId: destinationColumnId,
            position: destination.index,
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to move task");
        }
        
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
        setLoading(false);
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
    setLoading(true);
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
        
        // Update existing column
        const response = await fetch(`/api/tasks/columns/${editingColumnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newColumnName }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update column");
        }
        
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
        
        // Create new column on server
        const response = await fetch(`/api/tasks/boards/${selectedBoardId}/columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newColumnName,
            order: newColumnOrder,
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to create column");
        }
        
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
      setLoading(false);
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
    setLoading(true);
    try {
      // Optimistically remove the column from local state
      const updatedColumns = localBoardState.columns?.filter(col => col.id !== columnId) || [];
      
      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns,
      });
      
      const response = await fetch(`/api/tasks/columns/${columnId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete column");
      }
      
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
      setLoading(false);
      pendingUpdateRef.current = false;
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button
          variant="outline"
          onClick={() => {
            setEditingColumnId(null);
            setNewColumnName("");
            setIsColumnDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Column
        </Button>
      </div>
      
      <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
        <Droppable droppableId="board" type="column" direction="horizontal">
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
                <Draggable key={column.id} draggableId={column.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="flex-shrink-0 w-[300px]"
                    >
                      <Card className="border-t-4" style={{ borderTopColor: column.color || undefined }}>
                        <CardHeader className="px-3 py-2" {...provided.dragHandleProps}>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              {column.name}
                              <span className="text-xs font-normal text-muted-foreground">
                                {column.tasks?.length || 0}
                              </span>
                            </CardTitle>
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
                                >
                                  Edit Column
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDeleteColumn(column.id)}
                                >
                                  Delete Column
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardHeader>
                        <CardContent className="px-2 pb-2 space-y-2 max-h-[60vh] overflow-y-auto">
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
      
      {/* Column Dialog */}
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
            >
              Cancel
            </Button>
            <Button onClick={handleColumnSubmit} disabled={loading}>
              {loading ? (
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
    </>
  );
} 