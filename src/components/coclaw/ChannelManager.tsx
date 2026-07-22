'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  Loader2,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Radio,
  ExternalLink,
  Power,
  PowerOff,
  Search,
  Zap,
  Globe,
  Building2,
  Smartphone,
  Apple,
  Phone,
  Webhook,
  Mail,
  Hash,
  Github,
  MessageCircle,
  Signal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  SUPPORTED_CHANNELS,
  type ChannelMetadata,
  type ChannelFieldDef,
} from '@/lib/coclaw/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelStatus {
  channelType: string;
  enabled: boolean;
  status: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Channel Category Definitions
// ---------------------------------------------------------------------------

interface ChannelCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  types: string[];
}

const CHANNEL_CATEGORIES: ChannelCategory[] = [
  {
    id: 'popular',
    label: 'Popular',
    icon: <Zap className="h-4 w-4" />,
    types: ['telegram', 'discord', 'slack', 'whatsapp', 'github', 'email'],
  },
  {
    id: 'chat',
    label: 'Chat Platforms',
    icon: <MessageCircle className="h-4 w-4" />,
    types: ['matrix', 'signal', 'mattermost', 'irc', 'nostr'],
  },
  {
    id: 'enterprise',
    label: 'Enterprise & Team',
    icon: <Building2 className="h-4 w-4" />,
    types: ['lark', 'feishu', 'dingtalk', 'nextcloud_talk'],
  },
  {
    id: 'chinese',
    label: 'Chinese Messaging',
    icon: <Globe className="h-4 w-4" />,
    types: ['napcat', 'qq'],
  },
  {
    id: 'apple',
    label: 'Apple Messaging',
    icon: <Apple className="h-4 w-4" />,
    types: ['imessage', 'bluebubbles'],
  },
  {
    id: 'whatsapp_business',
    label: 'WhatsApp Business',
    icon: <Phone className="h-4 w-4" />,
    types: ['wati', 'whatsapp_web'],
  },
  {
    id: 'integration',
    label: 'Integrations',
    icon: <Webhook className="h-4 w-4" />,
    types: ['webhook', 'linq'],
  },
];

// ---------------------------------------------------------------------------
// Icons per channel type
// ---------------------------------------------------------------------------

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  telegram: <MessageSquare className="h-5 w-5" />,
  discord: <Hash className="h-5 w-5" />,
  slack: <MessageSquare className="h-5 w-5" />,
  whatsapp: <Phone className="h-5 w-5" />,
  matrix: <Radio className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  github: <Github className="h-5 w-5" />,
  signal: <Signal className="h-5 w-5" />,
  mattermost: <MessageCircle className="h-5 w-5" />,
  irc: <Hash className="h-5 w-5" />,
  nostr: <Radio className="h-5 w-5" />,
  lark: <Building2 className="h-5 w-5" />,
  feishu: <Building2 className="h-5 w-5" />,
  dingtalk: <Building2 className="h-5 w-5" />,
  nextcloud_talk: <MessageCircle className="h-5 w-5" />,
  napcat: <MessageSquare className="h-5 w-5" />,
  qq: <MessageSquare className="h-5 w-5" />,
  imessage: <Smartphone className="h-5 w-5" />,
  bluebubbles: <Smartphone className="h-5 w-5" />,
  wati: <Phone className="h-5 w-5" />,
  whatsapp_web: <Smartphone className="h-5 w-5" />,
  webhook: <Webhook className="h-5 w-5" />,
  linq: <Zap className="h-5 w-5" />,
};

// ---------------------------------------------------------------------------
// Field Renderer
// ---------------------------------------------------------------------------

