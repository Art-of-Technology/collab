'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Brain,
  Sparkles,
  Globe,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Shield,
  Loader2,
  BarChart3,
  AlertCircle,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  placeholder: string;
  description: string;
  supportsOAuth?: boolean;
}

interface ProviderStatus {
  provider: string;
  configured: boolean;
  lastUpdated: string | null;
}

interface UsageStats {
  date: string;
  messageCount: number;
  tokenCount: number;
  apiKeySource: 'user' | 'system' | null;
  limits: {
    maxMessagesPerDay: number;
    maxTokensPerDay: number;
    isOverLimit: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: <Brain className="h-5 w-5" />,
    placeholder: 'sk-ant-api03-...',
    description:
      'Claude models for advanced reasoning, coding, and analysis. Recommended for most use cases.',
    supportsOAuth: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: <Sparkles className="h-5 w-5" />,
    placeholder: 'sk-...',
    description:
      'GPT models for general-purpose AI tasks, chat, and text generation.',
  },
  {
    id: 'google',
    name: 'Google AI',
    icon: <Globe className="h-5 w-5" />,
    placeholder: 'AIza...',
    description:
      'Gemini models for multimodal AI tasks and Google ecosystem integration.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AIKeyManagerProps {
  workspaceId: string;
}

export default function AIKeyManager({ workspaceId }: AIKeyManagerProps) {
  const { toast } = useToast();
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  // Claude Code OAuth state
  const [oauthStep, setOauthStep] = useState<'idle' | 'starting' | 'waiting' | 'exchanging'>('idle');
  const [oauthCode, setOauthCode] = useState('');

  // ---- Data Fetching -------------------------------------------------------

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/keys`);
      if (!res.ok) throw new Error('Failed to fetch providers');
      const data = await res.json();
      setProviderStatuses(data.providers ?? []);
    } catch {
      // Silently fail — will show "Using shared key" by default
    }
  }, [workspaceId]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/usage`);
      if (!res.ok) throw new Error('Failed to fetch usage');
      const data = await res.json();
      setUsageStats(data);
    } catch {
      // Silently fail
    }
  }, [workspaceId]);

  useEffect(() => {
    Promise.all([fetchProviders(), fetchUsage()]).finally(() =>
      setLoading(false),
    );
  }, [fetchProviders, fetchUsage]);

  // ---- Handlers ------------------------------------------------------------

  const handleSave = async (providerId: string) => {
    const apiKey = keyInputs[providerId]?.trim();
    if (!apiKey) {
      toast({
        title: 'API key required',
        description: 'Please enter an API key before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/coclaw/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save key');
      }

      toast({ title: 'Key saved', description: `${providerId} API key configured successfully.` });
      setKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
      setVisibility((prev) => ({ ...prev, [providerId]: false }));
      await fetchProviders();
      await fetchUsage();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save key',
        variant: 'destructive',
      });
    } finally {
      setSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleRemove = async (providerId: string) => {
    setRemoving((prev) => ({ ...prev, [providerId]: true }));
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/keys/${providerId}`,
        { method: 'DELETE' },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove key');
      }

      toast({
        title: 'Key removed',
        description: `${providerId} API key removed. Your Coclaw agent will use the shared system key with usage limits.`,
      });
      await fetchProviders();
      await fetchUsage();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove key',
        variant: 'destructive',
      });
    } finally {
      setRemoving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  // ---- Claude Code OAuth ---------------------------------------------------

  const handleStartOAuth = async () => {
    setOauthStep('starting');
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/auth/anthropic/start`,
        { method: 'POST' },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start OAuth flow');
      }

      const { authorizeUrl } = await res.json();

      // Open the authorize URL in a new tab
      window.open(authorizeUrl, '_blank', 'noopener,noreferrer');

      setOauthStep('waiting');
    } catch (err) {
      toast({
        title: 'OAuth Error',
        description: err instanceof Error ? err.message : 'Failed to start connection',
        variant: 'destructive',
      });
      setOauthStep('idle');
    }
  };

  const handleExchangeOAuthCode = async () => {
    const code = oauthCode.trim();
    if (!code) {
      toast({
        title: 'Code required',
        description: 'Please paste the authorization code from the Anthropic page.',
        variant: 'destructive',
      });
      return;
    }

    setOauthStep('exchanging');
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/coclaw/auth/anthropic/exchange`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to exchange code');
      }

      toast({
        title: 'Claude Code connected',
        description: 'Your Claude subscription is now linked. Coclaw will use your subscription for unlimited usage.',
      });

      setOauthStep('idle');
      setOauthCode('');
      await fetchProviders();
      await fetchUsage();
    } catch (err) {
      toast({
        title: 'Connection failed',
        description: err instanceof Error ? err.message : 'Failed to complete OAuth',
        variant: 'destructive',
      });
      setOauthStep('waiting');
    }
  };

  const handleCancelOAuth = () => {
    setOauthStep('idle');
    setOauthCode('');
  };

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
        <Shield className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Your keys are encrypted and secure</p>
          <p>
            API keys are encrypted with AES-256-GCM and stored securely. They are only
            used by your personal Coclaw agent instance and never shared with other users.
          </p>
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const status = providerStatuses.find((s) => s.provider === provider.id);
          const isConfigured = status?.configured ?? false;
          const isSaving = saving[provider.id] ?? false;
          const isRemoving = removing[provider.id] ?? false;
          const isVisible = visibility[provider.id] ?? false;
          const inputValue = keyInputs[provider.id] ?? '';

          return (
            <Card key={provider.id} className="border border-border/40 bg-card/50">
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
                      {provider.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base font-medium">
                        {provider.name}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {provider.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={isConfigured ? 'default' : 'secondary'}
                    className={
                      isConfigured
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }
                  >
                    {isConfigured ? 'Configured' : 'Using shared key'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {/* API Key Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isVisible ? 'text' : 'password'}
                      placeholder={
                        isConfigured
                          ? 'Enter a new key to replace the existing one...'
                          : provider.placeholder
                      }
                      value={inputValue}
                      onChange={(e) =>
                        setKeyInputs((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }))
                      }
                      className="pr-10 bg-background/50 border-border/60 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setVisibility((prev) => ({
                          ...prev,
                          [provider.id]: !prev[provider.id],
                        }))
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(provider.id)}
                    disabled={isSaving || !inputValue.trim()}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">Save</span>
                  </Button>
                  {isConfigured && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRemove(provider.id)}
                      disabled={isRemoving}
                    >
                      {isRemoving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {isConfigured && status?.lastUpdated && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated:{' '}
                    {new Date(status.lastUpdated).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                )}

                {/* Claude Code OAuth — Anthropic only */}
                {provider.supportsOAuth && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    {oauthStep === 'idle' && (
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleStartOAuth}
                          className="text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Connect Claude Code Subscription
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Use your existing Claude Pro/Team subscription
                        </span>
                      </div>
                    )}

                    {oauthStep === 'starting' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Opening Anthropic authorization page...
                      </div>
                    )}

                    {oauthStep === 'waiting' && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          A new tab opened with Anthropic&apos;s authorization page.
                          After approving, paste the code shown on the page below:
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            placeholder="Paste code here (e.g., abc123#state456)"
                            value={oauthCode}
                            onChange={(e) => setOauthCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && oauthCode.trim()) {
                                handleExchangeOAuthCode();
                              }
                            }}
                            className="flex-1 bg-background/50 border-border/60 text-sm"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={handleExchangeOAuthCode}
                            disabled={!oauthCode.trim()}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Connect
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelOAuth}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {oauthStep === 'exchanging' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Connecting your Claude subscription...
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator className="border-border/40" />

      {/* Usage section */}
      <Card className="border border-border/40 bg-card/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-medium">Today&apos;s Usage</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {usageStats ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Messages</p>
                  <p className="text-lg font-semibold">
                    {usageStats.messageCount}
                    {usageStats.apiKeySource === 'system' && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}/ {usageStats.limits.maxMessagesPerDay}
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Tokens</p>
                  <p className="text-lg font-semibold">
                    {usageStats.tokenCount.toLocaleString()}
                    {usageStats.apiKeySource === 'system' && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}/ {usageStats.limits.maxTokensPerDay.toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {usageStats.apiKeySource === 'system' && (
                <div className="flex items-start gap-2 text-xs text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                    You&apos;re using the shared system key with daily limits.
                    Add your own API key above for unlimited usage.
                  </p>
                </div>
              )}

              {usageStats.apiKeySource === 'user' && (
                <p className="text-xs text-emerald-400">
                  Using your own API key — no usage limits apply.
                </p>
              )}

              {usageStats.limits.isOverLimit && (
                <div className="flex items-start gap-2 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                    Daily limit reached. Add your own API key to continue using Coclaw today.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No usage data yet. Start chatting with Coclaw to see your usage statistics.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
