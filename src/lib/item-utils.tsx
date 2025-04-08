import React from "react";
import { Bug, FileSpreadsheet, BookOpen, Lightbulb, Flag, Milestone, Layers } from "lucide-react";

export const ITEM_TYPES = {
  TASK: "TASK",
  BUG: "BUG",
  FEATURE: "FEATURE",
  IMPROVEMENT: "IMPROVEMENT",
  MILESTONE: "MILESTONE",
  EPIC: "EPIC",
  STORY: "STORY"
} as const;

export type ItemType = keyof typeof ITEM_TYPES;

export function getItemTypeIcon(type: string): React.ReactNode {
  switch (type.toUpperCase()) {
    case ITEM_TYPES.TASK:
      return <FileSpreadsheet className="h-4 w-4" />;
    case ITEM_TYPES.BUG:
      return <Bug className="h-4 w-4" />;
    case ITEM_TYPES.FEATURE:
      return <Lightbulb className="h-4 w-4" />;
    case ITEM_TYPES.IMPROVEMENT:
      return <Lightbulb className="h-4 w-4" />;
    case ITEM_TYPES.MILESTONE:
      return <Milestone className="h-4 w-4" />;
    case ITEM_TYPES.EPIC:
      return <Flag className="h-4 w-4" />;
    case ITEM_TYPES.STORY:
      return <BookOpen className="h-4 w-4" />;
    default:
      return <Layers className="h-4 w-4" />;
  }
}

export function getItemTypeLabel(type: string): string {
  switch (type.toUpperCase()) {
    case ITEM_TYPES.TASK:
      return "Task";
    case ITEM_TYPES.BUG:
      return "Bug";
    case ITEM_TYPES.FEATURE:
      return "Feature";
    case ITEM_TYPES.IMPROVEMENT:
      return "Improvement";
    case ITEM_TYPES.MILESTONE:
      return "Milestone";
    case ITEM_TYPES.EPIC:
      return "Epic";
    case ITEM_TYPES.STORY:
      return "Story";
    default:
      return "Unknown";
  }
}

export function getItemTypeColor(type: string): string {
  switch (type.toUpperCase()) {
    case ITEM_TYPES.TASK:
      return "bg-blue-100 text-blue-700";
    case ITEM_TYPES.BUG:
      return "bg-red-100 text-red-700";
    case ITEM_TYPES.FEATURE:
      return "bg-green-100 text-green-700";
    case ITEM_TYPES.IMPROVEMENT:
      return "bg-amber-100 text-amber-700";
    case ITEM_TYPES.MILESTONE:
      return "bg-purple-100 text-purple-700";
    case ITEM_TYPES.EPIC:
      return "bg-indigo-100 text-indigo-700";
    case ITEM_TYPES.STORY:
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
} 