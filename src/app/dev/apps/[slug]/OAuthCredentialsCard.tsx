'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, Copy, Eye, EyeOff, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OAuthClient {
  id: string;
  clientId: string;
  clientSecret?: Uint8Array | null;
  clientType?: string | null;
  secretRevealed?: boolean;
  redirectUris?: string[];
}

interface RevealSecretResponse {
  success: boolean;
  clientSecret?: string;
  warning?: string;
  error?: string;
}

interface OAuthCredentialsCardProps {
  oauthClient: OAuthClient;
  appId: string;
  appStatus: string;
}

export function OAuthCredentialsCard({ oauthClient, appId, appStatus }: OAuthCredentialsCardProps) {
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [copied, setCopied] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const maskValue = (value: string, showValue: boolean) => {
    if (!showValue) {
      return value.substring(0, 8) + '•'.repeat(Math.max(0, value.length - 12)) + value.substring(value.length - 4);
    }
    return value;
  };

  const fetchClientSecret = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/apps/by-id/${appId}/reveal-secret`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data: RevealSecretResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch client secret');
      }

      if (data.success && data.clientSecret) {
        setClientSecret(data.clientSecret);
      }
    } catch (error) {
      console.error('Error fetching client secret:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch client secret',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [appId, toast]);

  useEffect(() => {
    fetchClientSecret();
  }, [fetchClientSecret]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Key className="w-4 h-4 sm:w-5 sm:h-5" />
          OAuth Credentials
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {appStatus === 'DRAFT' 
            ? 'Use these credentials to develop and test your app' 
            : 'Use these credentials in your app\'s OAuth configuration'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs sm:text-sm">
            <strong>Important:</strong> Store these credentials securely. The client secret should not be exposed in client-side code. Once revealed, it will not be shown again.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:gap-6">
          {/* Client ID */}
          <div className="space-y-2">
            <Label htmlFor="clientId" className="text-xs sm:text-sm font-medium">Client ID</Label>
            <div className="flex gap-2">
              <Input
                id="clientId"
                value={oauthClient.clientId}
                readOnly
                className="font-mono text-xs sm:text-sm min-w-0"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyToClipboard(oauthClient.clientId, 'Client ID')}
                className="flex-shrink-0"
              >
                {copied === 'Client ID' ? (
                  <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Public identifier for your app (safe to include in client-side code)
            </p>
          </div>

          {/* Client Secret */}
          <div className="space-y-2">
            <Label htmlFor="clientSecret" className="text-xs sm:text-sm font-medium">Client Secret</Label>
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-10 border rounded-md">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : oauthClient.secretRevealed ? (
                    <Input
                      id="clientSecret"
                      value={clientSecret ? `****${clientSecret.slice(-4)}` : '••••••••••••••••'}
                      readOnly
                      className="font-mono text-xs sm:text-sm"
                      type="text"
                    />
                  ) : (
                    <>
                      <Input
                        id="clientSecret"
                        value={clientSecret ? maskValue(clientSecret, showClientSecret) : '••••••••••••••••'}
                        readOnly
                        className="font-mono text-xs sm:text-sm pr-8 sm:pr-10"
                        type={showClientSecret ? "text" : "password"}
                      />
                      {clientSecret && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 sm:h-8 sm:w-8"
                          onClick={() => setShowClientSecret(!showClientSecret)}
                          aria-label={showClientSecret ? "Hide client secret" : "Show client secret"}
                        >
                          {showClientSecret ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {clientSecret && !isLoading && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToClipboard(clientSecret, 'Client Secret')}
                    className="flex-shrink-0"
                  >
                    {copied === 'Client Secret' ? (
                      <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                    ) : (
                      <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </Button>
                )}
              </div>
              {isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Loading client secret...
                </p>
              ) : oauthClient.secretRevealed ? (
                <p className="text-xs text-muted-foreground text-orange-600">
                  Client secret has been revealed previously and cannot be shown again for security reasons.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Secret key for OAuth authentication (keep confidential). Click the eye icon to reveal.
                </p>
              )}
            </div>
          </div>

          {/* Redirect URIs */}
          {oauthClient.redirectUris && oauthClient.redirectUris.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs sm:text-sm font-medium text-muted-foreground">Redirect URIs</div>
              <div className="space-y-1">
                {oauthClient.redirectUris.map((uri: string, index: number) => (
                  <code key={index} className="block text-xs sm:text-sm bg-muted px-2 py-1 rounded break-all">
                    {uri}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Usage Instructions */}
        <div className="bg-muted/50 p-3 sm:p-4 rounded-lg">
          <h4 className="font-medium text-xs sm:text-sm mb-2">Usage in your app:</h4>
          <ol className="text-xs sm:text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Use the Client ID in your OAuth authorization requests</li>
            <li>Use the Client Secret for token exchange (server-side only)</li>
            <li>Ensure your redirect URIs match those configured above</li>
            <li>Request only the scopes your app needs</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}