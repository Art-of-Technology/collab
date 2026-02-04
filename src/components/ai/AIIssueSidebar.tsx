"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Link2,
  Users,
  Clock,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Target,
  TrendingUp,
  CheckCircle2,
  MessageSquare,
  GitBranch,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface RelatedIssue {
  id: string;
  issueKey: string;
  title: string;
  status?: string;
  statusColor?: string;
  priority?: string;
  similarity: number; // 0-1 score
  relation: 'similar' | 'dependent' | 'blocks' | 'related';
}

interface IssueSuggestion {
  id: string;
  type: 'priority' | 'assignee' | 'due_date' | 'label' | 'split' | 'link';
  title: string;
  description: string;
  confidence: number;
  action?: () => void;
}

interface AIIssueSidebarProps {
  issue: {
    id: string;
    issueKey: string;
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    assignee?: {
      id: string;
      name: string;
      image?: string;
    };
    dueDate?: string;
    labels?: Array<{ id: string; name: string; color: string }>;
    projectId: string;
  };
  workspaceId: string;
  onClose?: () => void;
  onNavigateToIssue?: (issueKey: string) => void;
}

const suggestionIcons = {
  priority: AlertTriangle,
  assignee: Users,
  due_date: Clock,
  label: Target,
  split: GitBranch,
  link: Link2,
};

