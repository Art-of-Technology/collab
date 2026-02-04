"use client";

import React, { useState } from 'react';
import {
  Lightbulb,
  X,
  ArrowRight,
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface AIInsight {
  id: string;
  type: 'warning' | 'suggestion' | 'achievement' | 'info';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface AIInsightsPanelProps {
  insights: AIInsight[];
  isLoading?: boolean;
  onDismiss?: (id: string) => void;
}

const insightConfig = {
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/5',
    borderColor: 'border-amber-500/20 hover:border-amber-500/30',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
  },
  suggestion: {
    icon: Lightbulb,
    bgColor: 'bg-[#8b5cf6]/5',
    borderColor: 'border-[#8b5cf6]/20 hover:border-[#8b5cf6]/30',
    iconBg: 'bg-[#8b5cf6]/20',
    iconColor: 'text-[#8b5cf6]',
  },
  achievement: {
    icon: CheckCircle2,
    bgColor: 'bg-emerald-500/5',
    borderColor: 'border-emerald-500/20 hover:border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  info: {
    icon: TrendingUp,
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20 hover:border-blue-500/30',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
  },
};

function InsightCard({
  insight,
  onDismiss,
}: {
  insight: AIInsight;
  onDismiss?: () => void;
}) {
  const config = insightConfig[insight.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-colors",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg flex-shrink-0", config.iconBg)}>
          <Icon className={cn("h-4 w-4", config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[#fafafa]">{insight.title}</p>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 hover:bg-[#27272a] rounded transition-colors flex-shrink-0"
              >
                <X className="h-3.5 w-3.5 text-[#52525b]" />
              </button>
            )}
          </div>
          <p className="text-xs text-[#71717a] mt-1">{insight.description}</p>
        </div>
      </div>

      {insight.actionLabel && insight.onAction && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={insight.onAction}
            className="h-7 px-3 text-xs bg-[#1f1f1f] hover:bg-[#27272a]"
          >
            {insight.actionLabel}
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AIInsightsPanel({
  insights,
  isLoading,
  onDismiss,
}: AIInsightsPanelProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleInsights = insights.filter(i => !dismissedIds.has(i.id));

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
    onDismiss?.(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-[#8b5cf6]/20">
            <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
          </div>
          <h3 className="text-sm font-medium text-[#fafafa]">AI Insights</h3>
        </div>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-[#1f1f1f]/50 border border-[#27272a] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (visibleInsights.length === 0) {
    return (
      <div className="bg-[#1f1f1f]/30 rounded-xl border border-[#27272a] p-6 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center mb-3">
          <Sparkles className="h-5 w-5 text-[#8b5cf6]" />
        </div>
        <p className="text-sm text-[#71717a]">
          AI is analyzing your workspace...
        </p>
        <p className="text-xs text-[#52525b] mt-1">
          Insights will appear as patterns emerge
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-[#8b5cf6]/20">
          <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
        </div>
        <h3 className="text-sm font-medium text-[#fafafa]">AI Insights</h3>
        <span className="text-[10px] text-[#52525b]">({visibleInsights.length})</span>
      </div>

      <div className="space-y-3">
        {visibleInsights.slice(0, 4).map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onDismiss={onDismiss ? () => handleDismiss(insight.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// Helper to generate insights from data
export function generateInsights(data: {
  overdueCount: number;
  atRiskCount: number;
  blockedCount: number;
  completedThisWeek: number;
  velocityChange?: number;
  unassignedCount: number;
}): AIInsight[] {
  const insights: AIInsight[] = [];

  if (data.overdueCount > 0) {
    insights.push({
      id: 'overdue',
      type: 'warning',
      title: `${data.overdueCount} overdue item${data.overdueCount > 1 ? 's' : ''} need attention`,
      description: 'These items have passed their due date and should be prioritized.',
      actionLabel: 'View overdue',
    });
  }

  if (data.blockedCount > 0) {
    insights.push({
      id: 'blocked',
      type: 'warning',
      title: `${data.blockedCount} team member${data.blockedCount > 1 ? 's' : ''} may be blocked`,
      description: 'Some items are marked as blocked. Consider offering help.',
      actionLabel: 'View blocked',
    });
  }

  if (data.atRiskCount > 3) {
    insights.push({
      id: 'at-risk',
      type: 'suggestion',
      title: 'Several items are at risk',
      description: `${data.atRiskCount} items are due soon. Consider reprioritizing or redistributing work.`,
    });
  }

  if (data.unassignedCount > 5) {
    insights.push({
      id: 'unassigned',
      type: 'suggestion',
      title: `${data.unassignedCount} items are unassigned`,
      description: 'Assigning owners helps ensure accountability and progress.',
      actionLabel: 'View unassigned',
    });
  }

  if (data.completedThisWeek > 0) {
    insights.push({
      id: 'completed',
      type: 'achievement',
      title: `Great progress! ${data.completedThisWeek} item${data.completedThisWeek > 1 ? 's' : ''} completed`,
      description: 'Your team has been productive this week. Keep up the momentum!',
    });
  }

  if (data.velocityChange !== undefined && data.velocityChange < -10) {
    insights.push({
      id: 'velocity',
      type: 'info',
      title: 'Velocity has decreased',
      description: `Team velocity is down ${Math.abs(data.velocityChange)}% compared to last week.`,
      actionLabel: 'View analytics',
    });
  }

  return insights;
}
