'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/ui/page-layout';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import ShadowListGroup from '@/components/ui/shadow-list-group';
import {
  Activity,
  Key,
  MessageSquare,
  Brain,
  Cpu,
  Clock,
  Wifi,
  WifiOff,
  Database,
  FileText,
  Bot,
  Bell,
  GitBranch,
  Search,
  ChevronRight,
  ArrowLeft,
  Hash,
  Sparkles,
  Shield,
} from 'lucide-react';
import { useCoclawStatus } from '@/context/AIContext';
import AIKeyManager from '@/components/coclaw/AIKeyManager';
import ChannelManager from '@/components/coclaw/ChannelManager';
import GitHubIntegration from '@/components/coclaw/GitHubIntegration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContextEntry {
  id: string;
  title: string;
  content?: string;
  fullContent?: string;
  type?: string;
  scope?: string;
  isAiContext?: boolean;
  priority?: number;
  tags?: Array<{ id: string; name: string; color?: string | null }>;
  createdAt: string;
  updatedAt: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: { content: string; role: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationMessage {
  id: string;
  content: string;
  role: string;
  status: string;
  created_at: string;
  conversation_id: string | null;
  metadata?: Record<string, unknown>;
}

interface CoclawActivity {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'bg-emerald-500';
    case 'STARTING':
      return 'bg-amber-500';
    case 'ERROR':
      return 'bg-red-500';
    default:
      return 'bg-collab-600';
  }
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function memoryTypeBadge(type?: string): { label: string; className: string } {
  switch (type) {
    case 'ARCHITECTURE':
      return { label: 'Architecture', className: 'bg-violet-500/20 text-violet-300 border-violet-500/30' };
    case 'GENERAL':
      return { label: 'General', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    default:
      return { label: type || 'Memory', className: 'bg-collab-700/50 text-collab-300 border-collab-600' };
  }
}

// ---------------------------------------------------------------------------
// Overview Tab — Redesigned with StatCards
// ---------------------------------------------------------------------------

function OverviewTab({ workspaceId }: { workspaceId: string }) {
  const { status, isRunning, instanceStatus, gateway } = useCoclawStatus();

  if (!status) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-collab-800 border border-collab-700">
              <Skeleton className="h-4 w-20 mb-3 bg-collab-700" />
              <Skeleton className="h-8 w-28 bg-collab-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const inst = status.instance;

  return (
    <div className="space-y-6">
      {/* Stat Cards Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Instance Status"
          value={instanceStatus}
          variant={isRunning ? 'success' : 'warning'}
          icon={<Cpu className="h-4 w-4" />}
        />
        <StatCard
          label="Connection"
          value={gateway?.provider || 'Not connected'}
          variant={gateway?.provider ? 'info' : 'default'}
          icon={isRunning ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        />
        <StatCard
          label="Uptime"
          value={formatUptime(gateway?.uptime_seconds)}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Memory"
          value={gateway?.memory_backend || 'collab'}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          label="MCP Tools"
          value={gateway?.paired ? 'Connected' : 'Pending'}
          variant={gateway?.paired ? 'success' : 'default'}
          icon={<Activity className="h-4 w-4" />}
        />
        <div className="p-5 rounded-2xl bg-collab-800 border border-collab-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-collab-500"><MessageSquare className="h-4 w-4" /></span>
            <span className="text-xs text-collab-500">Channels</span>
          </div>
          {gateway?.channels ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Object.entries(gateway.channels).map(([name, active]) => (
                <Badge
                  key={name}
                  variant={active ? 'default' : 'outline'}
                  className="text-xs capitalize"
                >
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-collab-500">None</p>
          )}
        </div>
      </div>

      {/* Instance Details */}
      {inst.pid && (
        <div className="p-4 rounded-xl bg-collab-800/50 border border-collab-700/50">
          <div className="flex items-center gap-4 text-xs text-collab-500">
            <span>PID: <span className="text-collab-300 font-mono">{inst.pid}</span></span>
            <span>Port: <span className="text-collab-300 font-mono">{inst.port}</span></span>
            {inst.apiKeySource && (
              <span>Key: <span className="text-collab-300">{inst.apiKeySource === 'user' ? 'Your key' : 'System fallback'}</span></span>
            )}
            {gateway?.model && (
              <span>Model: <span className="text-collab-300">{gateway.model}</span></span>
            )}
            {inst.startedAt && (
              <span>Started: <span className="text-collab-300">{new Date(inst.startedAt).toLocaleString()}</span></span>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {inst.lastError && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/50">
          <p className="text-sm text-red-400">
            <span className="font-medium">Last error:</span> {inst.lastError}
          </p>
        </div>
      )}

      {/* Recent Activity */}
      <ActivityFeed workspaceId={workspaceId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Tab — Fixed to use coclaw memory API
// ---------------------------------------------------------------------------

function MemoryTab({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadMemories = useCallback(async (searchQuery?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/memory?${params}`,
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.memories || []);
        setTotal(data.total || 0);
      }
    } catch {
      // Silently fail — memory browser is informational
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleSearch = () => {
    loadMemories(search || undefined);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-collab-800 border border-collab-700">
          <Skeleton className="h-9 w-full bg-collab-700" />
        </div>
        <ShadowListGroup>
          {[1, 2, 3, 4, 5].map((i) => (
            <ShadowListGroup.Item key={i}>
              <Skeleton className="h-4 w-48 mb-2 bg-collab-700" />
              <Skeleton className="h-3 w-full bg-collab-700" />
            </ShadowListGroup.Item>
          ))}
        </ShadowListGroup>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-collab-500" />
          <input
            type="text"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-collab-800 border border-collab-700 text-sm text-white placeholder:text-collab-500 focus:outline-none focus:ring-1 focus:ring-collab-500 focus:border-collab-500"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearch}
          className="px-4 rounded-xl"
        >
          Search
        </Button>
      </div>

      {/* Count */}
      {total > 0 && (
        <p className="text-xs text-collab-500">{total} memories stored</p>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<Brain className="h-8 w-8 text-collab-500" />}
          title="No memories yet"
          description="Coclaw will store important context, decisions, and architecture notes here as you interact with it. Only meaningful memories appear — not raw messages."
        />
      ) : (
        <ShadowListGroup>
          {entries.map((entry) => {
            const badge = memoryTypeBadge(entry.type);
            const isExpanded = expandedId === entry.id;

            return (
              <ShadowListGroup.Item key={entry.id}>
                <div
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-white truncate">
                          {entry.title}
                        </span>
                      </div>
                      <p className="text-xs text-collab-500 line-clamp-2">
                        {entry.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] border ${badge.className}`}
                      >
                        {badge.label}
                      </Badge>
                      {entry.priority && entry.priority > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                          P{entry.priority}
                        </Badge>
                      )}
                      <span className="text-[10px] text-collab-600">
                        {formatRelativeTime(entry.updatedAt)}
                      </span>
                      <ChevronRight className={`h-3.5 w-3.5 text-collab-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Tags */}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {entry.tags.map((tag) => (
                        <Badge key={tag.id} variant="outline" className="text-[10px] px-1.5">
                          <Hash className="h-2.5 w-2.5 mr-0.5" />
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && entry.fullContent && (
                  <div className="mt-3 pt-3 border-t border-collab-700">
                    <pre className="text-xs text-collab-300 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                      {entry.fullContent}
                    </pre>
                  </div>
                )}
              </ShadowListGroup.Item>
            );
          })}
        </ShadowListGroup>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversations Tab — Fixed to use coclaw conversations API
// ---------------------------------------------------------------------------

function ConversationsTab({ workspaceId }: { workspaceId: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/coclaw/conversations?limit=30`,
        );
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);
          setTotal(data.total || 0);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  // Load conversation messages when a conversation is selected
  useEffect(() => {
    if (!selectedConvo) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      setMessagesLoading(true);
      try {
        // Use the existing channel messages API with conversationId filter
        const res = await fetch(
          `/api/coclaw/channel/${encodeURIComponent('current')}/messages?workspaceId=${workspaceId}&conversationId=${selectedConvo}&status=all&limit=100`,
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch {
        // Silently fail
      } finally {
        setMessagesLoading(false);
      }
    }
    loadMessages();
  }, [selectedConvo, workspaceId]);

  if (loading) {
    return (
      <ShadowListGroup>
        {[1, 2, 3].map((i) => (
          <ShadowListGroup.Item key={i}>
            <Skeleton className="h-4 w-48 mb-2 bg-collab-700" />
            <Skeleton className="h-3 w-64 bg-collab-700" />
          </ShadowListGroup.Item>
        ))}
      </ShadowListGroup>
    );
  }

  // Conversation detail view
  if (selectedConvo) {
    const convo = conversations.find((c) => c.id === selectedConvo);

    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={() => setSelectedConvo(null)}
          className="flex items-center gap-2 text-sm text-collab-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to conversations
        </button>

        {/* Conversation header */}
        <div className="p-4 rounded-xl bg-collab-800 border border-collab-700">
          <h3 className="text-sm font-medium text-white truncate">
            {convo?.title || 'Conversation'}
          </h3>
          <p className="text-xs text-collab-500 mt-1">
            {convo?.messageCount || 0} messages · Started {convo?.createdAt ? formatRelativeTime(convo.createdAt) : ''}
          </p>
        </div>

        {/* Messages */}
        {messagesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-collab-800/50">
                <Skeleton className="h-3 w-16 mb-2 bg-collab-700" />
                <Skeleton className="h-4 w-full bg-collab-700" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8 text-collab-500" />}
            title="No messages loaded"
            description="Messages could not be loaded for this conversation."
          />
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl ${
                  msg.role === 'assistant'
                    ? 'bg-violet-950/20 border border-violet-800/30'
                    : 'bg-collab-800/50 border border-collab-700/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {msg.role === 'assistant' ? (
                    <Bot className="h-3.5 w-3.5 text-violet-400" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 text-collab-400" />
                  )}
                  <span className="text-[10px] font-medium text-collab-400 uppercase tracking-wide">
                    {msg.role === 'assistant' ? 'Coclaw' : 'You'}
                  </span>
                  <span className="text-[10px] text-collab-600">
                    {formatRelativeTime(msg.created_at)}
                  </span>
                </div>
                <div className="text-sm text-collab-200 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Conversation list view
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-8 w-8 text-collab-500" />}
        title="No conversations yet"
        description="Start chatting with Coclaw to see your conversation history here. Messages from all channels (Telegram, web UI, etc.) will be grouped by thread."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-collab-500">{total} conversations</p>

      <ShadowListGroup>
        {conversations.map((convo) => (
          <ShadowListGroup.Item key={convo.id}>
            <div
              className="cursor-pointer group"
              onClick={() => setSelectedConvo(convo.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-white truncate block group-hover:text-collab-200 transition-colors">
                    {convo.title}
                  </span>
                  {convo.lastMessage && (
                    <p className="text-xs text-collab-500 mt-1 truncate">
                      {convo.lastMessage.role === 'assistant' ? 'Coclaw: ' : 'You: '}
                      {convo.lastMessage.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px]">
                    {convo.messageCount} msgs
                  </Badge>
                  <span className="text-[10px] text-collab-600">
                    {formatRelativeTime(convo.updatedAt)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-collab-600 group-hover:text-collab-400 transition-colors" />
                </div>
              </div>
            </div>
          </ShadowListGroup.Item>
        ))}
      </ShadowListGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed — Redesigned with ShadowListGroup
// ---------------------------------------------------------------------------

function activityIcon(type: string) {
  switch (type) {
    case 'COCLAW_RESPONSE':      return <MessageSquare className="h-3.5 w-3.5 text-violet-400" />;
    case 'COCLAW_TOOL_ACTION':   return <Activity className="h-3.5 w-3.5 text-blue-400" />;
    case 'COCLAW_CHANNEL_EVENT': return <Bell className="h-3.5 w-3.5 text-amber-400" />;
    case 'COCLAW_MEMORY_UPDATE': return <Brain className="h-3.5 w-3.5 text-emerald-400" />;
    case 'COCLAW_ERROR':         return <Cpu className="h-3.5 w-3.5 text-red-400" />;
    default:                     return <Bot className="h-3.5 w-3.5 text-collab-400" />;
  }
}

function activityLabel(type: string): string {
  switch (type) {
    case 'COCLAW_RESPONSE':      return 'Response';
    case 'COCLAW_TOOL_ACTION':   return 'Tool Action';
    case 'COCLAW_CHANNEL_EVENT': return 'Channel Event';
    case 'COCLAW_MEMORY_UPDATE': return 'Memory Update';
    case 'COCLAW_ERROR':         return 'Error';
    default:                     return 'Activity';
  }
}

function ActivityFeed({ workspaceId }: { workspaceId: string }) {
  const [activities, setActivities] = useState<CoclawActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/notifications?limit=10`);
        if (res.ok && mounted) {
          const data = await res.json();
          setActivities(data.activity || []);
        }
      } catch {
        // Silently fail — activity feed is informational
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    // Mark all as read when user views the overview tab
    fetch(`/api/workspaces/${workspaceId}/coclaw/notifications`, { method: 'POST' }).catch(() => {});

    return () => { mounted = false; };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-collab-500 uppercase tracking-wide">Recent Activity</h3>
        <ShadowListGroup>
          {[1, 2, 3].map((i) => (
            <ShadowListGroup.Item key={i}>
              <Skeleton className="h-10 w-full bg-collab-700" />
            </ShadowListGroup.Item>
          ))}
        </ShadowListGroup>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-collab-500 uppercase tracking-wide">Recent Activity</h3>

      {activities.length === 0 ? (
        <div className="p-6 rounded-2xl bg-collab-800 border border-collab-700 text-center">
          <p className="text-sm text-collab-500">
            No recent activity — Coclaw actions will appear here
          </p>
        </div>
      ) : (
        <ShadowListGroup>
          {activities.map((a) => (
            <ShadowListGroup.Item key={a.id}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{activityIcon(a.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {activityLabel(a.type)}
                    </Badge>
                    <span className="text-[10px] text-collab-600">
                      {formatRelativeTime(a.createdAt)}
                    </span>
                    {!a.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <p className="text-xs text-collab-300 mt-1 line-clamp-2">{a.content}</p>
                </div>
              </div>
            </ShadowListGroup.Item>
          ))}
        </ShadowListGroup>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard — Redesigned with PageLayout + PageHeader
// ---------------------------------------------------------------------------

interface CoclawDashboardProps {
  workspaceId: string;
}

export default function CoclawDashboard({ workspaceId }: CoclawDashboardProps) {
  const { isRunning, instanceStatus } = useCoclawStatus();

  return (
    <PageLayout>
      <PageHeader
        title="Coclaw"
        subtitle="Your personal AI agent — manages tasks, channels, and memory autonomously"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusColor(instanceStatus)} ${isRunning ? 'animate-pulse' : ''}`} />
              <span className="text-xs text-collab-400">{instanceStatus}</span>
            </div>
          </div>
        }
      />

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-collab-800 border border-collab-700 rounded-xl p-1">
          <TabsTrigger
            value="overview"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="keys"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <Key className="h-3.5 w-3.5 mr-1.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger
            value="github"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <GitBranch className="h-3.5 w-3.5 mr-1.5" />
            GitHub
          </TabsTrigger>
          <TabsTrigger
            value="channels"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Channels
          </TabsTrigger>
          <TabsTrigger
            value="memory"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            Memory
          </TabsTrigger>
          <TabsTrigger
            value="conversations"
            className="rounded-lg data-[state=active]:bg-collab-700 data-[state=active]:text-white text-collab-400 text-sm"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="keys">
          <AIKeyManager workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="channels">
          <ChannelManager workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="github">
          <GitHubIntegration workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="memory">
          <MemoryTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="conversations">
          <ConversationsTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
