"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronRight, User, Users, Calendar, Star, BookOpen, CheckSquare } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import EnhancedTaskCard from "./EnhancedTaskCard";
import { GroupingOption } from "./KanbanFilters";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { getItemTypeIcon } from "@/lib/item-utils";

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
}

export default function GroupedColumn({
  columnId,
  columnName,
  columnColor,
  tasks,
  groupBy,
  canManageBoard,
  dragHandleProps,
  onCreateTask
}: GroupedColumnProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
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
          
          switch(itemType) {
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
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {columnName}
            <span className="text-xs font-normal text-muted-foreground">
              {tasks.length}
            </span>
          </CardTitle>
          
          {onCreateTask && (
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
      
      <CardContent className="px-2 pb-2 space-y-2 max-h-[60vh] overflow-y-auto">
        <Droppable droppableId={columnId} type="task">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`min-h-[200px] rounded-sm transition-colors ${
                snapshot.isDraggingOver ? "bg-muted/50" : ""
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
                                className={`mb-2 transition-shadow ${
                                  snapshot.isDragging ? "shadow-lg" : ""
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
                              className={`mb-2 transition-shadow ${
                                snapshot.isDragging ? "shadow-lg" : ""
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