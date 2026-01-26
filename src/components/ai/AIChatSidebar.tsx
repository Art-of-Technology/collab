'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, X, Loader2, Sparkles, ChevronDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';

// Types
interface AIAgent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  description: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: AIAgent;
  timestamp: Date;
}

interface AIChatSidebarProps {
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

// Default agents (will be fetched from API)
const DEFAULT_AGENTS: AIAgent[] = [
  { id: 'default-alex', name: 'Alex', avatar: '🤖', role: 'assistant', description: 'General assistant' },
  { id: 'default-scout', name: 'Scout', avatar: '🔍', role: 'analyst', description: 'Data analyst' },
  { id: 'default-rex', name: 'Rex', avatar: '👁️', role: 'reviewer', description: 'Code reviewer' },
  { id: 'default-sage', name: 'Sage', avatar: '📋', role: 'planner', description: 'Sprint planner' },
  { id: 'default-quinn', name: 'Quinn', avatar: '✍️', role: 'writer', description: 'Technical writer' },
];

export function AIChatSidebar({
  workspaceId,
  projectId,
  issueId,
  context,
}: AIChatSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(DEFAULT_AGENTS[0]);
  const [agents, setAgents] = useState<AIAgent[]>(DEFAULT_AGENTS);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available agents
  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch(`/api/ai/chat?workspaceId=${workspaceId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.agents && data.agents.length > 0) {
            setAgents(data.agents);
            setSelectedAgent(data.agents[0]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error);
      }
    }
    fetchAgents();
  }, [workspaceId]);

  // Listen for open-ai-chat event from command menu
  useEffect(() => {
    const handleOpenAIChat = () => {
      setIsOpen(true);
    };
    window.addEventListener('open-ai-chat', handleOpenAIChat);
    return () => window.removeEventListener('open-ai-chat', handleOpenAIChat);
  }, []);

  // Listen for keyboard shortcut (Cmd+J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle sending message
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

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      // Update session ID if provided
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        agent: data.agent || selectedAgent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        agent: selectedAgent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, workspaceId, projectId, issueId, selectedAgent, context]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Clear conversation
  const clearConversation = () => {
    setMessages([]);
    setSessionId(null);
  };

  return (
    <>
      {/* Floating trigger button */}
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
        size="icon"
      >
        <Sparkles className="h-6 w-6" />
      </Button>

      {/* Chat sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] sm:max-w-[420px] p-0 flex flex-col"
        >
          {/* Header */}
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xl">
                  {selectedAgent.avatar}
                </div>
                <div>
                  <SheetTitle className="text-base">{selectedAgent.name}</SheetTitle>
                  <p className="text-xs text-muted-foreground">{selectedAgent.description}</p>
                </div>
              </div>

              {/* Agent selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {agents.map((agent) => (
                    <DropdownMenuItem
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className="flex items-center gap-2"
                    >
                      <span>{agent.avatar}</span>
                      <span>{agent.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {agent.role}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SheetHeader>

          {/* Context indicator */}
          {context && (context.projectName || context.issueName) && (
            <div className="px-4 py-2 bg-muted/50 border-b text-xs text-muted-foreground">
              <span className="font-medium">Context: </span>
              {context.projectName && <span>{context.projectName}</span>}
              {context.issueName && (
                <>
                  <span> / </span>
                  <span>{context.issueName}</span>
                </>
              )}
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <Bot className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm font-medium">Hi! I'm {selectedAgent.name}</p>
                <p className="text-xs mt-1 max-w-[250px]">
                  {selectedAgent.description}. How can I help you today?
                </p>
                <div className="mt-6 space-y-2">
                  <p className="text-xs font-medium">Try asking:</p>
                  <div className="flex flex-col gap-2">
                    {[
                      'Create a bug for the login issue',
                      'What issues are blocking the release?',
                      'Summarize this week\'s progress',
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="text-xs h-auto py-2 px-3"
                        onClick={() => {
                          setInput(suggestion);
                          textareaRef.current?.focus();
                        }}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className={cn(
                          'text-sm',
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        )}
                      >
                        {message.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          message.agent?.avatar || '🤖'
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 max-w-[85%]',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <p className="text-[10px] opacity-50 mt-1">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-muted">
                        {selectedAgent.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="p-4 border-t">
            {messages.length > 0 && (
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearConversation}
                  className="text-xs h-6 px-2"
                >
                  Clear conversation
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedAgent.name}...`}
                className="min-h-[44px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default AIChatSidebar;
