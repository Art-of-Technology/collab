"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotificationsList,
} from "@/hooks/queries/useNotifications";
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
  const [selectedCategory, setSelectedCategory] = useState<string>("inbox");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  
  // Fetch notifications via unified hook
  const { data: notifications = [], isLoading } = useNotificationsList(
    currentWorkspace?.id || "",
    { refetchInterval: 30000, staleTime: 10000, cacheTime: 5 * 60 * 1000 }
  );

  // Mutations
  const markNotificationAsReadMutation = useMarkNotificationAsRead();
  const markAllNotificationsAsReadMutation = useMarkAllNotificationsAsRead();
  
  // Filter logic with memoization for better performance
  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];
    // Apply category filter
    if (selectedCategory && selectedCategory !== "inbox") {
      filtered = filtered.filter(notification => {
        switch (selectedCategory) {
          case "mentioned":
            return notification.type?.toLowerCase().includes("mention");
          case "task-related":
            return notification.type?.toLowerCase().startsWith("task_");
          case "board-related":
            return notification.type?.toLowerCase().startsWith("board_");
          case "team-mentions":
            return notification.type?.toLowerCase().includes("team_");
          default:
            return true;
        }
      });
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
  }, [notifications, selectedCategory, selectedWorkspace, quickFilter, searchQuery]);
  
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };
  
  const handleMarkAllAsRead = async () => {
    try {
      if (currentWorkspace?.id) {
        await markAllNotificationsAsReadMutation.mutateAsync(currentWorkspace.id);
      }
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
        selectedIds.map(id => markNotificationAsReadMutation.mutateAsync(id))
      );
      
      // Clear selection after marking as read
      setSelectedNotifications(new Set());
    } catch (error) {
      console.error("Failed to mark selected as read:", error);
    }
  };

  // Unread count derived locally from fetched list
  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  return (
    <div className="flex">
      {/* Left Sidebar - Filters */}
      <div className="w-64 border-r border-border/50">
        <NotificationsSidebar
          selectedCategory={selectedCategory}
          selectedWorkspace={selectedWorkspace}
          onCategoryChange={handleCategoryChange}
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
            onMarkAsRead={(id) => markNotificationAsReadMutation.mutateAsync(id)}
          />
        </div>
      </div>
    </div>
  );
}