"use client";

import React from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMention } from "@/context/MentionContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { cn } from "@/lib/utils";

function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationPopover() {
  const { notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead } = useMention();
  const { currentWorkspace } = useWorkspace();
  const workspaceBase = currentWorkspace
    ? `/${currentWorkspace.slug || currentWorkspace.id}`
    : "";

  const recentNotifications = (notifications || []).slice(0, 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-[#71717a] hover:text-white"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-red-500 border-0">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 glass-panel border-white/[0.08]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-sm font-medium text-white/80">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsAsRead()}
              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[300px] overflow-y-auto">
          {recentNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="h-8 w-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/25">No notifications yet</p>
            </div>
          ) : (
            recentNotifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => {
                  if (!notification.read) {
                    markNotificationAsRead(notification.id);
                  }
                }}
                className={cn(
                  "flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors",
                  !notification.read && "bg-[#8b5cf6]/5"
                )}
              >
                <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5 ring-1 ring-white/[0.06]">
                  <AvatarImage src={notification.sender?.image || undefined} />
                  <AvatarFallback className="text-[10px] bg-white/[0.06] text-white/50">
                    {notification.sender?.name?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/70 line-clamp-2">
                    <span className="font-medium text-white/80">
                      {notification.sender?.name || "Someone"}
                    </span>{" "}
                    {notification.content || "sent a notification"}
                    {notification.issue && (
                      <> in <span className="text-[#8b5cf6]">{notification.issue.issueKey || notification.issue.title}</span></>
                    )}
                  </p>
                  <span className="text-[10px] text-white/20 mt-1 block">
                    {timeAgo(notification.createdAt)}
                  </span>
                </div>
                {!notification.read && (
                  <div className="w-2 h-2 rounded-full bg-[#8b5cf6] flex-shrink-0 mt-2" style={{ boxShadow: "0 0 6px rgba(139,92,246,0.4)" }} />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-4 py-2">
          <Link
            href={`${workspaceBase}/notifications`}
            className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
          >
            View all notifications &rarr;
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
