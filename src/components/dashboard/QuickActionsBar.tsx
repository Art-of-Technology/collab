"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Calendar,
  Users,
  BarChart3,
  Sparkles,
  Search,
  CheckSquare,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIWidget } from '@/hooks/useAI';

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'ai';
}

interface QuickActionsBarProps {
  workspaceSlug: string;
  onCreateIssue?: () => void;
}

export default function QuickActionsBar({
  workspaceSlug,
  onCreateIssue,
}: QuickActionsBarProps) {
  const router = useRouter();
  const { openWidget } = useAIWidget();

  const actions: QuickAction[] = [
    {
      id: 'create',
      label: 'Create Issue',
      description: 'New task, bug, or story',
      icon: Plus,
      onClick: () => onCreateIssue?.(),
    },
    {
      id: 'my-work',
      label: 'My Work',
      description: 'View assigned items',
      icon: CheckSquare,
      onClick: () => router.push(`/${workspaceSlug}/views/my-issues`),
    },
    {
      id: 'team',
      label: 'Team Activity',
      description: 'See what\'s happening',
      icon: Users,
      onClick: () => router.push(`/${workspaceSlug}/timeline`),
    },
    {
      id: 'search',
      label: 'Search',
      description: 'Find issues quickly',
      icon: Search,
      onClick: () => {
        const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
        document.dispatchEvent(event);
      },
    },
    {
      id: 'ai',
      label: 'Ask AI',
      description: 'Get intelligent help',
      icon: Sparkles,
      onClick: openWidget,
      variant: 'ai',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={action.onClick}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl",
            "border transition-all duration-200",
            "text-center group",
            action.variant === 'ai'
              ? "bg-[#8b5cf6]/5 border-[#8b5cf6]/20 hover:bg-[#8b5cf6]/10 hover:border-[#8b5cf6]/30"
              : "bg-[#1f1f1f]/50 border-[#27272a] hover:bg-[#1f1f1f] hover:border-[#3f3f46]"
          )}
        >
          <div
            className={cn(
              "p-2.5 rounded-xl transition-colors",
              action.variant === 'ai'
                ? "bg-[#8b5cf6]/20 text-[#8b5cf6] group-hover:bg-[#8b5cf6]/30"
                : "bg-[#27272a] text-[#71717a] group-hover:bg-[#3f3f46] group-hover:text-[#a1a1aa]"
            )}
          >
            <action.icon className="h-5 w-5" />
          </div>
          <div>
            <p
              className={cn(
                "text-sm font-medium",
                action.variant === 'ai' ? "text-[#c4b5fd]" : "text-[#fafafa]"
              )}
            >
              {action.label}
            </p>
            <p className="text-[10px] text-[#52525b] mt-0.5">
              {action.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

// Compact version for mobile
export function QuickActionsCompact({
  workspaceSlug,
  onCreateIssue,
}: QuickActionsBarProps) {
  const router = useRouter();
  const { openWidget } = useAIWidget();

  const actions = [
    { icon: Plus, label: 'New', onClick: () => onCreateIssue?.() },
    { icon: CheckSquare, label: 'My Work', onClick: () => router.push(`/${workspaceSlug}/views/my-issues`) },
    { icon: Users, label: 'Team', onClick: () => router.push(`/${workspaceSlug}/timeline`) },
    { icon: Sparkles, label: 'AI', onClick: openWidget, isAI: true },
  ];

  return (
    <div className="flex items-center gap-2">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs",
            "transition-colors",
            action.isAI
              ? "bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/20"
              : "bg-[#1f1f1f] text-[#a1a1aa] hover:bg-[#27272a] hover:text-white"
          )}
        >
          <action.icon className="h-3.5 w-3.5" />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
