"use client";

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AISuggestion as AISuggestionType } from '@/lib/ai';
import { Button } from '@/components/ui/button';

interface AISuggestionProps {
  suggestion: AISuggestionType;
  onAction?: () => void;
  onDismiss?: () => void;
  variant?: 'default' | 'compact' | 'card';
}

export default function AISuggestion({
  suggestion,
  onAction,
  onDismiss,
  variant = 'default',
}: AISuggestionProps) {
  const priorityConfig = {
    high: {
      icon: AlertCircle,
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      iconColor: 'text-red-400',
      accentColor: 'bg-red-500',
    },
    medium: {
      icon: AlertTriangle,
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      iconColor: 'text-amber-400',
      accentColor: 'bg-amber-500',
    },
    low: {
      icon: Info,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      iconColor: 'text-blue-400',
      accentColor: 'bg-blue-500',
    },
  };

  const config = priorityConfig[suggestion.priority || 'low'];
  const Icon = config.icon;

  if (variant === 'compact') {
    return (
      <button
        onClick={onAction}
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          "bg-[#1f1f1f] border border-[#27272a] rounded-lg",
          "hover:bg-[#27272a] hover:border-[#3f3f46]",
          "text-left transition-all w-full"
        )}
      >
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <span className="flex-1 text-sm text-[#e6edf3] truncate">
          {suggestion.title}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-[#52525b]" />
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          "relative overflow-hidden",
          "bg-[#1f1f1f] border rounded-xl",
          config.borderColor
        )}
      >
        {/* Accent bar */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1", config.accentColor)} />

        <div className="p-4 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={cn("p-2 rounded-lg", config.bgColor)}>
                <Icon className={cn("h-4 w-4", config.iconColor)} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-[#fafafa]">
                  {suggestion.title}
                </h4>
                {suggestion.description && (
                  <p className="text-xs text-[#71717a] mt-1">
                    {suggestion.description}
                  </p>
                )}
              </div>
            </div>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 hover:bg-[#27272a] rounded transition-colors"
              >
                <X className="h-4 w-4 text-[#52525b]" />
              </button>
            )}
          </div>

          {onAction && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={onAction}
                className="h-7 text-xs text-[#8b5cf6] hover:text-[#a78bfa] hover:bg-[#8b5cf6]/10"
              >
                Take action
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3",
        "bg-[#1f1f1f] border rounded-lg",
        config.borderColor,
        "hover:bg-[#27272a] transition-colors"
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5", config.iconColor)} />
      <div className="flex-1">
        <p className="text-sm text-[#e6edf3]">{suggestion.title}</p>
        {suggestion.description && (
          <p className="text-xs text-[#71717a] mt-0.5">
            {suggestion.description}
          </p>
        )}
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="p-1.5 hover:bg-[#3f3f46] rounded transition-colors"
        >
          <ArrowRight className="h-3.5 w-3.5 text-[#71717a]" />
        </button>
      )}
    </div>
  );
}

// Insight card for dashboard
export function AIInsightCard({
  title,
  description,
  priority = 'low',
  actionLabel,
  onAction,
  onDismiss,
}: {
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const priorityConfig = {
    high: {
      icon: AlertCircle,
      bgColor: 'bg-red-500/5',
      borderColor: 'border-red-500/20 hover:border-red-500/30',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
    },
    medium: {
      icon: AlertTriangle,
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/20 hover:border-amber-500/30',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
    },
    low: {
      icon: CheckCircle2,
      bgColor: 'bg-emerald-500/5',
      borderColor: 'border-emerald-500/20 hover:border-emerald-500/30',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
    },
  };

  const config = priorityConfig[priority];
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
        <div className={cn("p-2 rounded-lg", config.iconBg)}>
          <Icon className={cn("h-4 w-4", config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#fafafa]">{title}</p>
          <p className="text-xs text-[#71717a] mt-1">{description}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-[#27272a] rounded transition-colors"
          >
            <X className="h-4 w-4 text-[#52525b]" />
          </button>
        )}
      </div>

      {(onAction || actionLabel) && (
        <div className="mt-3 flex gap-2">
          {onAction && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAction}
              className="h-7 px-3 text-xs bg-[#1f1f1f] hover:bg-[#27272a]"
            >
              {actionLabel || 'View'}
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 px-3 text-xs text-[#52525b] hover:text-[#71717a]"
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