export default function AIIssueSidebar({
  issue,
  workspaceId,
  onClose,
  onNavigateToIssue,
}: AIIssueSidebarProps) {
  const [relatedIssues, setRelatedIssues] = useState<RelatedIssue[]>([]);
  const [suggestions, setSuggestions] = useState<IssueSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'related' | 'suggestions'>('related');

  const fetchAIInsights = async () => {
    setIsLoading(true);
    try {
      // Fetch related issues
      const relatedResponse = await fetch(
        `/api/ai/issues/related?issueId=${issue.id}&workspaceId=${workspaceId}`
      );
      if (relatedResponse.ok) {
        const data = await relatedResponse.json();
        setRelatedIssues(data.relatedIssues || []);
      }

      // Fetch suggestions
      const suggestionsResponse = await fetch(
        `/api/ai/issues/suggestions?issueId=${issue.id}&workspaceId=${workspaceId}`
      );
      if (suggestionsResponse.ok) {
        const data = await suggestionsResponse.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      // Generate fallback suggestions based on issue data
      generateFallbackSuggestions();
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const generateFallbackSuggestions = () => {
    const fallbackSuggestions: IssueSuggestion[] = [];

    // Check for missing priority
    if (!issue.priority || issue.priority === 'none') {
      fallbackSuggestions.push({
        id: 'suggest-priority',
        type: 'priority',
        title: 'Add priority',
        description: 'This issue has no priority set. Consider adding one to help with planning.',
        confidence: 0.9,
      });
    }

    // Check for missing assignee
    if (!issue.assignee) {
      fallbackSuggestions.push({
        id: 'suggest-assignee',
        type: 'assignee',
        title: 'Assign this issue',
        description: 'This issue is unassigned. Assign it to ensure accountability.',
        confidence: 0.85,
      });
    }

    // Check for missing due date
    if (!issue.dueDate) {
      fallbackSuggestions.push({
        id: 'suggest-duedate',
        type: 'due_date',
        title: 'Set a due date',
        description: 'Adding a due date helps track progress and prioritize work.',
        confidence: 0.7,
      });
    }

    // Check for missing labels
    if (!issue.labels || issue.labels.length === 0) {
      fallbackSuggestions.push({
        id: 'suggest-labels',
        type: 'label',
        title: 'Add labels',
        description: 'Labels help categorize and filter issues effectively.',
        confidence: 0.6,
      });
    }

    // Check for long description suggesting split
    if (issue.description && issue.description.length > 1000) {
      fallbackSuggestions.push({
        id: 'suggest-split',
        type: 'split',
        title: 'Consider splitting this issue',
        description: 'This issue has a lengthy description. It might benefit from being broken into smaller tasks.',
        confidence: 0.7,
      });
    }

    setSuggestions(fallbackSuggestions);
  };

  useEffect(() => {
    fetchAIInsights();
  }, [issue.id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAIInsights();
  };

  const getRelationLabel = (relation: RelatedIssue['relation']) => {
    switch (relation) {
      case 'similar':
        return 'Similar';
      case 'dependent':
        return 'Depends on';
      case 'blocks':
        return 'Blocks';
      case 'related':
      default:
        return 'Related';
    }
  };

  const getRelationColor = (relation: RelatedIssue['relation']) => {
    switch (relation) {
      case 'similar':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'dependent':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'blocks':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'related':
      default:
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] border-l border-[#27272a]">
      {/* Header */}
      <div className="p-4 border-b border-[#27272a]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#8b5cf6]/20">
              <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
            </div>
            <h3 className="text-sm font-medium text-[#fafafa]">AI Insights</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-[#71717a] hover:text-white"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="text-[#71717a] hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Issue Context */}
        <div className="text-xs text-[#52525b]">
          <span className="font-mono">{issue.issueKey}</span>
          <span className="mx-1.5">•</span>
          <span className="truncate">{issue.title}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#27272a]">
        <button
          onClick={() => setActiveTab('related')}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
            activeTab === 'related'
              ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
              : "text-[#71717a] hover:text-white"
          )}
        >
          Related Issues
          {relatedIssues.length > 0 && (
            <span className="ml-1.5 text-[10px] opacity-60">({relatedIssues.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
            activeTab === 'suggestions'
              ? "text-[#8b5cf6] border-b-2 border-[#8b5cf6]"
              : "text-[#71717a] hover:text-white"
          )}
        >
          Suggestions
          {suggestions.length > 0 && (
            <span className="ml-1.5 text-[10px] opacity-60">({suggestions.length})</span>
          )}
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-[#8b5cf6] animate-spin mb-3" />
            <p className="text-xs text-[#71717a]">Analyzing issue...</p>
          </div>
        ) : (
          <div className="p-4">
            <AnimatePresence mode="wait">
              {activeTab === 'related' && (
                <motion.div
                  key="related"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  {relatedIssues.length === 0 ? (
                    <div className="text-center py-8">
                      <Link2 className="h-8 w-8 text-[#3f3f46] mx-auto mb-3" />
                      <p className="text-sm text-[#71717a]">No related issues found</p>
                      <p className="text-xs text-[#52525b] mt-1">
                        AI couldn't find similar issues in this workspace
                      </p>
                    </div>
                  ) : (
                    relatedIssues.map((related) => (
                      <button
                        key={related.id}
                        onClick={() => onNavigateToIssue?.(related.issueKey)}
                        className="w-full text-left p-3 rounded-lg bg-[#1f1f1f]/50 border border-[#27272a] hover:border-[#3f3f46] transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <span className="text-[10px] font-mono text-[#52525b]">
                            {related.issueKey}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[9px] px-1.5 py-0 h-4", getRelationColor(related.relation))}
                          >
                            {getRelationLabel(related.relation)}
                          </Badge>
                        </div>
                        <p className="text-sm text-[#fafafa] group-hover:text-white truncate">
                          {related.title}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {related.status && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${related.statusColor}20`,
                                color: related.statusColor,
                              }}
                            >
                              {related.status}
                            </span>
                          )}
                          <span className="text-[10px] text-[#52525b]">
                            {Math.round(related.similarity * 100)}% match
                          </span>
                          <ArrowRight className="h-3 w-3 text-[#3f3f46] opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
                        </div>
                      </button>
                    ))
                  )}
                </motion.div>
              )}

              {activeTab === 'suggestions' && (
                <motion.div
                  key="suggestions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-3"
                >
                  {suggestions.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500/50 mx-auto mb-3" />
                      <p className="text-sm text-[#71717a]">Looking good!</p>
                      <p className="text-xs text-[#52525b] mt-1">
                        AI has no suggestions for this issue
                      </p>
                    </div>
                  ) : (
                    suggestions.map((suggestion) => {
                      const Icon = suggestionIcons[suggestion.type] || Lightbulb;
                      return (
                        <div
                          key={suggestion.id}
                          className="p-3 rounded-lg bg-[#1f1f1f]/50 border border-[#27272a]"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-[#8b5cf6]/10 flex-shrink-0">
                              <Icon className="h-4 w-4 text-[#8b5cf6]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#fafafa]">
                                {suggestion.title}
                              </p>
                              <p className="text-xs text-[#71717a] mt-1">
                                {suggestion.description}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-[#52525b]">
                                  {Math.round(suggestion.confidence * 100)}% confidence
                                </span>
                                {suggestion.action && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={suggestion.action}
                                    className="h-6 px-2 text-[10px] text-[#8b5cf6] hover:bg-[#8b5cf6]/10"
                                  >
                                    Apply
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-[#27272a]">
        <p className="text-[10px] text-[#52525b] text-center">
          AI insights are generated automatically based on your workspace data
        </p>
      </div>
    </div>
  );
}
