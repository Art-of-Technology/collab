'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Sparkles,
  Wand2,
  FileText,
  Bug,
  Users,
  Tag,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Copy,
  MessageSquare,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Types
interface AIContextMenuProps {
  children?: React.ReactNode;
  workspaceId: string;
  context: {
    type: 'issue' | 'comment' | 'text' | 'project';
    id?: string;
    title?: string;
    description?: string;
    content?: string;
    projectId?: string;
  };
  onAction?: (action: AIAction, result: AIActionResult) => void;
  align?: 'start' | 'center' | 'end';
}

interface AIAction {
  id: string;
  label: string;
  type: 'enhance' | 'summarize' | 'triage' | 'duplicates' | 'assign' | 'explain' | 'custom';
}

interface AIActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface LoadingState {
  [key: string]: boolean;
}

export function AIContextMenu({
  children,
  workspaceId,
  context,
  onAction,
  align = 'end',
}: AIContextMenuProps) {
  const [loading, setLoading] = useState<LoadingState>({});
  const [lastResult, setLastResult] = useState<{ action: string; result: AIActionResult } | null>(null);

  // Execute AI action
  const executeAction = useCallback(
    async (action: AIAction) => {
      setLoading((prev) => ({ ...prev, [action.id]: true }));
      setLastResult(null);

      try {
        let endpoint = '';
        let body: Record<string, unknown> = { workspaceId };

        switch (action.type) {
          case 'enhance':
            endpoint = '/api/ai/complete';
            body = {
              type: 'improve',
              input: context.content || context.description || '',
            };
            break;

          case 'summarize':
            endpoint = '/api/ai/complete';
            body = {
              type: 'summarize',
              input: context.content || context.description || '',
            };
            break;

          case 'triage':
            endpoint = '/api/ai/automation/triage';
            body = {
              workspaceId,
              title: context.title || '',
              description: context.description || '',
            };
            break;

          case 'duplicates':
            endpoint = '/api/ai/automation/duplicates';
            body = {
              workspaceId,
              projectId: context.projectId,
              title: context.title || '',
              description: context.description || '',
            };
            break;

          case 'assign':
            endpoint = '/api/ai/automation/assign';
            body = {
              workspaceId,
              projectId: context.projectId,
              issue: {
                id: context.id,
                title: context.title,
                description: context.description,
              },
            };
            break;

          case 'explain':
            endpoint = '/api/ai/complete';
            body = {
              type: 'custom',
              input: context.content || context.description || '',
              options: {
                systemPrompt:
                  'You are a helpful assistant. Explain the following text in simple terms, highlighting key points and any technical concepts.',
              },
            };
            break;

          default:
            throw new Error('Unknown action type');
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error('Failed to execute AI action');
        }

        const data = await response.json();
        const result: AIActionResult = { success: true, data };

        setLastResult({ action: action.id, result });
        onAction?.(action, result);
      } catch (error) {
        const result: AIActionResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        setLastResult({ action: action.id, result });
        onAction?.(action, result);
      } finally {
        setLoading((prev) => ({ ...prev, [action.id]: false }));
      }
    },
    [workspaceId, context, onAction]
  );

  // Get available actions based on context type
  const getAvailableActions = (): AIAction[] => {
    const actions: AIAction[] = [];

    if (context.type === 'issue') {
      actions.push(
        { id: 'enhance-desc', label: 'Enhance Description', type: 'enhance' },
        { id: 'summarize', label: 'Summarize Issue', type: 'summarize' },
        { id: 'triage', label: 'Auto-Triage', type: 'triage' },
        { id: 'duplicates', label: 'Find Duplicates', type: 'duplicates' },
        { id: 'assign', label: 'Suggest Assignee', type: 'assign' }
      );
    } else if (context.type === 'comment') {
      actions.push(
        { id: 'enhance', label: 'Enhance', type: 'enhance' },
        { id: 'summarize', label: 'Summarize', type: 'summarize' }
      );
    } else if (context.type === 'text') {
      actions.push(
        { id: 'enhance', label: 'Improve Writing', type: 'enhance' },
        { id: 'summarize', label: 'Summarize', type: 'summarize' },
        { id: 'explain', label: 'Explain', type: 'explain' }
      );
    } else if (context.type === 'project') {
      actions.push(
        { id: 'summarize', label: 'Project Summary', type: 'summarize' }
      );
    }

    return actions;
  };

  const actions = getAvailableActions();

  // Render action icon
  const getActionIcon = (type: AIAction['type']) => {
    switch (type) {
      case 'enhance':
        return <Wand2 className="h-4 w-4" />;
      case 'summarize':
        return <FileText className="h-4 w-4" />;
      case 'triage':
        return <Tag className="h-4 w-4" />;
      case 'duplicates':
        return <AlertTriangle className="h-4 w-4" />;
      case 'assign':
        return <Users className="h-4 w-4" />;
      case 'explain':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Sparkles className="h-4 w-4 mr-1" />
            <span className="text-xs">AI</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onClick={() => executeAction(action)}
            disabled={loading[action.id]}
            className="flex items-center gap-2"
          >
            {loading[action.id] ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : lastResult?.action === action.id && lastResult.result.success ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              getActionIcon(action.type)
            )}
            <span>{action.label}</span>
            {loading[action.id] && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                Processing
              </Badge>
            )}
          </DropdownMenuItem>
        ))}

        {context.type === 'issue' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Bug className="h-4 w-4 mr-2" />
                Quick Actions
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => executeAction({ id: 'convert-bug', label: 'Convert to Bug', type: 'custom' })}>
                  Convert to Bug
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => executeAction({ id: 'add-labels', label: 'Suggest Labels', type: 'triage' })}>
                  Suggest Labels
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => executeAction({ id: 'estimate', label: 'Estimate Effort', type: 'triage' })}>
                  Estimate Effort
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AIContextMenu;
