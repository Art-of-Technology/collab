"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import React, { useMemo, useRef } from 'react';
import { Notification } from "@/context/MentionContext";
import { CollabText } from "@/components/ui/collab-text";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface VirtualNotificationsListProps {
  notifications: Notification[];
  groupBy: "date" | "user" | "project";
  selectedNotifications: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onNotificationClick: (notification: Notification, e: React.MouseEvent) => void;
  onSelectAll: () => void;
  isLoading?: boolean;
}

type GroupedNotifications = Record<string, Notification[]>;

interface VirtualItem {
  type: 'group-header' | 'notification';
  groupKey?: string;
  notification?: Notification;
  groupNotifications?: Notification[];
  isExpanded?: boolean;
}

export default function VirtualNotificationsList({
  notifications,
  groupBy,
  selectedNotifications,
  onSelectionChange,
  onNotificationClick,
  onSelectAll,
  isLoading = false,
}: VirtualNotificationsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  
  const groupNotifications = React.useCallback((notifications: Notification[]): GroupedNotifications => {
    const grouped: GroupedNotifications = {};
    
    notifications.forEach(notification => {
      let groupKey: string;
      
      switch (groupBy) {
        case "date":
          const date = new Date(notification.createdAt);
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          
          if (date.toDateString() === today.toDateString()) {
            groupKey = "Today";
          } else if (date.toDateString() === yesterday.toDateString()) {
            groupKey = "Yesterday";
          } else {
            groupKey = date.toLocaleDateString();
          }
          break;
          
        case "user":
          groupKey = notification.sender?.name || "System";
          break;
          
        case "project": {
          const t = notification.type?.toLowerCase() || "";
          if (notification.issue?.project?.name) {
            groupKey = notification.issue.project.name;
          } else if (t.startsWith("project_") || t.includes("project") || t.startsWith("board_")) {
            groupKey = "Project Activity";
          } else {
            groupKey = "General";
          }
          break;
        default:
          groupKey = "All";
          break;
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(notification);
    });
    
    return grouped;
  }, [groupBy]);

  // Calculate all group keys to initialize as expanded by default
  const allGroupKeys = useMemo(() => {
    const groupedNotifications = groupNotifications(notifications);
    return new Set(Object.keys(groupedNotifications));
  }, [notifications, groupNotifications]);
  
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(allGroupKeys);

  // Update expanded groups when new groups are created
  React.useEffect(() => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      allGroupKeys.forEach(key => newSet.add(key));
      return newSet;
    });
  }, [allGroupKeys]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };


  const handleCheckboxChange = (notificationId: string, checked: boolean) => {
    const newSelected = new Set(selectedNotifications);
    if (checked) {
      newSelected.add(notificationId);
    } else {
      newSelected.delete(notificationId);
    }
    onSelectionChange(newSelected);
  };

  // Create virtual items for rendering
  const virtualItems = useMemo(() => {
    const groupedNotifications = groupNotifications(notifications);
    const sortedGroupKeys = Object.keys(groupedNotifications).sort((a, b) => {
      // Sort by date for date grouping, alphabetically for others
      if (groupBy === 'date') {
        const dateA = new Date(groupedNotifications[a][0]?.createdAt || 0);
        const dateB = new Date(groupedNotifications[b][0]?.createdAt || 0);
        return dateB.getTime() - dateA.getTime();
      }
      return a.localeCompare(b);
    });

    const items: VirtualItem[] = [];

    // Add select all header if there are notifications
    if (notifications.length > 0) {
      items.push({
        type: 'group-header',
        groupKey: 'select-all',
        groupNotifications: notifications,
        isExpanded: true
      });
    }

    // Add group headers and notifications
    sortedGroupKeys.forEach(groupKey => {
      const groupNotifications = groupedNotifications[groupKey];
      const isExpanded = expandedGroups.has(groupKey);
      
      // Add group header
      items.push({
        type: 'group-header',
        groupKey,
        groupNotifications,
        isExpanded
      });
      
      // Add notifications if group is expanded
      if (isExpanded) {
        groupNotifications
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .forEach(notification => {
            items.push({
              type: 'notification',
              notification
            });
          });
      }
    });

    return items;
  }, [notifications, groupBy, expandedGroups, groupNotifications]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = virtualItems[index];
      if (item.type === 'group-header') {
        return item.groupKey === 'select-all' ? 40 : 36;
      }
      return 56;
    },
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = virtualItems[virtualItem.index];
          
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {item.type === 'group-header' ? (
                item.groupKey === 'select-all' ? (
                  // Select all header
                  <div className="block sticky top-0 bg-background border-b border-border/50 px-3 md:px-4 py-2 z-10">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedNotifications.size === notifications.length && notifications.length > 0}
                        onCheckedChange={() => onSelectAll()}
                        className="w-4 h-4 self-center"
                        data-checkbox
                      />
                      <span className="text-sm text-muted-foreground">
                        {selectedNotifications.size > 0 ? `${selectedNotifications.size} selected` : 'Select all'}
                      </span>
                    </div>
                  </div>
                ) : (
                  // Group header
                  <div className="px-3 md:px-4 py-1.5 bg-muted/30">
                    <button
                      onClick={() => toggleGroup(item.groupKey!)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <h3 className="text-xs md:text-sm font-medium text-muted-foreground truncate">
                        {item.groupKey} ({item.groupNotifications!.length})
                      </h3>
                      <span className="text-muted-foreground">
                        {item.isExpanded ? '−' : '+'}
                      </span>
                    </button>
                  </div>
                )
              ) : (
                // Notification item
                <div
                  className={cn(
                    "flex gap-3 md:gap-3 items-center px-3 md:px-4 py-2 hover:bg-muted/30 cursor-pointer border-l-2 transition-colors",
                    item.notification!.read 
                      ? "border-l-transparent" 
                      : "border-l-primary bg-primary/5"
                  )}
                  onClick={(e) => onNotificationClick(item.notification!, e)}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedNotifications.has(item.notification!.id)}
                    onCheckedChange={(checked) => handleCheckboxChange(item.notification!.id, checked === true)}
                    className="w-4 h-4"
                    data-checkbox
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start gap-1.5">
                      <p className={cn(
                        "flex flex-row items-center gap-1.5 text-xs md:text-sm leading-relaxed flex-1",
                        item.notification!.read ? "text-muted-foreground" : "text-foreground"
                      )}>     
                        { (item.notification!.content || '').includes('@[') || (item.notification!.content || '').includes('#[') || /<[^>]+>/.test(item.notification!.content || "") ? (
                          <MarkdownContent htmlContent={item.notification!.content} className="inline text-xs md:text-sm" asSpan />
                        ) : (
                          <CollabText content={item.notification!.content} small asSpan />
                        )}
                      </p>
                      
                      {/* Time next to content */}
                      <span className="text-[11px] md:text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {formatDistanceToNow(new Date(item.notification!.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    
                    {/* Task/Post info */}
                    {(item.notification!.issueId || item.notification!.postId) && (
                    <div className="text-[11px] md:text-xs text-muted-foreground leading-none truncate">
                      {item.notification!.issue?.title ? `Issue ${item.notification!.issue?.title}` : `Post at Timeline`}
                    </div>
                  )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
