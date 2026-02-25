"use client";

import React from 'react';
import {
  AlertCircle,
  Users,
  CheckSquare,
  Plus,
  FileText,
  AlertTriangle,
  ListOrdered,
  Filter,
  Link,
  Lightbulb,
  CheckCircle,
  Edit,
  BarChart,
  Calendar,
  Search,
  Home,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AISuggestion } from '@/lib/ai';

interface AIQuickActionsProps {
  suggestions: AISuggestion[];
  onSelect: (action: { title: string; description: string }) => void;
}

// Icon mapping for different action types
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'alert-circle': AlertCircle,
  'users': Users,
  'check-square': CheckSquare,
  'plus': Plus,
  'file-text': FileText,
  'alert-triangle': AlertTriangle,
  'list-ordered': ListOrdered,
  'filter': Filter,
  'link': Link,
  'lightbulb': Lightbulb,
  'check-circle': CheckCircle,
  'edit': Edit,
  'bar-chart': BarChart,
  'calendar': Calendar,
  'search': Search,
  'home': Home,
  'help-circle': HelpCircle,
};

// Get icon based on title/content
function getIconForAction(title: string): React.ComponentType<{ className?: string }> {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('attention') || lowerTitle.includes('overdue')) return AlertCircle;
  if (lowerTitle.includes('team') || lowerTitle.includes('summary')) return Users;
  if (lowerTitle.includes('task') || lowerTitle.includes('my')) return CheckSquare;
  if (lowerTitle.includes('create') || lowerTitle.includes('new')) return Plus;
  if (lowerTitle.includes('summarize')) return FileText;
  if (lowerTitle.includes('blocker') || lowerTitle.includes('risk')) return AlertTriangle;
  if (lowerTitle.includes('prioritize') || lowerTitle.includes('priority')) return ListOrdered;
  if (lowerTitle.includes('filter')) return Filter;
  if (lowerTitle.includes('related') || lowerTitle.includes('link')) return Link;
  if (lowerTitle.includes('suggest') || lowerTitle.includes('solution')) return Lightbulb;
  if (lowerTitle.includes('criteria')) return CheckCircle;
  if (lowerTitle.includes('improve') || lowerTitle.includes('write')) return Edit;
  if (lowerTitle.includes('status') || lowerTitle.includes('overview')) return BarChart;
  if (lowerTitle.includes('sprint') || lowerTitle.includes('calendar')) return Calendar;
  if (lowerTitle.includes('search') || lowerTitle.includes('find')) return Search;
  if (lowerTitle.includes('dashboard') || lowerTitle.includes('home')) return Home;
  if (lowerTitle.includes('help')) return HelpCircle;

  return Lightbulb; // Default icon
}

export default function AIQuickActions({ suggestions, onSelect }: AIQuickActionsProps) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-collab-500/60 uppercase tracking-wider font-medium px-1">
        Quick Actions
      </p>
      <div className="grid grid-cols-2 gap-2">
        {suggestions.slice(0, 6).map((suggestion) => {
          const Icon = getIconForAction(suggestion.title);

          return (
            <button
              key={suggestion.id}
              onClick={() => onSelect({
                title: suggestion.title,
                description: suggestion.description || suggestion.title,
              })}
              className={cn(
                "flex items-start gap-2 p-3",
                "bg-collab-700 border border-collab-600 rounded-xl",
                "hover:bg-collab-600 hover:border-collab-600",
                "text-left transition-all duration-200",
                "group"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-lg",
                "bg-violet-500/10 text-violet-500",
                "group-hover:bg-violet-500/20",
                "transition-colors"
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-collab-50 truncate">
                  {suggestion.title}
                </p>
                {suggestion.description && suggestion.description !== suggestion.title && (
                  <p className="text-[10px] text-collab-500/60 truncate mt-0.5">
                    {suggestion.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Compact version for inline suggestions
export function AIQuickActionsCompact({
  suggestions,
  onSelect,
}: AIQuickActionsProps) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {suggestions.slice(0, 4).map((suggestion) => (
        <button
          key={suggestion.id}
          onClick={() => onSelect({
            title: suggestion.title,
            description: suggestion.description || suggestion.title,
          })}
          className={cn(
            "px-2.5 py-1.5 text-xs",
            "bg-violet-500/10 text-violet-300",
            "border border-violet-500/20 rounded-lg",
            "hover:bg-violet-500/20 hover:border-violet-500/30",
            "transition-colors"
          )}
        >
          {suggestion.title}
        </button>
      ))}
    </div>
  );
}
