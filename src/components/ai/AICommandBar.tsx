'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Plus,
  Loader2,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IssueList, type IssueData } from './generative-ui';

// ============================================================================
// Types
// ============================================================================

interface AIAgent {
  id: string;
  name: string;
  avatar: string;
  description: string;
}

interface UIComponent {
  type: 'issue_list' | 'issue_card' | 'project_list' | 'stats' | 'text';
  data: unknown;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: AIAgent;
  timestamp: Date;
  ui?: UIComponent[];
}

interface AICommandBarProps {
  workspaceId: string;
  projectId?: string;
  issueId?: string;
  context?: {
    workspaceName?: string;
    projectName?: string;
    issueName?: string;
    currentView?: string;
  };
}

// ============================================================================
// Agents
// ============================================================================

const AGENTS: AIAgent[] = [
  { id: 'alex', name: 'Alex', avatar: '🤖', description: 'General Assistant' },
  { id: 'scout', name: 'Scout', avatar: '🔍', description: 'Data Analyst' },
  { id: 'rex', name: 'Rex', avatar: '👁', description: 'Code Reviewer' },
  { id: 'sage', name: 'Sage', avatar: '📋', description: 'Sprint Planner' },
  { id: 'quinn', name: 'Quinn', avatar: '✍️', description: 'Technical Writer' },
];

// ============================================================================
// Agent Avatar Button
// ============================================================================

