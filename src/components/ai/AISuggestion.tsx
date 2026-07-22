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
          "bg-collab-700 border border-collab-600 rounded-lg",
          "hover:bg-collab-600 hover:border-collab-600",
          "text-left transition-all w-full"
        )}
      >
        <Icon className={cn("h-4 w-4", config.iconColor)} />
        <span className="flex-1 text-sm text-collab-50 truncate">
          {suggestion.title}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-collab-500/60" />
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          "relative overflow-hidden",
          "bg-collab-700 border rounded-xl",
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
                <h4 className="text-sm font-medium text-collab-50">
                  {suggestion.title}
                </h4>
                {suggestion.description && (
                  <p className="text-xs text-collab-500 mt-1">
                    {suggestion.description}
                  </p>
                )}
              </div>
            </div>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 hover:bg-collab-600 rounded transition-colors"
              >
                <X className="h-4 w-4 text-collab-500/60" />
              </button>
            )}
          </div>

          {onAction && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={onAction}
                className="h-7 text-xs text-violet-500 hover:text-violet-400 hover:bg-violet-500/10"
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
        "bg-collab-700 border rounded-lg",
        config.borderColor,
        "hover:bg-collab-600 transition-colors"
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5", config.iconColor)} />
      <div className="flex-1">
        <p className="text-sm text-collab-50">{suggestion.title}</p>
        {suggestion.description && (
          <p className="text-xs text-collab-500 mt-0.5">
            {suggestion.description}
          </p>
        )}
      </div>
      {onAction && (
        <button
          onClick={onAction}
          className="p-1.5 hover:bg-collab-600 rounded transition-colors"
        >
          <ArrowRight className="h-3.5 w-3.5 text-collab-500" />
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
          <p className="text-sm font-medium text-collab-50">{title}</p>
          <p className="text-xs text-collab-500 mt-1">{description}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-collab-600 rounded transition-colors"
          >
            <X className="h-4 w-4 text-collab-500/60" />
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
              className="h-7 px-3 text-xs bg-collab-700 hover:bg-collab-600"
            >
              {actionLabel || 'View'}
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="h-7 px-3 text-xs text-collab-500/60 hover:text-collab-500"
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
