import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CheckSquare, Bug, Sparkles, TrendingUp } from "lucide-react";
import React from "react";

// Format date helper
export const formatDate = (date: Date | string) => {
  return format(new Date(date), 'MMM d, yyyy');
};

// Helper function to format milliseconds into a readable string (e.g., 1d 2h 3m 4s)
export const formatLiveTime = (ms: number): string => {
  if (ms < 0) ms = 0;
  const totalSecondsValue = Math.floor(ms / 1000);
  const d = Math.floor(totalSecondsValue / (3600 * 24));
  const h = Math.floor((totalSecondsValue % (3600 * 24)) / 3600);
  const m = Math.floor((totalSecondsValue % 3600) / 60);
  const s = totalSecondsValue % 60;

  // Consistent with API: Xh Ym Zs, or Dd Xh Ym Zs
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  return `${h}h ${m}m ${s}s`;
};

// Client-side implementation of priority badge
export const getPriorityBadge = (priority: string) => {
  const priorityColors: Record<string, string> = {
    "LOW": "bg-blue-100 text-blue-800",
    "MEDIUM": "bg-yellow-100 text-yellow-800",
    "HIGH": "bg-orange-100 text-orange-800",
    "CRITICAL": "bg-red-100 text-red-800"
  };

  const priorityIcons: Record<string, string> = {
    "LOW": "↓",
    "MEDIUM": "→",
    "HIGH": "↑",
    "CRITICAL": "‼️"
  };

  return (
    <Badge className={priorityColors[priority] || "bg-slate-100 text-slate-800"}>
      {priorityIcons[priority]} {priority}
    </Badge>
  );
};

// Get type badge
export const getTypeBadge = (type: string) => {
  // Ensure consistent uppercase formatting for types
  const normalizedType = type?.toUpperCase() || "TASK";

  const typeColors: Record<string, string> = {
    "TASK": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "BUG": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "FEATURE": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "IMPROVEMENT": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TASK":
        return <CheckSquare className="h-3.5 w-3.5 mr-1" />;
      case "BUG":
        return <Bug className="h-3.5 w-3.5 mr-1" />;
      case "FEATURE":
        return <Sparkles className="h-3.5 w-3.5 mr-1" />;
      case "IMPROVEMENT":
        return <TrendingUp className="h-3.5 w-3.5 mr-1" />;
      default:
        return <CheckSquare className="h-3.5 w-3.5 mr-1" />;
    }
  };

  return (
    <Badge className={`${typeColors[normalizedType] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"} px-2 py-1 flex items-center`}>
      {getTypeIcon(normalizedType)}
      <span>{normalizedType}</span>
    </Badge>
  );
}; 