function ChannelField({
  field,
  value,
  onChange,
  visibility,
  onToggleVisibility,
}: {
  field: ChannelFieldDef;
  value: string;
  onChange: (val: string) => void;
  visibility: boolean;
  onToggleVisibility: () => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
          className="rounded border-border"
        />
        {field.label}
        {field.description && (
          <span className="text-xs text-muted-foreground/60">{field.description}</span>
        )}
      </label>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{field.label}</label>
        <select
          value={value || (field.defaultValue as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const isSecret = field.type === 'password';

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <Input
          type={isSecret && !visibility ? 'password' : field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder || ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background/50 border-border/60 text-sm pr-10"
        />
        {isSecret && (
          <button
            type="button"
            onClick={onToggleVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {visibility ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {field.description && (
        <p className="text-xs text-muted-foreground/60">{field.description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel Card
// ---------------------------------------------------------------------------

function ChannelCard({
  channel,
  status,
  workspaceId,
  onRefresh,
}: {
  channel: ChannelMetadata;
  status: ChannelStatus | undefined;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>({});

  const isConfigured = !!status;
  const isEnabled = status?.enabled ?? false;
  const hasError = !!status?.lastError;

  // Initialize defaults for fields
  useEffect(() => {
    const defaults: Record<string, string> = {};
    for (const field of channel.fields) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = String(field.defaultValue);
      }
    }
    setFieldValues(defaults);
  }, [channel.fields]);

  const handleSave = async () => {
    // Validate required fields
    for (const field of channel.fields) {
      if (!field.required) continue;
      const val = fieldValues[field.key]?.trim();
      if (!val) {
        toast({
          title: 'Missing required field',
          description: `"${field.label}" is required.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Build config object, converting types appropriately
    const config: Record<string, unknown> = {};
    for (const field of channel.fields) {
      const raw = fieldValues[field.key];
      if (raw === undefined || raw === '') continue;

      if (field.type === 'boolean') {
        config[field.key] = raw === 'true';
      } else if (field.type === 'number') {
        config[field.key] = Number(raw);
      } else if (field.type === 'tags') {
        // Tags stored as comma-separated string
        config[field.key] = raw;
      } else {
        config[field.key] = raw;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: channel.type,
          config,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save channel config');
      }

      toast({
        title: 'Channel configured',
        description: `${channel.name} has been configured successfully.`,
      });

      // Clear inputs after save
      const defaults: Record<string, string> = {};
      for (const field of channel.fields) {
        if (field.defaultValue !== undefined) {
          defaults[field.key] = String(field.defaultValue);
        }
      }
      setFieldValues(defaults);
      setFieldVisibility({});
      setExpanded(false);
      onRefresh();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/channels/${channel.type}`,
        { method: 'DELETE' },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove channel');
      }

      toast({
        title: 'Channel removed',
        description: `${channel.name} configuration has been removed.`,
      });
      setExpanded(false);
      onRefresh();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove',
        variant: 'destructive',
      });
    } finally {
      setRemoving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/channels/${channel.type}/test`,
        { method: 'POST' },
      );
      if (res.ok) {
        setTestResult('success');
        toast({
          title: 'Connection successful',
          description: `${channel.name} is reachable and responding.`,
        });
      } else {
        setTestResult('error');
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Connection failed',
          description: data.error || `Could not connect to ${channel.name}.`,
          variant: 'destructive',
        });
      }
    } catch {
      setTestResult('error');
      toast({
        title: 'Connection failed',
        description: `Could not reach ${channel.name}. Check your configuration.`,
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
      // Clear test result after 5s
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  return (
    <Card className="border border-border/40 bg-card/50 transition-colors hover:border-border/60">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              {CHANNEL_ICONS[channel.type] || <MessageSquare className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-medium">{channel.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5 truncate">
                {channel.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isConfigured ? (
              <Badge
                variant="default"
                className={
                  hasError
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : isEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }
              >
                {hasError ? 'Error' : isEnabled ? 'Connected' : 'Disabled'}
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
              >
                Not configured
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {hasError && (
          <div className="flex items-start gap-2 mt-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>{status!.lastError}</p>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          <Separator className="mb-4 border-border/30" />

          {/* Setup guide for unconfigured channels */}
          {!isConfigured && channel.docsUrl && (
            <div className="flex items-start gap-2.5 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 mb-4">
              <ExternalLink className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-medium text-blue-300">Getting started</p>
                <p className="text-muted-foreground">
                  {channel.type === 'telegram' && 'Open Telegram, search for @BotFather, send /newbot and follow the steps to get your bot token.'}
                  {channel.type === 'discord' && 'Go to discord.com/developers/applications, create an app, add a Bot, copy the token, and invite it to your server.'}
                  {channel.type === 'slack' && 'Visit api.slack.com/apps, create an app, enable Socket Mode, add bot scopes, and install to your workspace.'}
                  {channel.type === 'whatsapp' && 'Set up a Meta Developer account, create a WhatsApp Business app, and get your API credentials from the dashboard.'}
                  {channel.type === 'github' && 'Go to github.com/settings/tokens, generate a token with repo scope, and optionally set up a webhook for real-time events.'}
                  {channel.type === 'email' && 'Use your email provider\'s IMAP/SMTP settings. For Gmail, enable "Less secure apps" or generate an App Password.'}
                  {channel.type === 'whatsapp_web' && 'WhatsApp Web connects directly to your phone\'s WhatsApp. After saving, a QR code will appear — scan it with WhatsApp on your phone. Alternatively, enter your phone number for pair code linking.'}
                  {!['telegram', 'discord', 'slack', 'whatsapp', 'whatsapp_web', 'github', 'email'].includes(channel.type) && `Visit the documentation to learn how to set up ${channel.name}.`}
                </p>
                <a
                  href={channel.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  View setup guide
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          {/* Configuration fields */}
          <div className="space-y-3">
            {channel.fields.map((field) => (
              <ChannelField
                key={field.key}
                field={field}
                value={fieldValues[field.key] ?? ''}
                onChange={(val) =>
                  setFieldValues((prev) => ({ ...prev, [field.key]: val }))
                }
                visibility={fieldVisibility[field.key] ?? false}
                onToggleVisibility={() =>
                  setFieldVisibility((prev) => ({
                    ...prev,
                    [field.key]: !prev[field.key],
                  }))
                }
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="ml-1.5">
                {isConfigured ? 'Update' : 'Connect'}
              </span>
            </Button>

            {isConfigured && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="gap-1.5"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : testResult === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  Test
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={removing}
                >
                  {removing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">Remove</span>
                </Button>
              </>
            )}

            {channel.docsUrl && (
              <a
                href={channel.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Docs
              </a>
            )}
          </div>

          {/* Last updated */}
          {isConfigured && status?.updatedAt && (
            <p className="text-xs text-muted-foreground mt-3">
              Last updated:{' '}
              {new Date(status.updatedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Category Section
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  channels,
  statuses,
  workspaceId,
  onRefresh,
  defaultOpen,
}: {
  category: ChannelCategory;
  channels: ChannelMetadata[];
  statuses: ChannelStatus[];
  workspaceId: string;
  onRefresh: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const configuredCount = channels.filter((ch) =>
    statuses.some((s) => s.channelType === ch.type),
  ).length;

  // Sort: configured channels first
  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const aConfigured = statuses.some((s) => s.channelType === a.type) ? 0 : 1;
      const bConfigured = statuses.some((s) => s.channelType === b.type) ? 0 : 1;
      return aConfigured - bConfigured;
    });
  }, [channels, statuses]);

  if (channels.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
            {category.icon}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">{category.label}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {channels.length} channel{channels.length !== 1 ? 's' : ''}
            </span>
          </div>
          {configuredCount > 0 && (
            <Badge
              variant="default"
              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs"
            >
              {configuredCount} connected
            </Badge>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              open ? '' : '-rotate-90'
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pl-2 pt-2 pb-1">
          {sortedChannels.map((channel) => {
            const status = statuses.find((c) => c.channelType === channel.type);
            return (
              <ChannelCard
                key={channel.type}
                channel={channel}
                status={status}
                workspaceId={workspaceId}
                onRefresh={onRefresh}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ChannelManagerProps {
  workspaceId: string;
}

export default function ChannelManager({ workspaceId }: ChannelManagerProps) {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/channels`);
      if (!res.ok) throw new Error('Failed to fetch channels');
      const data = await res.json();
      setChannels(data.channels ?? []);
    } catch {
      // Silently fail — channels will show as not configured
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchChannels().finally(() => setLoading(false));
  }, [fetchChannels]);

  // Build channel lookup
  const channelMap = useMemo(() => {
    const map = new Map<string, ChannelMetadata>();
    for (const ch of SUPPORTED_CHANNELS) {
      map.set(ch.type, ch);
    }
    return map;
  }, []);

  // Filter channels by search query
  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return CHANNEL_CATEGORIES.map((cat) => {
      const catChannels = cat.types
        .map((t) => channelMap.get(t))
        .filter((ch): ch is ChannelMetadata => {
          if (!ch) return false;
          if (!query) return true;
          return (
            ch.name.toLowerCase().includes(query) ||
            ch.type.toLowerCase().includes(query) ||
            ch.description.toLowerCase().includes(query)
          );
        });
      return { ...cat, channels: catChannels };
    }).filter((cat) => cat.channels.length > 0);
  }, [searchQuery, channelMap]);

  // Summary stats
  const configuredTotal = channels.length;
  const errorCount = channels.filter((c) => c.lastError).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with stats & search */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <MessageSquare className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground flex-1 min-w-0">
          <p className="font-medium text-foreground mb-1">
            Connect your messaging channels
          </p>
          <p>
            Configure channels so your Coclaw agent can send and receive messages
            via Telegram, Discord, Slack, WhatsApp, and more. You can also
            configure channels by chatting with Coclaw directly.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm text-muted-foreground">
            {configuredTotal} connected
          </span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-sm text-red-400">
              {errorCount} with errors
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-zinc-500" />
          <span className="text-sm text-muted-foreground">
            {SUPPORTED_CHANNELS.length - configuredTotal} available
          </span>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background/50 border-border/60 text-sm"
          />
        </div>
      </div>

      {/* Category sections */}
      <div className="space-y-2">
        {filteredCategories.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            channels={cat.channels}
            statuses={channels}
            workspaceId={workspaceId}
            onRefresh={fetchChannels}
            defaultOpen={
              // Auto-expand categories that have configured channels, or Popular
              cat.id === 'popular' ||
              cat.channels.some((ch) =>
                channels.some((s) => s.channelType === ch.type),
              )
            }
          />
        ))}

        {filteredCategories.length === 0 && searchQuery && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No channels matching &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
