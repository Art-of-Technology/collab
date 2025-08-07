"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useOptimizedNotifications } from "@/hooks/queries/useNotifications";
import {
  Check,
  CheckCheck,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";
import NotificationsList from "./components/NotificationsList";
import NotificationsSidebar from "./components/NotificationsSidebar";

type QuickFilter = "all" | "unread";
type GroupBy = "date" | "user" | "workspace" | "taskboard";

export default function NotificationsClient() {
  const { currentWorkspace } = useWorkspace();
  
  // State for filters and search
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  
  // Use optimized notifications hook
  const { 
    notifications, 
    unreadCount, 
    isLoading, 
    markAsRead, 
    markAllAsRead 
  } = useOptimizedNotifications({
    workspaceId: currentWorkspace?.id || "",
    refetchInterval: 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
  
  // Mutation hooks for marking notifications as read (fallback)
  
  // Filter logic with memoization for better performance
  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];
    
    // Apply category filters
    if (selectedFilters.length > 0) {
      filtered = filtered.filter(notification => {
        if (selectedFilters.includes("mentioned")) {
          return notification.type?.includes("MENTION") || notification.content?.includes("mentioned you");
        }
        if (selectedFilters.includes("task-related")) {
          return notification.type?.startsWith("TASK_");
        }
        if (selectedFilters.includes("board-related")) {
          return notification.type?.startsWith("BOARD_");
        }
        return false;
      });
    }
    
    // Apply workspace filter (if multi-workspace)
    if (selectedWorkspace !== "all") {
      filtered = filtered.filter(notification => notification.workspaceId === selectedWorkspace);
    }
    
    // Apply quick filter (all/unread)
    if (quickFilter === "unread") {
      filtered = filtered.filter(notification => !notification.read);
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(notification => 
        notification.content?.toLowerCase().includes(query) ||
        notification.sender?.name?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [notifications, selectedFilters, selectedWorkspace, quickFilter, searchQuery]);
  
  const handleFilterChange = (filterId: string, checked: boolean) => {
    setSelectedFilters(prev => 
      checked 
        ? [...prev, filterId]
        : prev.filter(id => id !== filterId)
    );
  };
  
  const handleMarkAllAsRead = async () => {
    try {
      // Use optimized hook function
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleSelectAll = () => {
    if (selectedNotifications.size === filteredNotifications.length) {
      setSelectedNotifications(new Set());
    } else {
      setSelectedNotifications(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const markSelectedAsRead = async () => {
    try {
      const selectedIds = Array.from(selectedNotifications);
      
      // Use optimized hook function for each notification
      await Promise.all(
        selectedIds.map(id => markAsRead(id))
      );
      
      // Clear selection after marking as read
      setSelectedNotifications(new Set());
    } catch (error) {
      console.error("Failed to mark selected as read:", error);
    }
  };

  return (
    <div className="flex">
      {/* Left Sidebar - Filters */}
      <div className="w-64 border-r border-border/50">
        <NotificationsSidebar
          selectedFilters={selectedFilters}
          selectedWorkspace={selectedWorkspace}
          onFilterChange={handleFilterChange}
          onWorkspaceChange={setSelectedWorkspace}
          workspaceId={currentWorkspace?.id || ""}
        />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-6 py-4">
            {/* Single row - All controls in same row */}
            <div className="flex items-center gap-3">
              {/* All/Unread buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant={quickFilter === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setQuickFilter("all")}
                  className="h-8 px-3 text-sm"
                >
                  All
                </Button>
                <Button
                  variant={quickFilter === "unread" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setQuickFilter("unread")}
                  className="h-8 px-3 text-sm gap-2"
                >
                  Unread
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-xs">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </div>
              
              {/* Search - takes up remaining space */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-8 text-sm border-border/50"
                />
              </div>
              
              {/* Group by selector */}
              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                <SelectTrigger className="w-32 h-8 text-sm flex-shrink-0">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="taskboard">Task/Board</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Bulk actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedNotifications.size > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={markSelectedAsRead}
                      className="h-8 px-3 text-sm gap-2"
                    >
                      <Check className="h-3 w-3" />
                      Mark as read
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      {selectedNotifications.size} selected
                    </div>
                  </>
                )}
                {unreadCount > 0 && selectedNotifications.size === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllAsRead}
                    className="h-8 px-3 text-sm gap-2"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Notifications List */}
        <div className="flex-1 overflow-hidden">
          <NotificationsList
            notifications={filteredNotifications}
            groupBy={groupBy}
            isLoading={isLoading}
            searchQuery={searchQuery}
            selectedNotifications={selectedNotifications}
            onSelectionChange={setSelectedNotifications}
            onSelectAll={handleSelectAll}
          />
        </div>
      </div>
    </div>
  );
}