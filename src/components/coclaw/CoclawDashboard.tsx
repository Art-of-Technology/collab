'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import { useCoclawStatus } from '@/context/AIContext';
import AIKeyManager from '@/components/coclaw/AIKeyManager';
import ChannelManager from '@/components/coclaw/ChannelManager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContextEntry {
  id: string;
  title: string;
  excerpt?: string;
  category?: string;
  scope?: string;
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

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'RUNNING':
      return 'default';
    case 'STARTING':
      return 'secondary';
    case 'ERROR':
      return 'destructive';
    default:
      return 'outline';
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

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ workspaceId }: { workspaceId: string }) {
  const { status, isRunning, instanceStatus, gateway } = useCoclawStatus();

  if (!status) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-collab-900 border-collab-700">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24 bg-collab-800" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 bg-collab-800" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const inst = status.instance;

  return (
    <div className="space-y-6">
      {/* Status Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Runtime Status */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5" />
              Instance Status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${statusColor(instanceStatus)} animate-pulse`} />
              <span className="text-lg font-semibold text-white">{instanceStatus}</span>
              <Badge variant={statusBadgeVariant(instanceStatus)} className="ml-auto text-xs">
                {isRunning ? 'Online' : 'Offline'}
              </Badge>
            </div>
            {inst.pid ? (
              <p className="text-xs text-collab-500 mt-2">PID: {inst.pid} · Port: {inst.port}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Connection */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              {isRunning ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              Connection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-white">
              {gateway?.provider ? `${gateway.provider}` : 'Not connected'}
            </p>
            {gateway?.model && (
              <p className="text-xs text-collab-500 mt-1">Model: {gateway.model}</p>
            )}
            {inst.apiKeySource && (
              <p className="text-xs text-collab-500 mt-1">
                Key: {inst.apiKeySource === 'user' ? 'Your key' : 'System fallback'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Uptime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-white">
              {formatUptime(gateway?.uptime_seconds)}
            </p>
            {inst.startedAt && (
              <p className="text-xs text-collab-500 mt-1">
                Started: {new Date(inst.startedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Memory */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              <Database className="h-3.5 w-3.5" />
              Memory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-white">
              {gateway?.memory_backend || 'collab'}
            </p>
            <p className="text-xs text-collab-500 mt-1">Vector-backed context storage</p>
          </CardContent>
        </Card>

        {/* MCP */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              MCP Tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-white">
              {gateway?.paired ? 'Connected' : 'Pending'}
            </p>
            <p className="text-xs text-collab-500 mt-1">Collab workspace tools</p>
          </CardContent>
        </Card>

        {/* Channels */}
        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="pb-2">
            <CardDescription className="text-collab-500 flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gateway?.channels ? (
              <div className="flex flex-wrap gap-1.5">
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
              <p className="text-sm text-collab-500">No channels configured</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Banner */}
      {inst.lastError && (
        <Card className="bg-red-950/30 border-red-800/50">
          <CardContent className="pt-4">
            <p className="text-sm text-red-400">
              <span className="font-medium">Last error:</span> {inst.lastError}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <ActivityFeed workspaceId={workspaceId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Tab
// ---------------------------------------------------------------------------

function MemoryTab({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/notes?limit=20&workspaceId=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          setEntries(
            (data.notes || data.context || []).map((n: any) => ({
              id: n.id,
              title: n.title || 'Untitled',
              excerpt: n.excerpt || n.content?.substring(0, 120) || '',
              category: n.category,
              scope: n.scope,
              createdAt: n.createdAt,
              updatedAt: n.updatedAt,
            })),
          );
        }
      } catch {
        // Silently fail — memory browser is informational
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="bg-collab-900 border-collab-700">
            <CardContent className="pt-4">
              <Skeleton className="h-4 w-48 mb-2 bg-collab-800" />
              <Skeleton className="h-3 w-full bg-collab-800" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="bg-collab-900 border-collab-700">
        <CardContent className="py-12 text-center">
          <Brain className="h-12 w-12 text-collab-600 mx-auto mb-4" />
          <p className="text-collab-400 font-medium">No memories yet</p>
          <p className="text-collab-500 text-sm mt-1">
            Coclaw will store context here as you interact with it
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-collab-500 mb-3">{entries.length} context entries</p>
      {entries.map((entry) => (
        <Card key={entry.id} className="bg-collab-900 border-collab-700 hover:border-collab-600 transition-colors">
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-collab-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-white truncate">{entry.title}</span>
                </div>
                {entry.excerpt && (
                  <p className="text-xs text-collab-500 mt-1 line-clamp-2">{entry.excerpt}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {entry.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {entry.category}
                  </Badge>
                )}
                <span className="text-[10px] text-collab-600">
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversations Tab
// ---------------------------------------------------------------------------

function ConversationsTab({ workspaceId }: { workspaceId: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/ai/conversations?workspaceId=${workspaceId}&agentSlug=coclaw&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
          setConversations(
            (data.conversations || []).map((c: any) => ({
              id: c.id,
              title: c.title || 'Untitled',
              messageCount: c.messageCount || 0,
              lastMessage: c.lastMessage,
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
            })),
          );
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-collab-900 border-collab-700">
            <CardContent className="pt-4">
              <Skeleton className="h-4 w-48 mb-2 bg-collab-800" />
              <Skeleton className="h-3 w-64 bg-collab-800" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card className="bg-collab-900 border-collab-700">
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-12 w-12 text-collab-600 mx-auto mb-4" />
          <p className="text-collab-400 font-medium">No conversations yet</p>
          <p className="text-collab-500 text-sm mt-1">
            Start chatting with Coclaw using the AI assistant
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-collab-500 mb-3">{conversations.length} conversations</p>
      {conversations.map((convo) => (
        <Card key={convo.id} className="bg-collab-900 border-collab-700 hover:border-collab-600 transition-colors">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-white truncate block">{convo.title}</span>
                {convo.lastMessage && (
                  <p className="text-xs text-collab-500 mt-1 truncate">
                    {convo.lastMessage.role === 'assistant' ? 'Coclaw: ' : 'You: '}
                    {convo.lastMessage.content.substring(0, 100)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant="outline" className="text-[10px]">
                  {convo.messageCount} msgs
                </Badge>
                <span className="text-[10px] text-collab-600">
                  {new Date(convo.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed (for Overview tab)
// ---------------------------------------------------------------------------

interface CoclawActivity {
  id: string;
  type: string;
  content: string;
  read: boolean;
  createdAt: string;
}

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
      <Card className="bg-collab-900 border-collab-700">
        <CardHeader className="pb-2">
          <CardDescription className="text-collab-500 flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            Recent Activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full bg-collab-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-collab-900 border-collab-700">
      <CardHeader className="pb-2">
        <CardDescription className="text-collab-500 flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" />
          Recent Activity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-collab-500 py-4 text-center">
            No recent activity — Coclaw actions will appear here
          </p>
        ) : (
          <div className="space-y-2">
            {activities.map((a) => (
              <div
                key={a.id}
                className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ${
                  a.read ? 'bg-collab-950/50' : 'bg-collab-800/40 border border-collab-700'
                }`}
              >
                <div className="mt-0.5">{activityIcon(a.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {activityLabel(a.type)}
                    </Badge>
                    <span className="text-[10px] text-collab-600">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-collab-300 mt-1 line-clamp-2">{a.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

interface CoclawDashboardProps {
  workspaceId: string;
}

export default function CoclawDashboard({ workspaceId }: CoclawDashboardProps) {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-white">Coclaw</h1>
        </div>
        <p className="text-sm text-collab-500 ml-11">
          Your personal AI agent — manages tasks, channels, and memory autonomously
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-collab-900 border border-collab-700">
          <TabsTrigger value="overview" className="data-[state=active]:bg-collab-800 data-[state=active]:text-white text-collab-400">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="keys" className="data-[state=active]:bg-collab-800 data-[state=active]:text-white text-collab-400">
            <Key className="h-3.5 w-3.5 mr-1.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="channels" className="data-[state=active]:bg-collab-800 data-[state=active]:text-white text-collab-400">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Channels
          </TabsTrigger>
          <TabsTrigger value="memory" className="data-[state=active]:bg-collab-800 data-[state=active]:text-white text-collab-400">
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="conversations" className="data-[state=active]:bg-collab-800 data-[state=active]:text-white text-collab-400">
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

        <TabsContent value="memory">
          <MemoryTab workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="conversations">
          <ConversationsTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
