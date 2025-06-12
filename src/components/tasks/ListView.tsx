"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Loader2, CalendarCheck, Star, BookOpen, CheckSquare, Bug, Sparkles, TrendingUp, ChevronDown, ChevronRight, User, Users, Calendar, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTasks } from "@/context/TasksContext";
import { useBoardItems } from "@/hooks/queries/useBoardItems";
import KanbanFilters, { ItemType, GroupingOption, SortOption } from "./KanbanFilters";
import { useEffect, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { lazy, Suspense } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import React from "react";

// Lazy load the detail modals
const MilestoneDetailModal = lazy(() => import("../milestones/MilestoneDetailModal"));
const EpicDetailModal = lazy(() => import("../epics/EpicDetailModal"));
const StoryDetailModal = lazy(() => import("../stories/StoryDetailModal"));

// Enhanced BoardItem interface with better type support
interface BoardItem {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string;
  type: string;
  issueKey?: string | null;
  entityType: string;
  dueDate?: Date | null;
  color?: string | null;
  milestone?: {
    id: string;
    title: string;
  } | null;
  epic?: {
    id: string;
    title: string;
  } | null;
  column?: {
    id: string;
    name: string;
  } | null;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  reporter?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  _count?: {
    comments?: number;
    attachments?: number;
    tasks?: number;
    epics?: number;
    stories?: number;
  }
  labels?: { id: string; name: string; color: string }[];
}

interface Group {
  id: string;
  name: string;
  icon?: React.ReactNode;
  items: BoardItem[];
}

// Create a wrapper component for TaskDetailModal that handles different item types
interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  type: string;
}

function TaskModal({ isOpen, onClose, taskId, type }: TaskModalProps) {
  // Only render the modal if it's open to improve performance
  if (!isOpen) return null;

  // Use the lazy-loaded components with Suspense
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      {(() => {
        switch (type) {
          case 'milestone':
            return <MilestoneDetailModal milestoneId={taskId} onClose={onClose} />;
          case 'epic':
            return <EpicDetailModal epicId={taskId} onClose={onClose} />;
          case 'story':
            return <StoryDetailModal storyId={taskId} onClose={onClose} />;
          case 'task':
          default:
            return <TaskDetailModal taskId={taskId} onClose={onClose} />;
        }
      })()}
    </Suspense>
  );
}

