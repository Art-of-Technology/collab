"use client";

import { useState, useEffect, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useTasks } from "@/context/TasksContext";
import KanbanFilters, { ItemType, GroupingOption } from "./KanbanFilters";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useReorderColumns,
} from "@/hooks/queries/useTask";
import { useBoardItems, useReorderBoardItems } from "@/hooks/queries/useBoardItems";
import GroupedColumn from "./GroupedColumn";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CreateTaskForm from "@/components/tasks/CreateTaskForm";
import { useSearchParams } from "next/navigation";

// Define task interface
interface Task {
  id: string;
  title: string;
  description?: string;
  type: ItemType;
  [key: string]: any;
}

// Define column interface
interface Column {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  tasks?: Task[];
}

export default function KanbanView() {
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const { toast } = useToast();
  const { selectedBoard, selectedBoardId, refreshBoards } = useTasks();
  const { currentWorkspace } = useWorkspace();
  const [localBoardState, setLocalBoardState] = useState<any>(null);
  const isDraggingRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const { canManageBoard, isLoading: permissionsLoading } = useWorkspacePermissions();
  const searchParams = useSearchParams();

  // Get highlighted item IDs from URL
  const highlightParam = searchParams.get('highlight');
  const highlightedIds = highlightParam ? highlightParam.split(',').filter(Boolean) : [];

  // Filter and grouping state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupingOption>("none");

  // Fetch board items - including tasks, milestones, epics, and stories
  const { data: boardData, isLoading: isLoadingBoardItems } = useBoardItems(selectedBoardId);

  // Set up mutation hooks
  const createColumnMutation = useCreateColumn(selectedBoardId || "");
  const updateColumnMutation = useUpdateColumn();
  const deleteColumnMutation = useDeleteColumn();
  const reorderColumnsMutation = useReorderColumns(selectedBoardId || "");
  const reorderItemsMutation = useReorderBoardItems();

  // Add the quick task creation dialog and functionality
  const [isQuickTaskOpen, setIsQuickTaskOpen] = useState(false);
  const [quickTaskColumnId, setQuickTaskColumnId] = useState<string | null>(null);

  // Initialize local state when selected board changes, but not during drag operations
  useEffect(() => {
    if (!isDraggingRef.current && !pendingUpdateRef.current) {
      const localBoard = selectedBoard ? { ...selectedBoard } : null;

      // If we have board items, inject them into the columns
      if (localBoard && boardData) {
        // Add all items to each column
        if (localBoard.columns) {
          localBoard.columns = localBoard.columns.map((column: any) => {
            const columnItems = boardData.itemsByColumn[column.id] || [];
            return {
              ...column,
              tasks: columnItems
            };
          });
        }
      }

      setLocalBoardState(localBoard);
    }
  }, [selectedBoard, boardData]);

  // Filter tasks based on search term, selected types, and selected labels
  const getFilteredTasks = (tasks: any[] = []) => {
    if (!tasks?.length) return [];

    return tasks.filter(task => {
      // Filter by search term (including issueKey/short codes)
      const searchTermLower = searchTerm.trim().toLowerCase();
      const matchesSearch = searchTermLower === "" ||
        task.title.toLowerCase().includes(searchTermLower) ||
        (task.description && task.description.toLowerCase().includes(searchTermLower)) ||
        (task.issueKey && task.issueKey.toLowerCase().includes(searchTermLower));

      // Filter by selected types
      const matchesType = selectedTypes.length === 0 ||
        (task.type && selectedTypes.includes(task.type));

      // Filter by selected labels
      const matchesLabels = selectedLabels.length === 0 ||
        (task.labels && task.labels.some((label: any) => selectedLabels.includes(label.id)));

      return matchesSearch && matchesType && matchesLabels;
    });
  };

  // Handle inline column editing
  const handleColumnEdit = async (columnId: string, name: string) => {
    try {
      await updateColumnMutation.mutateAsync({
        columnId,
        data: { name }
      });

      // Optimistically update UI
      const updatedColumns = localBoardState.columns.map((col: Column) =>
        col.id === columnId ? { ...col, name } : col
      );

      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns,
      });

      // Refresh boards data
      refreshBoards();
    } catch (error) {
      console.error("Error updating column:", error);
      throw error; // Re-throw so the component can handle the error
    }
  };

  // Handle column deletion
  const handleColumnDelete = async (columnId: string) => {
    try {
      await deleteColumnMutation.mutateAsync(columnId);

      // Optimistically update UI
      const updatedColumns = localBoardState.columns.filter((col: Column) => col.id !== columnId);

      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns,
      });

      // Refresh boards data
      refreshBoards();
    } catch (error) {
      console.error("Error deleting column:", error);
      throw error; // Re-throw so the component can handle the error
    }
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
        // Update existing column
        await updateColumnMutation.mutateAsync({
          columnId: editingColumnId,
          data: {
            name: newColumnName
          }
        });

        // Optimistically update UI
        const updatedColumns = localBoardState.columns.map((col: Column) =>
          col.id === editingColumnId
            ? { ...col, name: newColumnName }
            : col
        );

        setLocalBoardState({
          ...localBoardState,
          columns: updatedColumns,
        });

        toast({
          title: "Success",
          description: "Column updated successfully",
        });
      } else {
        // Create new column
        const result = await createColumnMutation.mutateAsync({
          name: newColumnName,
          order: localBoardState.columns?.length || 0,
          color: "#" + Math.floor(Math.random() * 16777215).toString(16), // Random color
        });

        // Optimistically update UI
        const newColumn = {
          id: result.id,
          name: newColumnName,
          order: localBoardState.columns?.length || 0,
          tasks: [],
          color: result.color,
        };

        setLocalBoardState({
          ...localBoardState,
          columns: [...(localBoardState.columns || []), newColumn],
        });

        toast({
          title: "Success",
          description: "Column created successfully",
        });
      }

      // Close dialog and reset state
      setIsColumnDialogOpen(false);
      setNewColumnName("");
      setEditingColumnId(null);

      // Refresh boards data
      refreshBoards();
    } catch (error) {
      console.error("Error creating/updating column:", error);
      toast({
        title: "Error",
        description: editingColumnId
          ? "Failed to update column"
          : "Failed to create column",
        variant: "destructive",
      });
    } finally {
      pendingUpdateRef.current = false;
    }
  };

  if (!localBoardState || isLoadingBoardItems) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Handle drag and drop interactions
  const onDragStart = () => {
    isDraggingRef.current = true;
  };

  const onDragEnd = async (result: DropResult) => {
    isDraggingRef.current = false;
    const { destination, source, draggableId, type } = result;

    if (!destination || !localBoardState) {
      return;
    }

    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    if (type === "column") {
      // Create a new array of column IDs in the new order
      const newColumnOrder = Array.from(localBoardState.columns || [])
        .sort((a: any, b: any) => a.order - b.order)
        .map((col: any) => col.id);

      // Move the dragged column ID to the new position
      const [removed] = newColumnOrder.splice(source.index, 1);
      newColumnOrder.splice(destination.index, 0, removed);

      // Update the local state to reflect the new order
      const updatedColumns = (localBoardState.columns || []).map((column: any, index: number) => {
        const id = newColumnOrder[index];
        const originalColumn = localBoardState.columns?.find((c: any) => c.id === id);
        if (!originalColumn) return column;

        return {
          ...originalColumn,
          order: index
        };
      });

      setLocalBoardState({
        ...localBoardState,
        columns: updatedColumns,
      });

      // Optimistically update the UI, then make the API call
      pendingUpdateRef.current = true;
      try {
        await reorderColumnsMutation.mutateAsync(newColumnOrder.map((id: string, index: number) => ({
          id,
          order: index
        })));
      } catch (error) {
        console.error("Error reordering columns:", error);
        toast({
          title: "Error",
          description: "Failed to update column order",
          variant: "destructive",
        });
        // Revert to the original state if the API call fails
        setLocalBoardState(selectedBoard);
      } finally {
        pendingUpdateRef.current = false;
      }
      return;
    }

    if (type === "task") {
      const sourceCol = localBoardState.columns.find((c: any) => c.id === source.droppableId);
      const destCol = localBoardState.columns.find((c: any) => c.id === destination.droppableId);
      if (!sourceCol || !destCol) return;

      // Get the item being moved
      const movedItem = sourceCol.tasks.find((t: any) => t.id === draggableId);
      if (!movedItem) return;

      // Create new arrays for optimistic update
      const sourceTasks = [...sourceCol.tasks];
      const destTasks = source.droppableId === destination.droppableId ? sourceTasks : [...destCol.tasks];

      // Remove item from source
      sourceTasks.splice(source.index, 1);
      // Add item to destination at the correct index
      destTasks.splice(destination.index, 0, movedItem);

      // Update local state optimistically
      const newBoardState = {
        ...localBoardState,
        columns: localBoardState.columns.map((col: any) => {
          if (col.id === source.droppableId) {
            return { ...col, tasks: sourceTasks };
          }
          if (col.id === destination.droppableId) {
            return { ...col, tasks: destTasks };
          }
          return col;
        }),
      };
      setLocalBoardState(newBoardState);

      // --- Backend Update --- 
      // Get the final ordered list of IDs for the destination column
      const finalDestCol = newBoardState.columns.find((c: any) => c.id === destination.droppableId);
      const orderedItemIds = finalDestCol ? finalDestCol.tasks.map((t: any) => t.id) : [];

      // Call the mutation
      try {
        await reorderItemsMutation.mutateAsync({
          boardId: selectedBoardId || '',
          columnId: destination.droppableId,
          orderedItemIds: orderedItemIds,
          movedItemId: draggableId,
        });
      } catch (error) {
        console.error("Error reordering items:", error);
        toast({
          title: "Error",
          description: "Failed to update item order",
          variant: "destructive",
        });
        // Revert state on error (handled by hook's onError)
      }
    }
  };

  // Create new task
  const handleCreateTask = (columnId: string) => {
    setQuickTaskColumnId(columnId);
    setIsQuickTaskOpen(true);
  };

  // Determine if we're loading
  const isLoading =
    isLoadingBoardItems ||
    createColumnMutation.isPending ||
    updateColumnMutation.isPending ||
    deleteColumnMutation.isPending ||
    reorderColumnsMutation.isPending ||
    reorderItemsMutation.isPending;

  return (
    <>
      <div className="sticky top-16 pt-4 z-40 w-full bg-[#191919] backdrop-blur-sm mt-0">
        <KanbanFilters
          onSearchChange={setSearchTerm}
          onTypeFilter={setSelectedTypes}
          onLabelFilter={setSelectedLabels}
          onGroupingChange={setGroupBy}
          selectedGrouping={groupBy}
          selectedTypes={selectedTypes}
          selectedLabels={selectedLabels}
          workspaceId={currentWorkspace?.id || ""}
          showSortOptions={false}
        />
      </div>

      <div className="w-full overflow-hidden">
        <div className="flex justify-between items-center my-4">
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

        {(!localBoardState.columns || localBoardState.columns.length === 0) ? (
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
        ) : (
          <DragDropContext onDragEnd={onDragEnd} onDragStart={onDragStart}>
            <Droppable droppableId="columns" direction="horizontal" type="column">
              {(provided) => (
                <div
                  className="grid grid-flow-col overflow-auto w-full auto-cols-[300px] gap-4 pb-4"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {(localBoardState.columns || [])
                    .sort((a: any, b: any) => a.order - b.order)
                    .map((column: any, index: number) => {
                      const filteredTasks = getFilteredTasks(column.tasks);

                      return (
                        <Draggable
                          key={column.id}
                          draggableId={column.id}
                          index={index}
                          isDragDisabled={!canManageBoard}
                        >
                          {(draggableProvided) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              className="w-full flex flex-col h-full"
                            >
                              <Droppable droppableId={column.id} type="task">
                                {(droppableProvided, droppableSnapshot) => (
                                  <div
                                    ref={droppableProvided.innerRef}
                                    {...droppableProvided.droppableProps}
                                    className={`flex flex-col h-full ${droppableSnapshot.isDraggingOver ? 'bg-background' : ''}`}
                                    style={{ minHeight: '100%' }}
                                  >
                                    <GroupedColumn
                                      columnId={column.id}
                                      columnName={column.name}
                                      columnColor={column.color}
                                      tasks={filteredTasks}
                                      groupBy={groupBy}
                                      canManageBoard={canManageBoard}
                                      dragHandleProps={draggableProvided.dragHandleProps}
                                      onCreateTask={handleCreateTask}
                                      onColumnEdit={canManageBoard ? handleColumnEdit : undefined}
                                      onColumnDelete={canManageBoard ? handleColumnDelete : undefined}
                                      highlightedIds={highlightedIds}
                                      placeholder={droppableProvided.placeholder}
                                      boardId={selectedBoardId}
                                    />
                                  </div>
                                )}
                              </Droppable>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* Column Edit/Create Dialog */}
        <Dialog open={isColumnDialogOpen} onOpenChange={setIsColumnDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingColumnId ? "Edit Column" : "Create New Column"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="column-name">Column Name</Label>
                <Input
                  id="column-name"
                  placeholder="Enter column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsColumnDialogOpen(false);
                  setNewColumnName("");
                  setEditingColumnId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleColumnSubmit}
                disabled={isLoading || !newColumnName.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingColumnId ? "Updating..." : "Creating..."}
                  </>
                ) : (
                  editingColumnId ? "Update Column" : "Create Column"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Quick Task Creation Dialog */}
        <CreateTaskForm
          key={`quick-task-${quickTaskColumnId}`}
          isOpen={isQuickTaskOpen}
          onClose={() => setIsQuickTaskOpen(false)}
          initialData={{
            taskBoardId: selectedBoardId,
            columnId: quickTaskColumnId || undefined
          }}
        />
      </div>
    </>
  );
} 