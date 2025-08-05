"use client";

import { useState, useMemo, useRef, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { 
  MessageSquare, 
  ArrowRight,
  Calendar,
  Plus,
  MoreHorizontal,
  User,
  Filter,
  Settings,
  Loader2,
  Edit3,
  Trash2,
  GripVertical,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import ViewFilters from '@/components/views/shared/ViewFilters';

interface KanbanViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
  onIssueUpdate?: (issueId: string, updates: any) => void;
  onColumnUpdate?: (columnId: string, updates: any) => void;
  onCreateIssue?: (columnId: string, issueData: any) => void;
}

type FilterType = 'all' | 'active' | 'backlog';

interface Column {
  id: string;
  name: string;
  issues: any[];
  order: number;
  color?: string;
}

interface KanbanState {
  columns: Column[];
  filterType: FilterType;
  showSubIssues: boolean;
  isRightSidebarOpen: boolean;
}

export default function KanbanViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser,
  activeFilters,
  setActiveFilters,
  onIssueUpdate,
  onColumnUpdate,
  onCreateIssue
}: KanbanViewRendererProps) {
  const { toast } = useToast();
  const isDraggingRef = useRef(false);
  
  // State management
  const [kanbanState, setKanbanState] = useState<KanbanState>({
    columns: [],
    filterType: 'all',
    showSubIssues: true,
    isRightSidebarOpen: true
  });
  
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [isCreatingIssue, setIsCreatingIssue] = useState<string | null>(null);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<{
    assignees: string[];
    labels: string[];
    priority: string[];
    projects: string[];
  }>({
    assignees: [],
    labels: [],
    priority: [],
    projects: []
  });

  // Filter issues based on type (all/active/backlog) and selected filters
  const filteredIssues = useMemo(() => {
    let filtered = [...issues];
    
    // Apply type filtering (all/active/backlog)
    switch (kanbanState.filterType) {
      case 'active':
        filtered = filtered.filter(issue => 
          issue.status !== 'Done' && 
          issue.status !== 'Backlog' && 
          issue.status !== 'Cancelled'
        );
        break;
      case 'backlog':
        filtered = filtered.filter(issue => 
          issue.status === 'Backlog' || 
          issue.status === 'Todo'
        );
        break;
      default:
        // 'all' - no filtering
        break;
    }
    
    // Apply assignee filters
    if (selectedFilters.assignees.length > 0) {
      filtered = filtered.filter(issue => {
        const assigneeId = issue.assignee?.id || 'unassigned';
        return selectedFilters.assignees.includes(assigneeId);
      });
    }
    
    // Apply label filters
    if (selectedFilters.labels.length > 0) {
      filtered = filtered.filter(issue => {
        if (!issue.labels || issue.labels.length === 0) {
          return selectedFilters.labels.includes('no-labels');
        }
        return issue.labels.some((label: any) => 
          selectedFilters.labels.includes(label.id)
        );
      });
    }
    
    // Apply priority filters
    if (selectedFilters.priority.length > 0) {
      filtered = filtered.filter(issue => {
        const priority = issue.priority || 'no-priority';
        return selectedFilters.priority.includes(priority);
      });
    }
    
    // Apply project filters
    if (selectedFilters.projects.length > 0) {
      filtered = filtered.filter(issue => {
        const projectId = issue.project?.id || 'no-project';
        return selectedFilters.projects.includes(projectId);
      });
    }
    
    return filtered;
  }, [issues, kanbanState.filterType, selectedFilters]);

  // Group issues by the specified field (default to status)
  const columns = useMemo(() => {
    const groupField = view.grouping?.field || 'status';
    const columnsMap = new Map();
    
    // Define default columns based on grouping field
    let defaultColumns: string[] = [];
    switch (groupField) {
      case 'status':
        defaultColumns = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'];
        break;
      case 'priority':
        defaultColumns = ['Urgent', 'High', 'Medium', 'Low'];
        break;
      case 'type':
        defaultColumns = ['Epic', 'Story', 'Task', 'Defect', 'Milestone', 'Subtask'];
        break;
      case 'assignee':
        // Dynamic assignee columns will be created based on issues
        break;
      default:
        defaultColumns = ['Todo', 'In Progress', 'Done'];
    }
    
    // Initialize default columns
    defaultColumns.forEach((column, index) => {
      columnsMap.set(column, {
        id: column.toLowerCase().replace(/\s+/g, '-'),
        name: column,
        issues: [],
        order: index
      });
    });

    // Group filtered issues
    filteredIssues.forEach((issue: any) => {
      let groupValue: string;
      
      switch (groupField) {
        case 'status':
          groupValue = issue.status || 'Todo';
          break;
        case 'priority':
          groupValue = issue.priority === 'URGENT' ? 'Urgent' :
                      issue.priority === 'HIGH' ? 'High' :
                      issue.priority === 'MEDIUM' ? 'Medium' :
                      issue.priority === 'LOW' ? 'Low' :
                      'Medium';
          break;
        case 'assignee':
          groupValue = issue.assignee?.name || 'Unassigned';
          break;
        case 'type':
          groupValue = issue.type === 'EPIC' ? 'Epic' : 
                      issue.type === 'STORY' ? 'Story' :
                      issue.type === 'TASK' ? 'Task' :
                      issue.type === 'DEFECT' ? 'Defect' :
                      issue.type === 'MILESTONE' ? 'Milestone' :
                      issue.type === 'SUBTASK' ? 'Subtask' :
                      'Task';
          break;
        default:
          groupValue = issue.status || 'Todo';
      }
      
      if (!columnsMap.has(groupValue)) {
        const newId = groupValue.toLowerCase().replace(/\s+/g, '-');
        columnsMap.set(groupValue, {
          id: newId,
          name: groupValue,
          issues: [],
          order: columnsMap.size
        });
      }
      
      const column = columnsMap.get(groupValue);
      if (column) {
        column.issues.push(issue);
      }
    });

    return Array.from(columnsMap.values()).sort((a, b) => a.order - b.order);
  }, [filteredIssues, view.grouping]);

  // Drag and drop handlers
  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    isDraggingRef.current = false;
    const { destination, source, draggableId, type } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    if (type === 'column') {
      // Handle column reordering
      const newColumns = Array.from(columns);
      const [reorderedColumn] = newColumns.splice(source.index, 1);
      newColumns.splice(destination.index, 0, reorderedColumn);
      
      // Update column orders
      const updatedColumns = newColumns.map((col, index) => ({
        ...col,
        order: index
      }));
      
      if (onColumnUpdate) {
        updatedColumns.forEach(col => {
          onColumnUpdate(col.id, { order: col.order });
        });
      }
      
      return;
    }

    if (type === 'issue') {
      // Handle issue moving between columns
      const sourceColumnIndex = columns.findIndex(col => col.id === source.droppableId);
      const destColumnIndex = columns.findIndex(col => col.id === destination.droppableId);
      
      if (sourceColumnIndex === -1 || destColumnIndex === -1) return;
      
      const sourceColumn = columns[sourceColumnIndex];
      const destColumn = columns[destColumnIndex];
      const issueToMove = sourceColumn.issues.find((issue: any) => issue.id === draggableId);
      
      if (!issueToMove) return;
      
      // Update issue status based on destination column
      const newStatus = destColumn.name;
      
      if (onIssueUpdate) {
        await onIssueUpdate(draggableId, {
          status: newStatus,
          columnId: destination.droppableId
        });
      }
      
      toast({
        title: "Issue moved",
        description: `${issueToMove.title} moved to ${newStatus}`
      });
    }
  }, [columns, onIssueUpdate, onColumnUpdate, toast]);

  // Issue handlers
  const handleIssueClick = useCallback((issueId: string) => {
    setSelectedIssueId(issueId);
  }, []);

  const handleCreateIssue = useCallback(async (columnId: string) => {
    if (!newIssueTitle.trim()) return;
    
    const column = columns.find(col => col.id === columnId);
    if (!column) return;
    
    const issueData = {
      title: newIssueTitle,
      status: column.name,
      columnId: columnId,
      type: 'TASK'
    };
    
    if (onCreateIssue) {
      await onCreateIssue(columnId, issueData);
    }
    
    setNewIssueTitle('');
    setIsCreatingIssue(null);
    
    toast({
      title: "Issue created",
      description: `${newIssueTitle} created in ${column.name}`
    });
  }, [newIssueTitle, columns, onCreateIssue, toast]);

  // Column handlers
  const handleColumnEdit = useCallback((columnId: string, name: string) => {
    if (onColumnUpdate) {
      onColumnUpdate(columnId, { name });
    }
    setEditingColumnId(null);
    setNewColumnName('');
  }, [onColumnUpdate]);



  const getColumnColor = (columnName: string, groupField: string) => {
    switch (groupField) {
      case 'status':
        switch (columnName.toLowerCase()) {
          case 'backlog': return 'border-gray-600';
          case 'todo': return 'border-gray-600';
          case 'in progress': return 'border-blue-500';
          case 'in review': return 'border-purple-500';
          case 'done': return 'border-green-500';
          default: return 'border-gray-600';
        }
      case 'priority':
        switch (columnName.toLowerCase()) {
          case 'urgent': return 'border-red-500';
          case 'high': return 'border-orange-500';
          case 'medium': return 'border-yellow-500';
          case 'low': return 'border-green-500';
          default: return 'border-gray-600';
        }
      case 'type':
        switch (columnName.toLowerCase()) {
          case 'epic': return 'border-purple-500';
          case 'story': return 'border-blue-500';
          case 'task': return 'border-green-500';
          case 'defect': return 'border-red-500';
          case 'milestone': return 'border-indigo-500';
          case 'subtask': return 'border-cyan-500';
          default: return 'border-gray-600';
        }
      default:
        return 'border-gray-600';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'border-l-red-500';
      case 'HIGH': return 'border-l-orange-500';
      case 'MEDIUM': return 'border-l-yellow-500';
      case 'LOW': return 'border-l-green-500';
      default: return 'border-l-gray-600';
    }
  };

  const displayProperties = view.fields || ['Priority', 'Status', 'Assignee'];

  // Count issues for filter buttons
  const allIssuesCount = issues.length;
  const activeIssuesCount = issues.filter(issue => 
    issue.status !== 'Done' && 
    issue.status !== 'Backlog' && 
    issue.status !== 'Cancelled'
  ).length;
  const backlogIssuesCount = issues.filter(issue => 
    issue.status === 'Backlog' || 
    issue.status === 'Todo'
  ).length;

  return (
    <div className="h-full bg-[#101011] flex">
      {/* Main Kanban Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#101011] border-b border-[#1f1f1f] px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Title and Filter Buttons */}
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold text-white">Board</h1>
              
              <div className="flex items-center gap-1">
                <Button
                  variant={kanbanState.filterType === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setKanbanState(prev => ({ ...prev, filterType: 'all' }))}
                  className="h-7 px-2 text-xs"
                >
                  All Issues
                  <span className="ml-1 text-xs opacity-70">{allIssuesCount}</span>
                </Button>
                <Button
                  variant={kanbanState.filterType === 'active' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setKanbanState(prev => ({ ...prev, filterType: 'active' }))}
                  className="h-7 px-2 text-xs"
                >
                  Active
                  <span className="ml-1 text-xs opacity-70">{activeIssuesCount}</span>
                </Button>
                <Button
                  variant={kanbanState.filterType === 'backlog' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setKanbanState(prev => ({ ...prev, filterType: 'backlog' }))}
                  className="h-7 px-2 text-xs"
                >
                  Backlog
                  <span className="ml-1 text-xs opacity-70">{backlogIssuesCount}</span>
                </Button>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setKanbanState(prev => ({ 
                  ...prev, 
                  isRightSidebarOpen: !prev.isRightSidebarOpen 
                }))}
                className="h-7 px-2 text-xs"
              >
                {kanbanState.isRightSidebarOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="ml-1">Filters</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="p-6">
          {issues.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-[#999]">
              <div className="text-center">
                <Plus className="h-12 w-12 mx-auto mb-4 text-[#666]" />
                <p className="text-base">No issues found in this board</p>
                <p className="text-sm text-[#666] mt-1">
                  Create a new issue or adjust your filters
                </p>
              </div>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
              <Droppable droppableId="board" direction="horizontal" type="column">
                {(provided) => (
                  <div
                    className="flex gap-6 h-full overflow-x-auto"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {columns.map((column, index) => (
                      <Draggable key={column.id} draggableId={column.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "flex-shrink-0 w-80 flex flex-col",
                              snapshot.isDragging && "rotate-2 shadow-lg"
                            )}
                          >
                            {/* Column Header */}
                            <div 
                              {...provided.dragHandleProps}
                              className={cn(
                                "flex items-center justify-between p-4 border-b-2 mb-4 cursor-grab active:cursor-grabbing",
                                getColumnColor(column.name, view.grouping?.field || 'status')
                              )}
                            >
                              <div className="flex items-center gap-3">
                                {editingColumnId === column.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={newColumnName}
                                      onChange={(e) => setNewColumnName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleColumnEdit(column.id, newColumnName);
                                        } else if (e.key === 'Escape') {
                                          setEditingColumnId(null);
                                          setNewColumnName('');
                                        }
                                      }}
                                      className="h-8 text-sm"
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleColumnEdit(column.id, newColumnName)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingColumnId(null);
                                        setNewColumnName('');
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <GripVertical className="h-4 w-4 text-[#666]" />
                                    <h3 
                                      className="font-medium text-white cursor-pointer hover:text-[#0969da]"
                                      onDoubleClick={() => {
                                        setEditingColumnId(column.id);
                                        setNewColumnName(column.name);
                                      }}
                                    >
                                      {column.name}
                                    </h3>
                                    <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                                      {column.issues.length}
                                    </Badge>
                                  </>
                                )}
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-6 w-6 text-[#666] hover:text-white"
                                onClick={() => setIsCreatingIssue(column.id)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Column Content */}
                            <Droppable droppableId={column.id} type="issue">
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  className={cn(
                                    "flex-1 space-y-3 min-h-[200px] rounded-lg transition-colors",
                                    snapshot.isDraggingOver && "bg-[#1a1a1a]"
                                  )}
                                >
                                  {/* Create Issue Input */}
                                  {isCreatingIssue === column.id && (
                                    <div className="p-3 bg-[#1f1f1f] rounded-lg border border-[#2a2a2a]">
                                      <Input
                                        value={newIssueTitle}
                                        onChange={(e) => setNewIssueTitle(e.target.value)}
                                        placeholder="Issue title..."
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            handleCreateIssue(column.id);
                                          } else if (e.key === 'Escape') {
                                            setIsCreatingIssue(null);
                                            setNewIssueTitle('');
                                          }
                                        }}
                                        className="mb-2"
                                        autoFocus
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => handleCreateIssue(column.id)}
                                          disabled={!newIssueTitle.trim()}
                                        >
                                          Create
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setIsCreatingIssue(null);
                                            setNewIssueTitle('');
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Issues */}
                                  {column.issues.map((issue: any, index: number) => (
                                    <Draggable key={issue.id} draggableId={issue.id} index={index}>
                                      {(provided, snapshot) => (
                                        <div
                                          ref={provided.innerRef}
                                          {...provided.draggableProps}
                                          {...provided.dragHandleProps}
                                          className={cn(
                                            "group p-4 bg-[#090909] border border-[#1f1f1f] rounded-lg hover:border-[#2a2a2a] transition-all duration-200 cursor-pointer border-l-2",
                                            getPriorityColor(issue.priority),
                                            snapshot.isDragging && "rotate-2 shadow-lg scale-105 bg-[#0f0f0f]"
                                          )}
                                          onClick={() => handleIssueClick(issue.id)}
                                        >
                                          {/* Issue Header */}
                                          <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Badge 
                                                variant="outline" 
                                                className="text-xs font-mono border-[#2a2a2a] text-[#999]"
                                              >
                                                {issue.issueKey}
                                              </Badge>
                                              <Badge 
                                                variant="secondary" 
                                                className={cn(
                                                  "text-xs capitalize",
                                                  issue.type === 'EPIC' && "bg-purple-500/10 text-purple-400",
                                                  issue.type === 'STORY' && "bg-blue-500/10 text-blue-400",
                                                  issue.type === 'TASK' && "bg-green-500/10 text-green-400",
                                                  issue.type === 'DEFECT' && "bg-red-500/10 text-red-400"
                                                )}
                                              >
                                                {issue.type === 'EPIC' ? 'Epic' : 
                                                 issue.type === 'STORY' ? 'Story' :
                                                 issue.type === 'TASK' ? 'Task' :
                                                 issue.type === 'DEFECT' ? 'Defect' :
                                                 issue.type === 'MILESTONE' ? 'Milestone' :
                                                 issue.type === 'SUBTASK' ? 'Subtask' :
                                                 issue.type?.toLowerCase()}
                                              </Badge>
                                            </div>
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#666] hover:text-white transition-opacity"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                // Handle more options
                                              }}
                                            >
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </div>

                                          {/* Issue Title */}
                                          <h4 className="text-white font-medium text-sm mb-2 line-clamp-2 group-hover:text-[#0969da] transition-colors">
                                            {issue.title}
                                          </h4>

                                          {/* Issue Description */}
                                          {issue.description && (
                                            <p className="text-[#666] text-xs mb-3 line-clamp-2">
                                              {issue.description}
                                            </p>
                                          )}

                                          {/* Meta Info and Assignee */}
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              {/* Meta Info */}
                                              <div className="flex items-center gap-2 text-[#666]">
                                                {issue._count?.comments > 0 && (
                                                  <div className="flex items-center gap-1">
                                                    <MessageSquare className="h-3 w-3" />
                                                    <span className="text-xs">{issue._count.comments}</span>
                                                  </div>
                                                )}
                                                
                                                {issue._count?.children > 0 && (
                                                  <div className="flex items-center gap-1">
                                                    <ArrowRight className="h-3 w-3" />
                                                    <span className="text-xs">{issue._count.children}</span>
                                                  </div>
                                                )}

                                                {displayProperties.includes('Due Date') && issue.dueDate && (
                                                  <div className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    <span className="text-xs">
                                                      {new Date(issue.dueDate).toLocaleDateString('en-US', { 
                                                        month: 'short', 
                                                        day: 'numeric' 
                                                      })}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            {/* Assignee */}
                                            {displayProperties.includes('Assignee') && (
                                              <div className="flex items-center">
                                                {issue.assignee ? (
                                                  <Avatar className="h-6 w-6">
                                                    <AvatarImage src={issue.assignee.image} />
                                                    <AvatarFallback className="text-xs bg-[#1f1f1f] text-[#999]">
                                                      {issue.assignee.name?.charAt(0)}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                ) : (
                                                  <div className="h-6 w-6 rounded-full bg-[#1f1f1f] flex items-center justify-center">
                                                    <User className="h-3 w-3 text-[#666]" />
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>

                                          {/* Additional Properties */}
                                          <div className="mt-3 flex items-center justify-between">
                                            {/* Priority (if enabled) */}
                                            {displayProperties.includes('Priority') && issue.priority && (
                                              <Badge 
                                                variant="outline" 
                                                className={cn(
                                                  "text-xs border-current/20 bg-current/10",
                                                  issue.priority === 'URGENT' && "text-red-400 border-red-400/20",
                                                  issue.priority === 'HIGH' && "text-orange-400 border-orange-400/20",
                                                  issue.priority === 'MEDIUM' && "text-yellow-400 border-yellow-400/20",
                                                  issue.priority === 'LOW' && "text-green-400 border-green-400/20"
                                                )}
                                              >
                                                {issue.priority === 'URGENT' ? 'Urgent' :
                                                 issue.priority === 'HIGH' ? 'High' :
                                                 issue.priority === 'MEDIUM' ? 'Medium' :
                                                 issue.priority === 'LOW' ? 'Low' :
                                                 issue.priority}
                                              </Badge>
                                            )}

                                            {/* Story Points (if enabled) */}
                                            {displayProperties.includes('Story Points') && issue.storyPoints && (
                                              <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                                                {issue.storyPoints} pts
                                              </Badge>
                                            )}
                                          </div>

                                          {/* Project Badge */}
                                          {issue.project && (
                                            <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
                                              <Badge 
                                                variant="outline" 
                                                className="text-xs border-current/20 bg-current/10"
                                                style={{ 
                                                  color: issue.project.color || '#6b7280',
                                                  borderColor: (issue.project.color || '#6b7280') + '40',
                                                }}
                                              >
                                                {issue.project.name}
                                              </Badge>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}

                                  {provided.placeholder}

                                  {/* Empty Column */}
                                  {column.issues.length === 0 && isCreatingIssue !== column.id && (
                                    <div 
                                      className="flex items-center justify-center h-32 text-[#666] border-2 border-dashed border-[#2a2a2a] rounded-lg hover:border-[#0969da] transition-colors cursor-pointer"
                                      onClick={() => setIsCreatingIssue(column.id)}
                                    >
                                      <div className="text-center">
                                        <Plus className="h-6 w-6 mx-auto mb-2 text-[#666]" />
                                        <p className="text-sm">Add first issue</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Droppable>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* View Filters Sidebar */}
      <ViewFilters
        issues={issues}
        workspace={workspace}
        isOpen={kanbanState.isRightSidebarOpen}
        onToggle={() => setKanbanState(prev => ({ 
          ...prev, 
          isRightSidebarOpen: !prev.isRightSidebarOpen 
        }))}
        selectedFilters={selectedFilters}
        onFiltersChange={setSelectedFilters}
        showSubIssues={kanbanState.showSubIssues}
        onSubIssuesToggle={() => setKanbanState(prev => ({ 
          ...prev, 
          showSubIssues: !prev.showSubIssues 
        }))}
        viewType="kanban"
      />

      {/* Issue Detail Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </div>
  );
}