export default function ListView() {
  const { selectedBoardId } = useTasks();
  const { currentWorkspace } = useWorkspace();
  const { data: boardData, isLoading } = useBoardItems(selectedBoardId);
  const [filteredItems, setFilteredItems] = useState<BoardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupingOption>("none");
  const [sortField, setSortField] = useState<SortOption>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Extract available statuses from board data
  const availableStatuses = React.useMemo(() => {
    if (!boardData?.allItems) return [];
    
    const statusSet = new Set<string>();
    boardData.allItems.forEach(item => {
      const itemStatus = item.column?.name || (item as any).status;
      if (itemStatus) {
        statusSet.add(itemStatus);
      }
    });
    
    return Array.from(statusSet).sort();
  }, [boardData]);

  // Group items based on groupBy option
  const getGroups = (items: BoardItem[]): Group[] => {
    if (groupBy === 'none') {
      return [{
        id: 'all',
        name: 'All Items',
        items
      }];
    }

    const groups: Record<string, Group> = {};

    items.forEach(item => {
      let groupId: string;
      let groupName: string;
      let icon: React.ReactNode | undefined;

      const itemType = item.entityType || 'task';

      if (groupBy === 'type') {
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
          const type = item.type?.toUpperCase() || 'TASK';
          groupId = type;
          groupName = type;
          icon = renderTypeIcon(item);
        }
      }
      else if (groupBy === 'assignee') {
        if (!item.assignee) {
          groupId = 'unassigned';
          groupName = 'Unassigned';
          icon = <Users className="h-4 w-4 mr-2 text-muted-foreground" />;
        } else {
          groupId = item.assignee.id;
          groupName = item.assignee.name || 'Unknown';
          icon = <User className="h-4 w-4 mr-2 text-muted-foreground" />;
        }
      }
      else if (groupBy === 'milestone') {
        if (!item.milestone && itemType !== 'milestone') {
          groupId = 'no-milestone';
          groupName = 'No Milestone';
        } else if (itemType === 'milestone') {
          groupId = item.id;
          groupName = item.title;
          icon = <Calendar className="h-4 w-4 mr-2 text-indigo-500" />;
        } else {
          groupId = item.milestone!.id;
          groupName = item.milestone!.title;
          icon = <Calendar className="h-4 w-4 mr-2 text-indigo-500" />;
        }
      }
      else if (groupBy === 'epic') {
        if ((!item.epic && itemType !== 'epic') || (itemType === 'milestone')) {
          groupId = 'no-epic';
          groupName = 'No Epic';
        } else if (itemType === 'epic') {
          groupId = item.id;
          groupName = item.title;
          icon = <Star className="h-4 w-4 mr-2 text-purple-500" />;
        } else {
          groupId = item.epic!.id;
          groupName = item.epic!.title;
          icon = <Star className="h-4 w-4 mr-2 text-purple-500" />;
        }
      }
      else if (groupBy === 'labels') {
        if (!item.labels || item.labels.length === 0) {
          groupId = 'no-labels';
          groupName = 'No Labels';
          icon = <Tag className="h-4 w-4 mr-2 text-muted-foreground" />;
        } else {
          // For items with multiple labels, add them to multiple groups
          item.labels.forEach((label: any) => {
            const labelGroupId = `label-${label.id}`;
            const labelGroupName = label.name;
            const labelIcon = (
              <div 
                className="h-3 w-3 rounded-full mr-2 flex-shrink-0" 
                style={{ backgroundColor: label.color }}
              />
            );

            if (!groups[labelGroupId]) {
              groups[labelGroupId] = {
                id: labelGroupId,
                name: labelGroupName,
                icon: labelIcon,
                items: []
              };
            }

            groups[labelGroupId].items.push(item);
          });
          return; // Skip normal group assignment
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

      groups[groupId].items.push(item);
    });

    return Object.values(groups);
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const renderTypeIcon = (item: BoardItem) => {
    if (item.entityType === 'task') {
      switch (item.type) {
        case 'TASK': return <CheckSquare className="h-4 w-4 text-blue-500" />;
        case 'BUG': return <Bug className="h-4 w-4 text-red-500" />;
        case 'FEATURE': return <Sparkles className="h-4 w-4 text-green-500" />;
        case 'IMPROVEMENT': return <TrendingUp className="h-4 w-4 text-purple-500" />;
        default: return <CheckSquare className="h-4 w-4 text-blue-500" />;
      }
    } else if (item.entityType === 'milestone') {
      return <CalendarCheck className="h-4 w-4 text-indigo-500" />;
    } else if (item.entityType === 'epic') {
      return <Star className="h-4 w-4 text-purple-500" />;
    } else if (item.entityType === 'story') {
      return <BookOpen className="h-4 w-4 text-blue-500" />;
    }

    return null;
  };

  const renderTypeBadge = (item: BoardItem) => {
    const typeColors: Record<string, string> = {
      "TASK": "text-blue-500",
      "BUG": "text-red-500", 
      "FEATURE": "text-green-500",
      "IMPROVEMENT": "text-purple-500",
      "MILESTONE": "text-indigo-500",
      "EPIC": "text-purple-500",
      "STORY": "text-blue-500",
    };

    const displayType = item.entityType !== 'task' 
      ? item.entityType.toUpperCase() 
      : item.type?.toUpperCase() || 'TASK';

    return (
      <div className="flex items-center gap-1.5">
        <div className={typeColors[displayType] || "text-gray-500"}>
          {renderTypeIcon(item)}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {displayType}
        </span>
      </div>
    );
  };

  useEffect(() => {
    if (boardData?.allItems) {
      let items = [...boardData.allItems] as BoardItem[];

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        items = items.filter(item =>
          item.title.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term)
        );
      }

      // Apply type filter
      if (selectedTypes.length > 0) {
        items = items.filter(item => {
          if (item.entityType === 'task') {
            return selectedTypes.includes(item.type as ItemType);
          } else {
            return selectedTypes.includes(item.entityType.toUpperCase() as ItemType);
          }
        });
      }

      // Apply label filter
      if (selectedLabels.length > 0) {
        items = items.filter(item => {
          return item.labels && item.labels.some((label: any) => selectedLabels.includes(label.id));
        });
      }

      // Apply status filter
      if (selectedStatuses.length > 0) {
        items = items.filter(item => {
          const itemStatus = item.column?.name || (item as any).status || "New";
          return selectedStatuses.includes(itemStatus);
        });
      }

      // Apply sorting
      items.sort((a, b) => {
        let valueA, valueB;

        switch (sortField) {
          case 'title':
            valueA = a.title;
            valueB = b.title;
            break;
          case 'status':
            valueA = a.column?.name || '';
            valueB = b.column?.name || '';
            break;
          case 'priority':
            valueA = a.priority || 'low';
            valueB = b.priority || 'low';
            break;
          case 'id':
            valueA = a.id;
            valueB = b.id;
            break;
          default:
            valueA = a.title;
            valueB = b.title;
        }

        if (sortDirection === 'asc') {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });

      setFilteredItems(items);
    }
  }, [boardData, searchTerm, selectedTypes, selectedLabels, selectedStatuses, sortField, sortDirection]);

  const groups = getGroups(filteredItems);

  const handleSort = (field: SortOption, direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleItemClick = (item: BoardItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col pt-4">
        <div className="flex-none mb-4 opacity-50 pointer-events-none">
          <KanbanFilters
            onSearchChange={() => { }}
            onTypeFilter={() => { }}
            onLabelFilter={() => { }}
            onStatusFilter={() => { }}
            onGroupingChange={() => { }}
            selectedGrouping="none"
            selectedTypes={[]}
            selectedLabels={[]}
            selectedStatuses={[]}
            onSortChange={() => { }}
            selectedSort="title"
            sortDirection="asc"
            showSortOptions={true}
            showStatusFilter={true}
            availableStatuses={[]}
            workspaceId={currentWorkspace?.id || ""}
          />
        </div>

        <div className="border rounded-md shadow-sm bg-card flex items-center justify-center p-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">Loading items...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!filteredItems || filteredItems.length === 0) {
    return (
      <div className="flex flex-col pt-4">
        <div className="flex-none mb-4">
          <KanbanFilters
            onSearchChange={setSearchTerm}
            onTypeFilter={setSelectedTypes}
            onLabelFilter={setSelectedLabels}
            onStatusFilter={setSelectedStatuses}
            onGroupingChange={groupBy => setGroupBy(groupBy)}
            selectedGrouping={groupBy}
            selectedTypes={selectedTypes}
            selectedLabels={selectedLabels}
            selectedStatuses={selectedStatuses}
            onSortChange={handleSort}
            selectedSort={sortField}
            sortDirection={sortDirection}
            showSortOptions={true}
            showStatusFilter={true}
            availableStatuses={availableStatuses}
            workspaceId={currentWorkspace?.id || ""}
          />
        </div>

        <div className="border rounded-md shadow-sm bg-card flex items-center justify-center p-12">
          <div className="text-center p-8">
            <h3 className="text-xl font-medium mb-2">No items found</h3>
            <p className="text-muted-foreground">
              {selectedTypes.length > 0 || searchTerm
                ? "Try adjusting your filters"
                : "Create your first item to get started"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col pt-4">
        <div className="flex-none mb-4">
          <KanbanFilters
            onSearchChange={setSearchTerm}
            onTypeFilter={setSelectedTypes}
            onLabelFilter={setSelectedLabels}
            onStatusFilter={setSelectedStatuses}
            onGroupingChange={groupBy => setGroupBy(groupBy)}
            selectedGrouping={groupBy}
            selectedTypes={selectedTypes}
            selectedLabels={selectedLabels}
            selectedStatuses={selectedStatuses}
            onSortChange={handleSort}
            selectedSort={sortField}
            sortDirection={sortDirection}
            showSortOptions={true}
            showStatusFilter={true}
            availableStatuses={availableStatuses}
            workspaceId={currentWorkspace?.id || ""}
          />
        </div>

        <div className="border rounded-md shadow-sm bg-card relative">
          <Table>
            <TableHeader className="bg-card/95 backdrop-blur-sm sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
              <TableRow>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[70px]">ID</TableHead>
                <TableHead className="w-[280px]">Title</TableHead>
                <TableHead className="w-[120px]">Labels</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[120px]">Parent</TableHead>
                <TableHead className="w-[80px]">Stats</TableHead>
                <TableHead className="w-[80px]">Priority</TableHead>
                <TableHead className="w-[120px]">Assignee</TableHead>
                <TableHead className="w-[120px]">Reporter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <React.Fragment key={group.id}>
                  {groupBy !== 'none' && (
                    <TableRow 
                      className="bg-muted/50 hover:bg-muted/70 border-b-2 cursor-pointer"
                      onClick={() => toggleGroup(group.id)}
                    >
                      <TableCell colSpan={10} className="py-3">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            {collapsedGroups[group.id] ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            {group.icon}
                            <span className="font-medium text-sm">
                              {group.name}
                            </span>
                            <Badge variant="secondary" className="ml-2">
                              {group.items.length}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {(!collapsedGroups[group.id] || groupBy === 'none') && group.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors border-b last:border-0"
                      onClick={() => handleItemClick(item)}
                    >
                      <TableCell>
                        {renderTypeBadge(item)}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-muted-foreground">
                        {item.issueKey || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium line-clamp-2 hover:text-primary">
                          {item.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.labels && item.labels.length > 0 ? (
                            item.labels.map((label: any) => (
                              <Badge
                                key={label.id}
                                variant="outline"
                                className="text-xs"
                                style={{
                                  borderColor: label.color,
                                  color: label.color,
                                }}
                              >
                                {label.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.status || item.column?.name || "New"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.entityType === 'epic' && item.milestone && (
                          <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                            {item.milestone.title}
                          </Badge>
                        )}
                        {item.entityType === 'story' && item.epic && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {item.epic.title}
                          </Badge>
                        )}
                        {item.entityType === 'task' && item.epic && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {item.epic.title}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {item.entityType === 'milestone' && item._count?.epics !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {item._count.epics} epics
                            </Badge>
                          )}
                          {item.entityType === 'epic' && item._count?.stories !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {item._count.stories} stories
                            </Badge>
                          )}
                          {item.entityType === 'story' && item._count?.tasks !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {item._count.tasks} tasks
                            </Badge>
                          )}
                          {item.entityType === 'task' && item._count?.comments !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {item._count.comments} comments
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.entityType === 'task' && item.priority && (
                          <Badge
                            variant="outline"
                            className={
                              item.priority === "high"
                                ? "border-red-500 text-red-500"
                                : item.priority === "medium"
                                  ? "border-amber-500 text-amber-500"
                                  : "border-blue-500 text-blue-500"
                            }
                          >
                            {item.priority}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.assignee ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={item.assignee.image || undefined} alt={item.assignee.name || ""} />
                              <AvatarFallback>{item.assignee.name?.substring(0, 2) || "U"}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{item.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.reporter ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={item.reporter.image || undefined} alt={item.reporter.name || ""} />
                              <AvatarFallback>{item.reporter.name?.substring(0, 2) || "U"}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{item.reporter.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedItem && (
        <TaskModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedItem(null);
          }}
          taskId={selectedItem.id}
          type={selectedItem.entityType}
        />
      )}
    </>
  );
} 