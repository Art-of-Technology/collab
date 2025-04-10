"use client";

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Loader2, CalendarCheck, Star, BookOpen, CheckSquare, Bug, Sparkles, TrendingUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTasks } from "@/context/TasksContext";
import { useBoardItems } from "@/hooks/queries/useBoardItems";
import KanbanFilters, { ItemType, GroupingOption, SortOption } from "./KanbanFilters";
import { useEffect, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";

// Task type definition based on what we're using in the component
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
  _count?: {
    comments?: number;
    attachments?: number;
    tasks?: number;
    epics?: number;
    stories?: number;
  }
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

  // Import and use the appropriate modal based on entity type
  switch (type) {
    case 'milestone':
      const MilestoneDetailModal = require("../milestones/MilestoneDetailModal").default;
      return <MilestoneDetailModal milestoneId={taskId} onClose={onClose} />;

    case 'epic':
      const EpicDetailModal = require("../epics/EpicDetailModal").default;
      return <EpicDetailModal epicId={taskId} onClose={onClose} />;

    case 'story':
      const StoryDetailModal = require("../stories/StoryDetailModal").default;
      return <StoryDetailModal storyId={taskId} onClose={onClose} />;

    case 'task':
    default:
      return <TaskDetailModal taskId={taskId} onClose={onClose} />;
  }
}

export default function ListView() {
  const { selectedBoardId } = useTasks();
  const { data: boardData, isLoading } = useBoardItems(selectedBoardId);
  const [filteredItems, setFilteredItems] = useState<BoardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([]);
  const [groupBy, setGroupBy] = useState<GroupingOption>("none");
  const [sortField, setSortField] = useState<SortOption>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

      // Apply sorting
      items.sort((a, b) => {
        let valueA, valueB;

        // Handle different sort fields
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

        // Apply direction
        if (sortDirection === 'asc') {
          return valueA > valueB ? 1 : -1;
        } else {
          return valueA < valueB ? 1 : -1;
        }
      });

      setFilteredItems(items);
    }
  }, [boardData, searchTerm, selectedTypes, sortField, sortDirection]);

  const handleSort = (field: SortOption, direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
  };

  const handleItemClick = (item: BoardItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
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

  if (isLoading) {
    return (
      <div className="flex flex-col pt-4">
        <div className="flex-none mb-4 opacity-50 pointer-events-none">
          <KanbanFilters
            onSearchChange={() => {}}
            onTypeFilter={() => {}}
            onGroupingChange={() => {}}
            selectedGrouping="none"
            selectedTypes={[]}
            onSortChange={() => {}}
            selectedSort="title"
            sortDirection="asc"
            showSortOptions={true}
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
            onGroupingChange={groupBy => setGroupBy(groupBy)}
            selectedGrouping={groupBy}
            selectedTypes={selectedTypes}
            onSortChange={handleSort}
            selectedSort={sortField}
            sortDirection={sortDirection}
            showSortOptions={true}
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
            onGroupingChange={groupBy => setGroupBy(groupBy)}
            selectedGrouping={groupBy}
            selectedTypes={selectedTypes}
            onSortChange={handleSort}
            selectedSort={sortField}
            sortDirection={sortDirection}
            showSortOptions={true}
          />
        </div>
        
        <div className="border rounded-md shadow-sm bg-card relative">
          <Table>
            <TableHeader className="bg-card/95 backdrop-blur-sm sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
              <TableRow>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead className="w-[340px]">Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Stats</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow 
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors border-b last:border-0"
                  onClick={() => handleItemClick(item)}
                >
                  <TableCell>
                    <div className="flex items-center justify-center">
                      {renderTypeIcon(item)}
                    </div>
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
                </TableRow>
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