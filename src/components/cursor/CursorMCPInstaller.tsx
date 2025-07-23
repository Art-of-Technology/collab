'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, ExternalLink, Zap, Clock, MessageSquare, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function CursorMCPInstaller() {
  const [apiUrl, setApiUrl] = useState(
    typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.host}` 
      : 'http://localhost:3000'
  );
  const [apiKey, setApiKey] = useState('');
  const { toast } = useToast();

  const generateConfig = (includeApiKey = false, useLocal = true) => {
    const config = {
      collab: useLocal ? {
        command: "node",
        args: ["/Users/erkandogan/Desktop/collab/mcp-server/dist/index.js"],
        env: {
          COLLAB_API_URL: apiUrl,
          ...(includeApiKey && apiKey && { COLLAB_API_KEY: apiKey })
        }
      } : {
        command: "npx",
        args: ["-y", "collab-mcp-server"],
        env: {
          COLLAB_API_URL: apiUrl,
          ...(includeApiKey && apiKey && { COLLAB_API_KEY: apiKey })
        }
      }
    };
    return config;
  };

  const generateInstallLink = (config: any) => {
    const configString = JSON.stringify(config);
    const base64Config = Buffer.from(configString).toString('base64');
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=collab&config=${base64Config}`;
  };

  const copyToClipboard = async (text: string, description: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${description} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the text manually",
        variant: "destructive",
      });
    }
  };

  const openCursorInstall = (config: any) => {
    const installLink = generateInstallLink(config);
    window.open(installLink, '_blank');
  };

  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Task Management",
      description: "Get task details, update status, and manage workflow directly from Cursor"
    },
    {
      icon: <Clock className="h-5 w-5" />,
      title: "Time Tracking", 
      description: "Start/stop work sessions with automatic time tracking integration"
    },
    {
      icon: <MessageSquare className="h-5 w-5" />,
      title: "Comments & Updates",
      description: "Add comments and update tasks without leaving your IDE"
    },
    {
      icon: <CheckCircle className="h-5 w-5" />,
      title: "Workspace Integration",
      description: "Access all your workspaces and tasks with full permission support"
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <div>
              <CardTitle>Cursor Integration</CardTitle>
              <CardDescription>
                Connect your Collab workspace with Cursor IDE for seamless development workflow
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="text-blue-600 mt-1">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-medium text-sm">{feature.title}</h4>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Install</CardTitle>
          <CardDescription>
            One-click installation for Cursor IDE
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => openCursorInstall(generateConfig(false, true))}
                  className="flex-1"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Add to Cursor (Local Dev)
                </Button>
                <Button 
                  onClick={() => openCursorInstall(generateConfig(false, false))}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Add to Cursor (Published)
                </Button>
              </div>
              <div className="text-xs text-center text-muted-foreground">
                Use "Local Dev" for development setup, "Published" for production
              </div>
            </div>
            <div className="bg-background border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-4 bg-blue-400 rounded-full" />
                <p className="text-sm font-medium">Local Development Requirements</p>
              </div>
              <p className="text-xs text-muted-foreground">
                To use the local development setup, make sure you've built the MCP server first:
                <br />
                <code className="bg-muted px-1 py-0.5 rounded text-xs">cd mcp-server && npm run build</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="session" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="session">Session Authentication</TabsTrigger>
          <TabsTrigger value="api-key">API Key Authentication</TabsTrigger>
        </TabsList>
        
        <TabsContent value="session" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Session Authentication</CardTitle>
              <CardDescription>
                Use your current browser session for authentication (recommended for development)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-url">Collab API URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="api-url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://your-collab-app.com"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiUrl, "API URL")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Manual Configuration (Local Dev)</h4>
                <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
{JSON.stringify(generateConfig(false, true), null, 2)}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => copyToClipboard(JSON.stringify(generateConfig(false, true), null, 2), "Configuration")}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Config
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-key" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">API Key Authentication</CardTitle>
              <CardDescription>
                Use an API key for authentication (recommended for production)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-yellow-400 rounded-full" />
                  <p className="text-sm font-medium">Coming Soon</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  API key generation and management will be available in a future update.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">API Key (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="your_api_key_here"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiKey, "API Key")}
                    disabled={!apiKey}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {apiKey && (
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Manual Configuration</h4>
                  <pre className="text-xs bg-background p-3 rounded border overflow-x-auto">
{JSON.stringify(generateConfig(true), null, 2)}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => copyToClipboard(JSON.stringify(generateConfig(true), null, 2), "Configuration")}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Config
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage Examples</CardTitle>
          <CardDescription>
            Try these commands in Cursor once the MCP server is installed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Task Management</h4>
              <div className="grid gap-2 text-xs">
                <code className="bg-muted px-2 py-1 rounded">"Show me the details for task WZB-123"</code>
                <code className="bg-muted px-2 py-1 rounded">"Update WZB-123 status to 'In Progress'"</code>
                <code className="bg-muted px-2 py-1 rounded">"Add a comment to WZB-123 saying 'Started implementation'"</code>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Time Tracking</h4>
              <div className="grid gap-2 text-xs">
                <code className="bg-muted px-2 py-1 rounded">"Start working on task WZB-123"</code>
                <code className="bg-muted px-2 py-1 rounded">"Stop working on WZB-123"</code>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Workflow Integration</h4>
              <div className="grid gap-2 text-xs">
                <code className="bg-muted px-2 py-1 rounded">"Can you please do the WZB-123 task"</code>
                <code className="bg-muted px-2 py-1 rounded">"List all my assigned tasks"</code>
                <code className="bg-muted px-2 py-1 rounded">"What workspaces do I have access to?"</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 