function AgentButton({
  agent,
  isSelected,
  onClick,
}: {
  agent: AIAgent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          'relative h-8 w-8 rounded-full flex items-center justify-center text-sm',
          'transition-all duration-200 ease-out',
          'hover:scale-110',
          isSelected
            ? 'bg-white/20 ring-2 ring-white/40 ring-offset-1 ring-offset-transparent'
            : 'bg-white/5 hover:bg-white/10'
        )}
      >
        <span className="text-base">{agent.avatar}</span>
        {isSelected && (
          <motion.div
            layoutId="agent-indicator"
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
      </button>

      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg',
              'bg-[#1a1a1a] border border-white/10',
              'text-xs text-white whitespace-nowrap',
              'pointer-events-none z-[100]'
            )}
          >
            <div className="font-medium">{agent.name}</div>
            <div className="text-white/50 text-[10px]">{agent.description}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-4 border-transparent border-t-[#1a1a1a]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// UI Component Renderer
// ============================================================================

function UIComponentRenderer({
  component,
  onIssueSelect,
}: {
  component: UIComponent;
  onIssueSelect?: (issue: IssueData) => void;
}) {
  const data = component.data as Record<string, unknown>;

  switch (component.type) {
    case 'issue_list': {
      const issues = (data.issues || []) as IssueData[];
      const title = data.title as string;
      return (
        <div className="mt-3">
          <IssueList
            issues={issues}
            title={title}
            compact={issues.length > 5}
            onSelectIssue={onIssueSelect}
          />
        </div>
      );
    }

    case 'issue_card': {
      const issue = data as IssueData;
      return (
        <div className="mt-3">
          <IssueList issues={[issue]} onSelectIssue={onIssueSelect} />
        </div>
      );
    }

    case 'stats': {
      return (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {Object.entries(data).map(([key, value]) => (
            <div
              key={key}
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center"
            >
              <div className="text-lg font-semibold text-white">{String(value)}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </div>
            </div>
          ))}
        </div>
      );
    }

    case 'project_list': {
      const projects = (data.projects || []) as Array<{
        id: string;
        name: string;
        identifier?: string;
        issueCount?: number;
      }>;
      return (
        <div className="mt-3 space-y-1">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] transition-colors cursor-pointer"
            >
              <div>
                <div className="text-sm text-white/90">{project.name}</div>
                {project.identifier && (
                  <div className="text-xs text-white/40">{project.identifier}</div>
                )}
              </div>
              {project.issueCount !== undefined && (
                <div className="text-xs text-white/40">{project.issueCount} issues</div>
              )}
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function AICommandBar({
  workspaceId,
  projectId,
  issueId,
  context,
}: AICommandBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(AGENTS[0]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (isFullScreen) {
          setIsFullScreen(false);
        } else if (isExpanded) {
          setIsExpanded(false);
        }
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isFullScreen]);

  // Listen for open-ai-chat event
  useEffect(() => {
    const handleOpenAIChat = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('open-ai-chat', handleOpenAIChat);
    return () => window.removeEventListener('open-ai-chat', handleOpenAIChat);
  }, []);

  // Handle issue selection from UI components
  const handleIssueSelect = useCallback((issue: IssueData) => {
    // Navigate to issue or show details
    window.open(`/issue/${issue.id}`, '_blank');
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsExpanded(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          workspaceId,
          projectId,
          issueId,
          agentName: selectedAgent.name,
          context,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      if (data.sessionId && !sessionId) setSessionId(data.sessionId);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          agent: selectedAgent,
          timestamp: new Date(),
          ui: data.ui,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          agent: selectedAgent,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, workspaceId, projectId, issueId, selectedAgent, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
    setIsExpanded(false);
  };

  const adjustHeight = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className={cn(
        'fixed z-50 transition-all duration-300 ease-out',
        isFullScreen
          ? 'inset-4 md:inset-8 lg:inset-16'
          : 'bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl'
      )}
    >
      <motion.div
        layout
        className={cn(
          'relative rounded-2xl',
          'bg-[#0a0a0a]/90 backdrop-blur-xl',
          'border border-white/[0.08]',
          'shadow-2xl shadow-black/50'
        )}
      >
        {/* Chat Area */}
        <AnimatePresence>
          {(isExpanded || isFullScreen) && hasMessages && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: isFullScreen ? 'calc(100vh - 200px)' : 400 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{selectedAgent.avatar}</span>
                  <span className="text-sm text-white/70">{selectedAgent.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={clearChat}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                    title="Clear chat"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                    title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullScreen ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsExpanded(false);
                      setIsFullScreen(false);
                    }}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                    title="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea
                className={cn('px-4 py-4', isFullScreen ? 'h-[calc(100%-52px)]' : 'h-[348px]')}
                ref={scrollAreaRef}
              >
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div key={msg.id}>
                      <div
                        className={cn(
                          'flex gap-3',
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.role === 'assistant' && (
                          <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-sm shrink-0">
                            {msg.agent?.avatar || '🤖'}
                          </div>
                        )}
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                            msg.role === 'user'
                              ? 'bg-white/10 text-white'
                              : 'bg-white/[0.03] text-white/80 border border-white/[0.04]'
                          )}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        </div>
                      </div>

                      {/* Render UI components for assistant messages */}
                      {msg.role === 'assistant' && msg.ui && msg.ui.length > 0 && (
                        <div className="ml-10 mt-2">
                          {msg.ui.map((component, idx) => (
                            <UIComponentRenderer
                              key={idx}
                              component={component}
                              onIssueSelect={handleIssueSelect}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-sm">
                        {selectedAgent.avatar}
                      </div>
                      <div className="bg-white/[0.03] border border-white/[0.04] rounded-2xl px-4 py-3">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Bar */}
        <div className="p-3">
          <div
            className={cn(
              'flex items-end gap-2 rounded-xl',
              'bg-white/[0.03] border border-white/[0.06]',
              'focus-within:border-white/[0.12] focus-within:bg-white/[0.04]',
              'transition-all duration-200'
            )}
          >
            {/* Plus button */}
            <button
              className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ml-1 my-1',
                'text-white/40 hover:text-white/70 hover:bg-white/5',
                'transition-colors'
              )}
            >
              <Plus className="h-4 w-4" />
            </button>

            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => !hasMessages && setIsExpanded(false)}
              placeholder="Describe what you want to do..."
              rows={1}
              className={cn(
                'flex-1 bg-transparent border-0 resize-none',
                'text-sm text-white placeholder:text-white/30',
                'py-2.5 focus:outline-none focus:ring-0',
                'min-h-[36px] max-h-[120px]'
              )}
            />

            {/* Agent avatars */}
            <div className="flex items-center gap-1 px-1 py-1.5">
              {AGENTS.map((agent) => (
                <AgentButton
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgent.id === agent.id}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/[0.06] my-auto" />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mr-1 my-1',
                'transition-all duration-200',
                input.trim() && !isLoading
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'text-white/20 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Keyboard hint */}
        <div className="flex items-center justify-center gap-3 pb-2 -mt-1">
          <span className="text-[10px] text-white/20">
            <kbd className="px-1 py-0.5 rounded bg-white/5 font-mono text-[9px]">⌘J</kbd> focus
          </span>
          <span className="text-[10px] text-white/20">
            <kbd className="px-1 py-0.5 rounded bg-white/5 font-mono text-[9px]">↵</kbd> send
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default AICommandBar;
