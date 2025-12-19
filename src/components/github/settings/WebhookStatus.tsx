'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  ExternalLink,
  Shield,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface WebhookEvent {
  id: string;
  event: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  payload?: string;
}

interface WebhookStatusProps {
  repositoryId: string;
  repositoryUrl?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  isConnected: boolean;
}

const SUPPORTED_EVENTS = [
  { name: 'push', description: 'Commits pushed to branches', icon: '📤' },
  { name: 'pull_request', description: 'PR opened, closed, merged', icon: '🔀' },
  { name: 'release', description: 'New releases published', icon: '🏷️' },
  { name: 'create', description: 'Branches or tags created', icon: '🌿' },
  { name: 'delete', description: 'Branches or tags deleted', icon: '🗑️' },
];

export function WebhookStatus({
  repositoryId,
  repositoryUrl,
  webhookUrl,
  webhookSecret,
  isConnected,
}: WebhookStatusProps) {
  const [recentEvents, setRecentEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [webhookHealth, setWebhookHealth] = useState<'healthy' | 'warning' | 'error' | 'unknown'>('unknown');

  useEffect(() => {
    if (isConnected) {
      fetchRecentEvents();
    }
  }, [isConnected, repositoryId]);

  const fetchRecentEvents = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/github/repositories/${repositoryId}/webhook-events`);
      if (response.ok) {
        const data = await response.json();
        setRecentEvents(data.events || []);

        if (data.events?.length > 0) {
          const recentFailures = data.events.filter(
            (e: WebhookEvent) => e.status === 'failed'
          ).length;
          if (recentFailures === 0) {
            setWebhookHealth('healthy');
          } else if (recentFailures < 3) {
            setWebhookHealth('warning');
          } else {
            setWebhookHealth('error');
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch webhook events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(`/api/github/repositories/${repositoryId}/test-webhook`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success('Test webhook sent successfully');
        fetchRecentEvents();
      } else {
        toast.error('Failed to send test webhook');
      }
    } catch (error) {
      toast.error('Failed to test webhook');
    } finally {
      setIsTesting(false);
    }
  };

  const getHealthColor = () => {
    switch (webhookHealth) {
      case 'healthy': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-[#6e7681]';
    }
  };

  const getHealthIcon = () => {
    switch (webhookHealth) {
      case 'healthy': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-[#6e7681]" />;
    }
  };

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
        <p className="text-xs text-yellow-200">Connect a repository to configure webhooks</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Webhook Health Status */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              webhookHealth === 'healthy' && "bg-green-500/10",
              webhookHealth === 'warning' && "bg-yellow-500/10",
              webhookHealth === 'error' && "bg-red-500/10",
              webhookHealth === 'unknown' && "bg-[#161617]"
            )}>
              <Webhook className={cn("h-4 w-4", getHealthColor())} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-[#e6edf3]">Webhook Status</h3>
                {getHealthIcon()}
              </div>
              <p className="text-xs text-[#6e7681]">
                {webhookHealth === 'healthy' && 'All webhooks are working correctly'}
                {webhookHealth === 'warning' && 'Some webhook deliveries have failed'}
                {webhookHealth === 'error' && 'Multiple webhook failures detected'}
                {webhookHealth === 'unknown' && 'Waiting for webhook events'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRecentEvents}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTestWebhook}
              disabled={isTesting}
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Zap className="h-3.5 w-3.5 mr-1.5" />
              )}
              Test
            </Button>
          </div>
        </div>
      </div>

      {/* Webhook Configuration */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-xs font-medium text-[#e6edf3] flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-[#6e7681]" />
            Configuration
          </h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="px-3 py-2.5 rounded-md bg-[#161617] border border-[#1f1f1f]">
            <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1">Webhook URL</p>
            <code className="text-xs text-[#e6edf3] font-mono break-all">
              {webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/github/webhooks/events`}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2.5 rounded-md bg-[#161617] border border-[#1f1f1f]">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1">Content Type</p>
              <code className="text-xs text-[#e6edf3] font-mono">application/json</code>
            </div>

            <div className="px-3 py-2.5 rounded-md bg-[#161617] border border-[#1f1f1f]">
              <p className="text-[10px] text-[#6e7681] uppercase tracking-wide mb-1">Secret</p>
              <code className="text-xs text-[#e6edf3] font-mono">
                {webhookSecret ? '••••••••••••••••' : 'Not configured'}
              </code>
            </div>
          </div>

          {repositoryUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617] border border-[#1f1f1f]"
              asChild
            >
              <a
                href={`${repositoryUrl}/settings/hooks`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Manage on GitHub
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Supported Events */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-xs font-medium text-[#e6edf3]">Supported Events</h3>
          <p className="text-[10px] text-[#6e7681] mt-0.5">Events that trigger webhook notifications</p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {SUPPORTED_EVENTS.map(event => (
              <div
                key={event.name}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#161617] border border-[#1f1f1f]"
              >
                <span className="text-base">{event.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#e6edf3]">{event.name}</p>
                  <p className="text-[10px] text-[#6e7681] truncate">{event.description}</p>
                </div>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f1f1f]">
          <h3 className="text-xs font-medium text-[#e6edf3]">Recent Webhook Events</h3>
          <p className="text-[10px] text-[#6e7681] mt-0.5">
            Last {recentEvents.length} webhook deliveries
          </p>
        </div>
        <div className="p-4">
          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Clock className="h-6 w-6 text-[#6e7681] mb-2" />
              <p className="text-xs text-[#6e7681]">No webhook events yet</p>
              <p className="text-[10px] text-[#6e7681] mt-0.5">
                Events will appear here when GitHub sends webhooks
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#161617] border border-[#1f1f1f]"
                >
                  {event.status === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : event.status === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#e6edf3] font-mono">{event.event}</p>
                    <p className="text-[10px] text-[#6e7681]">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] h-5 px-1.5",
                      event.status === 'success' && "bg-green-500/10 text-green-400",
                      event.status === 'failed' && "bg-red-500/10 text-red-400",
                      event.status === 'pending' && "bg-yellow-500/10 text-yellow-400"
                    )}
                  >
                    {event.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
