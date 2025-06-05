"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronDown, ChevronRight, User, Users, Calendar, Star, BookOpen, Edit2, Check, X, Trash2 } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import EnhancedTaskCard from "./EnhancedTaskCard";
import { GroupingOption } from "./KanbanFilters";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { getItemTypeIcon } from "@/lib/item-utils";
import { useToast } from "@/hooks/use-toast";

interface Group {
  id: string;
  name: string;
  icon?: React.ReactNode;
  items: any[];
}

interface GroupedColumnProps {
  columnId: string;
  columnName: string;
  columnColor?: string;
  tasks: any[];
  groupBy: GroupingOption;
  canManageBoard: boolean;
  dragHandleProps?: any;
  onCreateTask?: (columnId: string) => void;
  onColumnEdit?: (columnId: string, name: string) => Promise<void>;
  onColumnDelete?: (columnId: string) => Promise<void>;
}

export default function GroupedColumn({
  columnId,
  columnName,
  columnColor,
  tasks,
  groupBy,
  canManageBoard,
  dragHandleProps,
  onCreateTask,
  onColumnEdit,
  onColumnDelete
}: GroupedColumnProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isEditingColumnName, setIsEditingColumnName] = useState(false);
  const [editColumnName, setEditColumnName] = useState(columnName);
  const [isSavingColumnName, setIsSavingColumnName] = useState(false);
  const { toast } = useToast();

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleEditColumnName = () => {
    setEditColumnName(columnName);
    setIsEditingColumnName(true);
  };

  const handleSaveColumnName = async () => {
    if (!editColumnName.trim() || editColumnName === columnName || !onColumnEdit) {
      setIsEditingColumnName(false);
      setEditColumnName(columnName);
      return;
    }

    setIsSavingColumnName(true);
    try {
      await onColumnEdit(columnId, editColumnName.trim());
      setIsEditingColumnName(false);
      toast({
        title: "Column updated",
        description: `Column renamed to "${editColumnName.trim()}"`,
      });
    } catch (error) {
      console.error("Error updating column name:", error);
      toast({
        title: "Error",
        description: "Failed to update column name",
        variant: "destructive",
      });
      setEditColumnName(columnName);
    } finally {
      setIsSavingColumnName(false);
    }
  };

  const handleCancelEditColumnName = () => {
    setIsEditingColumnName(false);
    setEditColumnName(columnName);
  };

  const handleDeleteColumn = async () => {
    if (!onColumnDelete || tasks.length > 0) return;

    if (!window.confirm(`Are you sure you want to delete the "${columnName}" column?`)) {
      return;
    }

    setIsSavingColumnName(true);
    try {
      await onColumnDelete(columnId);
      toast({
        title: "Column deleted",
        description: `Column "${columnName}" has been deleted`,
      });
    } catch (error) {
      console.error("Error deleting column:", error);
      toast({
        title: "Error",
        description: "Failed to delete column",
        variant: "destructive",
      });
    } finally {
      setIsSavingColumnName(false);
    }
  };

  // Create groups based on grouping option
  const getGroups = (): Group[] => {
    if (groupBy === 'none') {
      return [{ id: 'all', name: 'All Items', items: tasks }];
    }

    const groups: Record<string, Group> = {};

    tasks.forEach(task => {
      let groupId: string;
      let groupName: string;
      let icon: React.ReactNode | undefined;

      // Handle grouping based on item's entity type if available
      const itemType = task.entityType ||
        (task.type === 'MILESTONE' ? 'milestone' :
          task.type === 'EPIC' ? 'epic' :
            task.type === 'STORY' ? 'story' : 'task');

      if (groupBy === 'type') {
        // First check if it's a special entity type
        if (itemType !== 'task') {
          groupId = itemType.toUpperCase();
          groupName = itemType.charAt(0).toUpperCase() + itemType.slice(1) + 's';

          switch (itemType) {
            case 'milestone':
              icon = <Calendar className="h-4 w-4 mr-2 text-indigo-500" />;
              break;
            case 'epic':
              icon = <Star className="h-4 w-4 mr-2 text-purple-500" />;
              break;
            case 'story':
              icon = <BookOpen className="h-4 w-4 mr-2 text-blue-500" />;
              break;
          }
        } else {
          // Regular task types
          const type = task.type?.toUpperCase() || 'TASK';
          groupId = type;
          groupName = type;
          icon = getItemTypeIcon(type);
        }
      }
      else if (groupBy === 'assignee') {
        if (!task.assignee) {
          groupId = 'unassigned';
          groupName = 'Unassigned';
          icon = <Users className="h-4 w-4 mr-2 text-muted-foreground" />;
        } else {
          groupId = task.assignee.id;
          groupName = task.assignee.name || 'Unknown';
          icon = <User className="h-4 w-4 mr-2 text-muted-foreground" />;
        }
      }
      else if (groupBy === 'milestone') {
        if (!task.milestone && itemType !== 'milestone') {
          groupId = 'no-milestone';
          groupName = 'No Milestone';
        } else if (itemType === 'milestone') {
          // Group by the milestone itself
          groupId = task.id;
          groupName = task.title;
          icon = <Calendar className="h-4 w-4 mr-2 text-indigo-500" />;
        } else {
          groupId = task.milestone.id;
          groupName = task.milestone.title;
          icon = <Calendar className="h-4 w-4 mr-2 text-indigo-500" />;
        }
      }
      else if (groupBy === 'epic') {
        if ((!task.epic && itemType !== 'epic') || (itemType === 'milestone')) {
          groupId = 'no-epic';
          groupName = 'No Epic';
        } else if (itemType === 'epic') {
          // Group by the epic itself
          groupId = task.id;
          groupName = task.title;
          icon = <Star className="h-4 w-4 mr-2 text-purple-500" />;
        } else {
          groupId = task.epic.id;
          groupName = task.epic.title;
          icon = <Star className="h-4 w-4 mr-2 text-purple-500" />;
        }
      }
      else {
        groupId = 'all';
        groupName = 'All Items';
      }

      if (!groups[groupId]) {
        groups[groupId] = {
          id: groupId,
          name: groupName,
          icon,
          items: []
        };
      }

      groups[groupId].items.push(task);
    });

    return Object.values(groups);
  };

  const groups = getGroups();

  return (
    <Card className="border-t-4" style={{ borderTopColor: columnColor || undefined }}>
      <CardHeader className="px-3 py-2" {...(canManageBoard ? dragHandleProps : {})}>
        <div className="flex justify-between items-center">
          {isEditingColumnName ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editColumnName}
                onChange={(e) => setEditColumnName(e.target.value)}
                className="h-8 text-sm font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveColumnName();
                  } else if (e.key === 'Escape') {
                    handleCancelEditColumnName();
                  }
                }}
                disabled={isSavingColumnName}
              />
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleSaveColumnName}
                  disabled={isSavingColumnName}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCancelEditColumnName}
                  disabled={isSavingColumnName}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <CardTitle className="text-sm font-medium flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span>{columnName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {tasks.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {canManageBoard && onColumnEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleEditColumnName}
                  >
                    <Edit2 size={8} className="!h-3 !w-3" />
                  </Button>
                )}
                {canManageBoard && onColumnDelete && tasks.length === 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-red-500/10 hover:text-red-500"
                    onClick={handleDeleteColumn}
                    disabled={isSavingColumnName}
                  >
                    <Trash2 size={8} className="!h-3 !w-3" />
                  </Button>
                )}
              </div>
            </CardTitle>
          )}

          {onCreateTask && !isEditingColumnName && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onCreateTask(columnId)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-2 space-y-2">
        <Droppable droppableId={columnId} type="task">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`min-h-[100px] rounded-sm transition-colors ${snapshot.isDraggingOver ? "bg-muted/50" : ""
                }`}
            >
              {groups.map((group, groupIndex) => (
                <div key={group.id} className="mb-2">
                  {groupBy !== 'none' && (
                    <Collapsible
                      open={!collapsedGroups[group.id]}
                      onOpenChange={() => toggleGroup(group.id)}
                    >
                      <div className="flex items-center py-1 px-1">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 p-1">
                            {collapsedGroups[group.id] ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-1 text-xs font-medium">
                          {group.icon}
                          {group.name}
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            {group.items.length}
                          </Badge>
                        </div>
                      </div>

                      {!collapsedGroups[group.id] && <Separator className="my-1" />}

                      <CollapsibleContent>
                        {group.items.map((item, taskIndex) => (
                          <Draggable
                            key={item.id}
                            draggableId={item.id}
                            index={taskIndex + (groupIndex * 1000)} // Ensure unique indices across groups
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`mb-2 transition-shadow ${snapshot.isDragging ? "shadow-lg" : ""
                                  }`}
                              >
                                <EnhancedTaskCard
                                  id={item.id}
                                  title={item.title}
                                  type={item.type || 'TASK'}
                                  priority={item.priority}
                                  assignee={item.assignee}
                                  commentCount={item._count?.comments || 0}
                                  attachmentCount={item._count?.attachments || 0}
                                  issueKey={item.issueKey}
                                  isMilestone={item.type === 'MILESTONE'}
                                  isEpic={item.type === 'EPIC'}
                                  isStory={item.type === 'STORY'}
                                  milestoneTitle={item.milestone?.title}
                                  epicTitle={item.epic?.title}
                                  storyTitle={item.story?.title}
                                  color={item.color}
                                  entityType={item.entityType}
                                  dueDate={item.dueDate}
                                  _count={item._count}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {groupBy === 'none' && (
                    <>
                      {group.items.map((item, taskIndex) => (
                        <Draggable
                          key={item.id}
                          draggableId={item.id}
                          index={taskIndex}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`mb-2 transition-shadow ${snapshot.isDragging ? "shadow-lg" : ""
                                }`}
                            >
                              <EnhancedTaskCard
                                id={item.id}
                                title={item.title}
                                type={item.type || 'TASK'}
                                priority={item.priority}
                                assignee={item.assignee}
                                commentCount={item._count?.comments || 0}
                                attachmentCount={item._count?.attachments || 0}
                                issueKey={item.issueKey}
                                isMilestone={item.type === 'MILESTONE'}
                                isEpic={item.type === 'EPIC'}
                                isStory={item.type === 'STORY'}
                                milestoneTitle={item.milestone?.title}
                                epicTitle={item.epic?.title}
                                storyTitle={item.story?.title}
                                color={item.color}
                                entityType={item.entityType}
                                dueDate={item.dueDate}
                                _count={item._count}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                    </>
                  )}
                </div>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </CardContent>
    </Card>
  );
} 