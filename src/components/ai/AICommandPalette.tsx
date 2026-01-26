'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  FileText,
  Bug,
  Sparkles,
  ArrowRight,
  Loader2,
  Lightbulb,
  BarChart3,
  GitPullRequest,
  Users,
  Folder,
  Tag,
  Clock,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Types
interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  keywords?: string[];
  action: () => void | Promise<void>;
  category: 'navigation' | 'create' | 'ai' | 'search';
}

interface AICommandPaletteProps {
  workspaceId: string;
  workspaceSlug: string;
  projectId?: string;
  onCreateIssue?: (type: string) => void;
  onNavigate?: (path: string) => void;
}

interface AIInterpretation {
  intent: 'create_issue' | 'search' | 'navigate' | 'analyze' | 'unknown';
  parameters?: Record<string, unknown>;
  suggestedAction?: string;
}

export function AICommandPalette({
  workspaceId,
  workspaceSlug,
  projectId,
  onCreateIssue,
  onNavigate,
}: AICommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiInterpretation, setAiInterpretation] = useState<AIInterpretation | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const router = useRouter();

  // Listen for keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai-command-recent');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Save search to recent
  const saveToRecent = (search: string) => {
    const updated = [search, ...recentSearches.filter((s) => s !== search)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('ai-command-recent', JSON.stringify(updated));
  };

  // Handle navigation
  const handleNavigate = useCallback(
    (path: string) => {
      setOpen(false);
      if (onNavigate) {
        onNavigate(path);
      } else {
        router.push(path);
      }
    },
    [router, onNavigate]
  );

  // Handle issue creation
  const handleCreateIssue = useCallback(
    (type: string) => {
      setOpen(false);
      if (onCreateIssue) {
        onCreateIssue(type);
      }
    },
    [onCreateIssue]
  );

  // AI interpretation of natural language query
  const interpretQuery = useCallback(async (q: string) => {
    if (q.length < 5) {
      setAiInterpretation(null);
      return;
    }

    setIsProcessingAI(true);

    try {
      const response = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          input: q,
          options: {
            systemPrompt: `You are a command interpreter for a project management tool.
Analyze the user's input and determine their intent.

Return JSON only:
{
  "intent": "create_issue" | "search" | "navigate" | "analyze" | "unknown",
  "parameters": {
    "issueType": "BUG" | "TASK" | "STORY" | null,
    "title": "extracted title if creating issue",
    "searchQuery": "what to search for",
    "destination": "where to navigate"
  },
  "suggestedAction": "brief description of what will happen"
}

Examples:
- "create bug for login not working" -> create_issue with type BUG
- "find issues assigned to me" -> search
- "go to settings" -> navigate
- "how many bugs this week" -> analyze`,
            responseFormat: 'json',
            model: 'claude-haiku-3.5',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          setAiInterpretation(parsed);
        }
      }
    } catch (error) {
      console.error('AI interpretation error:', error);
      setAiInterpretation(null);
    } finally {
      setIsProcessingAI(false);
    }
  }, []);

  // Debounced AI interpretation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 5) {
        interpretQuery(query);
      } else {
        setAiInterpretation(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, interpretQuery]);

  // Execute AI-suggested action
  const executeAIAction = useCallback(() => {
    if (!aiInterpretation) return;

    saveToRecent(query);

    switch (aiInterpretation.intent) {
      case 'create_issue':
        const type = aiInterpretation.parameters?.issueType as string || 'TASK';
        handleCreateIssue(type);
        break;
      case 'search':
        handleNavigate(`/${workspaceSlug}/search?q=${encodeURIComponent(query)}`);
        break;
      case 'navigate':
        const dest = aiInterpretation.parameters?.destination as string;
        if (dest) {
          handleNavigate(`/${workspaceSlug}/${dest}`);
        }
        break;
      case 'analyze':
        // Open AI chat with the analysis request
        handleNavigate(`/${workspaceSlug}?ai=${encodeURIComponent(query)}`);
        break;
    }

    setOpen(false);
    setQuery('');
    setAiInterpretation(null);
  }, [aiInterpretation, query, workspaceSlug, handleCreateIssue, handleNavigate]);

  // Static command actions
  const staticActions: CommandAction[] = [
    // Create actions
    {
      id: 'create-task',
      label: 'Create Task',
      description: 'Create a new task',
      icon: <Plus className="h-4 w-4" />,
      keywords: ['new', 'add', 'task'],
      action: () => handleCreateIssue('TASK'),
      category: 'create',
    },
    {
      id: 'create-bug',
      label: 'Report Bug',
      description: 'Report a new bug',
      icon: <Bug className="h-4 w-4" />,
      keywords: ['new', 'bug', 'issue', 'defect'],
      action: () => handleCreateIssue('BUG'),
      category: 'create',
    },
    {
      id: 'create-story',
      label: 'Create Story',
      description: 'Create a new user story',
      icon: <FileText className="h-4 w-4" />,
      keywords: ['new', 'story', 'feature', 'user'],
      action: () => handleCreateIssue('STORY'),
      category: 'create',
    },
    // Navigation actions
    {
      id: 'nav-board',
      label: 'Go to Board',
      description: 'View the project board',
      icon: <Folder className="h-4 w-4" />,
      keywords: ['board', 'kanban', 'view'],
      action: () => handleNavigate(`/${workspaceSlug}/board`),
      category: 'navigation',
    },
    {
      id: 'nav-issues',
      label: 'All Issues',
      description: 'View all issues',
      icon: <FileText className="h-4 w-4" />,
      keywords: ['issues', 'list', 'all'],
      action: () => handleNavigate(`/${workspaceSlug}/issues`),
      category: 'navigation',
    },
    {
      id: 'nav-team',
      label: 'Team Members',
      description: 'View team',
      icon: <Users className="h-4 w-4" />,
      keywords: ['team', 'members', 'people'],
      action: () => handleNavigate(`/${workspaceSlug}/settings/members`),
      category: 'navigation',
    },
    // AI actions
    {
      id: 'ai-analyze',
      label: 'Analyze Sprint',
      description: 'AI analysis of current sprint',
      icon: <BarChart3 className="h-4 w-4" />,
      keywords: ['analyze', 'sprint', 'progress', 'metrics'],
      action: () => handleNavigate(`/${workspaceSlug}?ai=analyze+sprint`),
      category: 'ai',
    },
    {
      id: 'ai-suggestions',
      label: 'Get Suggestions',
      description: 'AI suggestions for next steps',
      icon: <Lightbulb className="h-4 w-4" />,
      keywords: ['suggest', 'recommend', 'help', 'next'],
      action: () => handleNavigate(`/${workspaceSlug}?ai=suggest+next+steps`),
      category: 'ai',
    },
  ];

  // Filter actions based on query
  const filteredActions = query
    ? staticActions.filter(
        (action) =>
          action.label.toLowerCase().includes(query.toLowerCase()) ||
          action.keywords?.some((k) => k.includes(query.toLowerCase()))
      )
    : staticActions;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isProcessingAI ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Understanding your request...</span>
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found. Try a natural language command.
            </div>
          )}
        </CommandEmpty>

        {/* AI Interpretation */}
        {aiInterpretation && aiInterpretation.intent !== 'unknown' && (
          <CommandGroup heading="AI Suggestion">
            <CommandItem
              onSelect={executeAIAction}
              className="flex items-center gap-3 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{aiInterpretation.suggestedAction}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    AI
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {aiInterpretation.intent === 'create_issue' && 'Create a new issue'}
                  {aiInterpretation.intent === 'search' && 'Search issues'}
                  {aiInterpretation.intent === 'navigate' && 'Navigate to page'}
                  {aiInterpretation.intent === 'analyze' && 'Run AI analysis'}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CommandItem>
          </CommandGroup>
        )}

        {/* Recent searches */}
        {!query && recentSearches.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentSearches.map((search) => (
                <CommandItem
                  key={search}
                  onSelect={() => {
                    setQuery(search);
                  }}
                  className="flex items-center gap-2"
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{search}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Create actions */}
        {filteredActions.filter((a) => a.category === 'create').length > 0 && (
          <CommandGroup heading="Create">
            {filteredActions
              .filter((a) => a.category === 'create')
              .map((action) => (
                <CommandItem
                  key={action.id}
                  onSelect={action.action}
                  className="flex items-center gap-2"
                >
                  {action.icon}
                  <span>{action.label}</span>
                  {action.description && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {action.description}
                    </span>
                  )}
                </CommandItem>
              ))}
          </CommandGroup>
        )}

        {/* Navigation actions */}
        {filteredActions.filter((a) => a.category === 'navigation').length > 0 && (
          <CommandGroup heading="Navigate">
            {filteredActions
              .filter((a) => a.category === 'navigation')
              .map((action) => (
                <CommandItem
                  key={action.id}
                  onSelect={action.action}
                  className="flex items-center gap-2"
                >
                  {action.icon}
                  <span>{action.label}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        )}

        {/* AI actions */}
        {filteredActions.filter((a) => a.category === 'ai').length > 0 && (
          <CommandGroup heading="AI Actions">
            {filteredActions
              .filter((a) => a.category === 'ai')
              .map((action) => (
                <CommandItem
                  key={action.id}
                  onSelect={action.action}
                  className="flex items-center gap-2"
                >
                  {action.icon}
                  <span>{action.label}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    AI
                  </Badge>
                </CommandItem>
              ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer */}
      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">
            ↑↓
          </kbd>{' '}
          to navigate
        </span>
        <span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">
            ↵
          </kbd>{' '}
          to select
        </span>
        <span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px]">
            esc
          </kbd>{' '}
          to close
        </span>
      </div>
    </CommandDialog>
  );
}

export default AICommandPalette;
