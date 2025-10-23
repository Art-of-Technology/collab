'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, RefreshCw, Eye, EyeOff, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { copyToClipboard } from '@/utils/issueHelpers';
import { useToast } from '@/hooks/use-toast';

interface Credentials {
  clientId: string;
  clientSecret: string;
}

interface CredentialGeneratorProps {
  onCredentialsGenerated?: (credentials: Credentials) => void;
}

export default function CredentialGenerator({ onCredentialsGenerated }: CredentialGeneratorProps) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [copied, setCopied] = useState('');
  const { toast } = useToast();

  const generateCredentials = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/generate-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate credentials');
      }

      const result = await response.json();
      setCredentials(result.credentials);
      onCredentialsGenerated?.(result.credentials);
      toast({
        title: 'Credentials generated successfully!',
        description: 'The credentials have been generated successfully.',
      });
    } catch (error) {
      console.error('Error generating credentials:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      toast({
        title: 'Success',
        description: `${label} copied to clipboard`,
      })
      setCopied(label);
      setTimeout(() => {
        setCopied('');
      }, 2000);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const maskValue = (value: string, showValue: boolean) => {
    if (!showValue) {
      return value.substring(0, 8) + '•'.repeat(Math.max(0, value.length - 12)) + value.substring(value.length - 4);
    }
    return value;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Generate App Credentials
        </CardTitle>
        <CardDescription>
          Generate OAuth client credentials for your third-party app. Include these in your manifest.json before importing.
        </CardDescription>
        <div className="mt-4 p-4 bg-background rounded-lg border">
          <h4 className="font-medium text-sm text-foreground mb-2">📋 Workflow:</h4>
          <ol className="text-sm text-foreground/50 space-y-1 list-decimal list-inside">
            <li>Generate credentials using the button below</li>
            <li>Copy the client_id and client_secret</li>
            <li>Add them to your app's manifest.json OAuth section</li>
            <li>Import your manifest using the form below</li>
          </ol>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!credentials ? (
          <div className="text-center py-8">
            <Button 
              onClick={generateCredentials}
              disabled={loading}
              size="lg"
              className="min-w-[200px]"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Generate Credentials
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground mt-4">
              Click to generate secure OAuth credentials for your app
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <Alert>
              <AlertDescription>
                <strong>Important:</strong> Store these credentials securely. The client secret will not be shown again.
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-green-600">
                Credentials Generated
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={generateCredentials}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
            </div>

            <div className="grid gap-4">
              {/* Client ID */}
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="clientId"
                    value={credentials.clientId}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyToClipboard(credentials.clientId, 'Client ID')}
                  >
                    {copied === 'Client ID' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Public identifier for your app (safe to include in client-side code)
                </p>
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="clientSecret"
                      value={maskValue(credentials.clientSecret, showClientSecret)}
                      readOnly
                      className="font-mono text-sm pr-10"
                      type={showClientSecret ? "text" : "password"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                    >
                      {showClientSecret ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyToClipboard(credentials.clientSecret, 'Client Secret')}
                  >
                    {copied === 'Client Secret' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Secret key for OAuth authentication (keep confidential)
                </p>
              </div>

            </div>

            {/* Usage Instructions */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium text-sm mb-2">Next Steps:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Copy the credentials above</li>
                <li>Add them to your app's manifest.json OAuth configuration</li>
                <li>Import your manifest using the form below</li>
              </ol>
            </div>

            {/* Example Manifest */}
            <details className="bg-muted/30 p-4 rounded-lg">
              <summary className="font-medium text-sm cursor-pointer">
                Example manifest.json OAuth configuration
              </summary>
              <pre className="mt-2 text-xs bg-black/10 p-3 rounded overflow-x-auto">
{`{
  "oauth": {
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": [
      "https://your-app.com/oauth/callback"
    ],
    "scopes": [
      "workspace:read",
      "issues:read",
      "user:read",
      "issues:write"
    ]
  }
}`}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
