"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useMention, Notification } from "@/context/MentionContext";
import {
  Check,
  CheckCheck,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";
import NotificationsList from "./components/NotificationsList";
import NotificationsSidebar from "./components/NotificationsSidebar";

type QuickFilter = "all" | "unread";
type GroupBy = "date" | "user" | "taskboard";

export default function NotificationsClient() {
  const { currentWorkspace } = useWorkspace();
  
  // State for filters and search
  const [selectedCategory, setSelectedCategory] = useState<string>("inbox");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  
  const mobileCategories: { id: string; label: string }[] = [
    { id: "inbox", label: "Inbox" },
    { id: "mentioned", label: "Mentioned" },
    { id: "task-related", label: "Task notifications" },
    { id: "board-related", label: "Board notifications" },
  ];
  
  // Fetch notifications via unified hook
  const { notifications, unreadCount, loading: isLoading, markAllNotificationsAsRead, markNotificationAsRead } = useMention();
  
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
  }, [notifications, selectedCategory, quickFilter, searchQuery]);
  
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };
  
  const handleMarkAllAsRead = async () => {
    try {
      if (currentWorkspace?.id) {
        await markAllNotificationsAsRead();
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
        selectedIds.map(id => markNotificationAsRead(id))
      );
      
      // Clear selection after marking as read
      setSelectedNotifications(new Set());
    } catch (error) {
      console.error("Failed to mark selected as read:", error);
    }
  };

  return (
    <div className="flex">
      {/* Left Sidebar - Desktop */}
      <div className="hidden md:block w-64 border-r border-border/50">
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
          <div className="px-4 md:px-6 py-3 md:py-4">
            {/* Responsive controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Mobile category select */}
              <div className="md:hidden">
                <Select value={selectedCategory} onValueChange={(v) => handleCategoryChange(v)}>
                  <SelectTrigger className="w-44 h-9 text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {mobileCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search - takes up remaining space */}
              <div className="relative flex-1 min-w-[200px] order-2 md:order-none">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 md:h-8 text-sm border-border/50"
                />
              </div>

              {/* All/Unread buttons */}
              <div className="flex items-center gap-1 flex-shrink-0 order-3 md:order-none">
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

              {/* Group by selector */}
              <div className="hidden md:block order-4 md:order-none">
                <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                  <SelectTrigger className="w-36 md:w-32 h-8 text-sm flex-shrink-0">
                    <SelectValue placeholder="Group by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="taskboard">Task/Board</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk actions */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto order-5 md:order-none -mb-16 md:mb-0">
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
                    className="inline-flex h-8 px-3 text-sm gap-2"
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
            onMarkAsRead={(id) => markNotificationAsRead(id)}
            onMarkAllRead={handleMarkAllAsRead}
            unreadCount={unreadCount}
          />
        </div>
      </div>
    </div>
  );
}