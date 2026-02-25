"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Search,
  Filter,
  Loader2,
  ArrowRight,
  Wand2,
  History,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ParsedFilter {
  type: 'status' | 'priority' | 'assignee' | 'label' | 'date' | 'project' | 'text';
  operator: 'is' | 'is_not' | 'contains' | 'before' | 'after' | 'between';
  value: string | string[];
  display: string;
}

interface AIFilterBarProps {
  onFiltersChange: (filters: ParsedFilter[]) => void;
  currentFilters?: ParsedFilter[];
  workspaceId: string;
  placeholder?: string;
  className?: string;
}

const EXAMPLE_QUERIES = [
  "Show me urgent bugs assigned to me",
  "Issues due this week with high priority",
  "Unassigned tasks in the frontend project",
  "Recently updated issues without labels",
  "Blocked items that need attention",
];

const RECENT_QUERIES_KEY = "ai-filter-recent-queries";

export default function AIFilterBar({
  onFiltersChange,
  currentFilters = [],
  workspaceId,
  placeholder = "Describe what you're looking for...",
  className,
}: AIFilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFilters, setParsedFilters] = useState<ParsedFilter[]>(currentFilters);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent queries from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_QUERIES_KEY);
      if (stored) {
        setRecentQueries(JSON.parse(stored).slice(0, 5));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Handle click outside to collapse
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        if (!query && parsedFilters.length === 0) {
          setIsExpanded(false);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query, parsedFilters.length]);

  const saveRecentQuery = (q: string) => {
    try {
      const updated = [q, ...recentQueries.filter(r => r !== q)].slice(0, 5);
      setRecentQueries(updated);
      localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const parseNaturalLanguageQuery = async (naturalQuery: string): Promise<ParsedFilter[]> => {
    // This would call the AI API to parse the natural language query
    // For now, implement basic keyword-based parsing
    const filters: ParsedFilter[] = [];
    const lowerQuery = naturalQuery.toLowerCase();

    // Priority detection
    if (lowerQuery.includes("urgent") || lowerQuery.includes("critical")) {
      filters.push({
        type: "priority",
        operator: "is",
        value: "urgent",
        display: "Priority: Urgent",
      });
    } else if (lowerQuery.includes("high priority") || lowerQuery.includes("high-priority")) {
      filters.push({
        type: "priority",
        operator: "is",
        value: "high",
        display: "Priority: High",
      });
    } else if (lowerQuery.includes("low priority") || lowerQuery.includes("low-priority")) {
      filters.push({
        type: "priority",
        operator: "is",
        value: "low",
        display: "Priority: Low",
      });
    }

    // Assignee detection
    if (lowerQuery.includes("assigned to me") || lowerQuery.includes("my ")) {
      filters.push({
        type: "assignee",
        operator: "is",
        value: "me",
        display: "Assigned to: Me",
      });
    } else if (lowerQuery.includes("unassigned")) {
      filters.push({
        type: "assignee",
        operator: "is",
        value: "none",
        display: "Unassigned",
      });
    }

    // Status detection
    if (lowerQuery.includes("blocked")) {
      filters.push({
        type: "status",
        operator: "is",
        value: "blocked",
        display: "Status: Blocked",
      });
    } else if (lowerQuery.includes("in progress") || lowerQuery.includes("in-progress")) {
      filters.push({
        type: "status",
        operator: "is",
        value: "in_progress",
        display: "Status: In Progress",
      });
    } else if (lowerQuery.includes("done") || lowerQuery.includes("completed")) {
      filters.push({
        type: "status",
        operator: "is",
        value: "done",
        display: "Status: Done",
      });
    } else if (lowerQuery.includes("todo") || lowerQuery.includes("to do") || lowerQuery.includes("backlog")) {
      filters.push({
        type: "status",
        operator: "is",
        value: "todo",
        display: "Status: To Do",
      });
    }

    // Type/Label detection
    if (lowerQuery.includes("bug") || lowerQuery.includes("bugs")) {
      filters.push({
        type: "label",
        operator: "is",
        value: "bug",
        display: "Type: Bug",
      });
    } else if (lowerQuery.includes("feature") || lowerQuery.includes("features")) {
      filters.push({
        type: "label",
        operator: "is",
        value: "feature",
        display: "Type: Feature",
      });
    } else if (lowerQuery.includes("task") || lowerQuery.includes("tasks")) {
      filters.push({
        type: "label",
        operator: "is",
        value: "task",
        display: "Type: Task",
      });
    }

    // Date detection
    if (lowerQuery.includes("due this week") || lowerQuery.includes("this week")) {
      filters.push({
        type: "date",
        operator: "between",
        value: ["this_week_start", "this_week_end"],
        display: "Due: This Week",
      });
    } else if (lowerQuery.includes("due today") || lowerQuery.includes("today")) {
      filters.push({
        type: "date",
        operator: "is",
        value: "today",
        display: "Due: Today",
      });
    } else if (lowerQuery.includes("overdue") || lowerQuery.includes("past due")) {
      filters.push({
        type: "date",
        operator: "before",
        value: "today",
        display: "Overdue",
      });
    }

    // Recently updated detection
    if (lowerQuery.includes("recently updated") || lowerQuery.includes("recent")) {
      filters.push({
        type: "date",
        operator: "after",
        value: "last_7_days",
        display: "Updated: Last 7 days",
      });
    }

    // If no specific filters found, treat as text search
    if (filters.length === 0) {
      filters.push({
        type: "text",
        operator: "contains",
        value: naturalQuery,
        display: `Search: "${naturalQuery}"`,
      });
    }

    return filters;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isProcessing) return;

    setIsProcessing(true);
    setShowSuggestions(false);

    try {
      const filters = await parseNaturalLanguageQuery(query);
      setParsedFilters(filters);
      onFiltersChange(filters);
      saveRecentQuery(query);
      setQuery("");
    } catch (error) {
      console.error("Failed to parse query:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeFilter = (index: number) => {
    const newFilters = parsedFilters.filter((_, i) => i !== index);
    setParsedFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    setParsedFilters([]);
    onFiltersChange([]);
    setQuery("");
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => {
          setIsExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-collab-700/50 border border-collab-600 hover:border-collab-600",
          "text-sm text-collab-500 hover:text-collab-400",
          "transition-all duration-200",
          className
        )}
      >
        <Sparkles className="h-4 w-4 text-violet-500" />
        <span>AI Filter</span>
        <span className="text-collab-500/60">|</span>
        <Search className="h-3.5 w-3.5" />
        <span>Search issues...</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-collab-950 border border-collab-600 rounded-xl overflow-hidden"
      >
        {/* Search Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="p-1.5 rounded-lg bg-violet-500/20">
              <Wand2 className="h-4 w-4 text-violet-500" />
            </div>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={isProcessing}
            className={cn(
              "flex-1 bg-transparent text-sm text-white placeholder-[#52525b]",
              "border-none outline-none focus:ring-0"
            )}
          />

          <div className="flex items-center gap-1">
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery("")}
                className="text-collab-500/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              variant="ai-solid"
              size="sm"
              disabled={!query.trim() || isProcessing}
              className="h-8 px-3"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  Apply
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Active Filters */}
        <AnimatePresence>
          {parsedFilters.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 pb-3 border-t border-collab-700"
            >
              <div className="flex items-center gap-2 pt-3 flex-wrap">
                <span className="text-[10px] text-collab-500/60 uppercase tracking-wider">
                  Active filters:
                </span>
                {parsedFilters.map((filter, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-violet-500/10 border-violet-500/30 text-violet-300 text-xs gap-1 pr-1"
                  >
                    {filter.display}
                    <button
                      onClick={() => removeFilter(index)}
                      className="ml-1 p-0.5 hover:bg-violet-500/20 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] text-collab-500 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggestions Dropdown */}
        <AnimatePresence>
          {showSuggestions && !query && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-collab-700 max-h-64 overflow-y-auto"
            >
              {/* Recent Queries */}
              {recentQueries.length > 0 && (
                <div className="p-2">
                  <p className="px-2 py-1 text-[10px] text-collab-500/60 uppercase tracking-wider">
                    Recent
                  </p>
                  {recentQueries.map((recent, index) => (
                    <button
                      key={index}
                      onClick={() => handleExampleClick(recent)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-collab-400 hover:bg-collab-700 hover:text-white transition-colors text-left"
                    >
                      <History className="h-3.5 w-3.5 text-collab-500/60" />
                      <span className="truncate">{recent}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Example Queries */}
              <div className="p-2 border-t border-collab-700">
                <p className="px-2 py-1 text-[10px] text-collab-500/60 uppercase tracking-wider">
                  Try asking
                </p>
                {EXAMPLE_QUERIES.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(example)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-collab-400 hover:bg-collab-700 hover:text-white transition-colors text-left"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    <span>{example}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Helper to convert ParsedFilter to ViewFilters format
export function convertToViewFilters(parsedFilters: ParsedFilter[]) {
  const viewFilters: Record<string, any> = {};

  for (const filter of parsedFilters) {
    switch (filter.type) {
      case "status":
        viewFilters.status = viewFilters.status || [];
        viewFilters.status.push(filter.value);
        break;
      case "priority":
        viewFilters.priority = viewFilters.priority || [];
        viewFilters.priority.push(filter.value);
        break;
      case "assignee":
        if (filter.value === "me") {
          viewFilters.assigneeId = "currentUser";
        } else if (filter.value === "none") {
          viewFilters.assigneeId = null;
        } else {
          viewFilters.assigneeId = filter.value;
        }
        break;
      case "label":
        viewFilters.labels = viewFilters.labels || [];
        viewFilters.labels.push(filter.value);
        break;
      case "date":
        if (filter.operator === "before") {
          viewFilters.dueDateBefore = filter.value;
        } else if (filter.operator === "after") {
          viewFilters.dueDateAfter = filter.value;
        } else if (filter.operator === "is") {
          viewFilters.dueDate = filter.value;
        } else if (filter.operator === "between" && Array.isArray(filter.value)) {
          viewFilters.dueDateStart = filter.value[0];
          viewFilters.dueDateEnd = filter.value[1];
        }
        break;
      case "text":
        viewFilters.search = filter.value;
        break;
    }
  }

  return viewFilters;
}
