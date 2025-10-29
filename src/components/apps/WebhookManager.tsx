'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Webhook, 
  Plus, 
  MoreVertical, 
  TestTube, 
  Trash2, 
  CheckCircle, 
  XCircle,
  Clock,
  Settings,
  ExternalLink,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { WEBHOOK_EVENT_TYPES } from '@/lib/webhooks';

interface WebhookData {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    deliveries: number;
  };
}

interface Installation {
  id: string;
  status: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  webhooks: WebhookData[];
}

interface WebhookManagerProps {
  appId: string;
  appSlug: string;
  installations: Installation[];
}

export default function WebhookManager({ appId, appSlug, installations }: WebhookManagerProps) {
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookData | null>(null);
  const [deleteWebhook, setDeleteWebhook] = useState<WebhookData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  
  // Form state
  const [formData, setFormData] = useState({
    url: '',
    eventTypes: [] as string[],
    workspaceId: ''
  });

  const router = useRouter();

  // Set default installation if there's only one
  useEffect(() => {
    if (installations.length === 1 && !selectedInstallation) {
      setSelectedInstallation(installations[0]);
    }
  }, [installations, selectedInstallation]);

  const activeInstallations = installations.filter(inst => inst.status === 'ACTIVE');
  const currentWebhooks = selectedInstallation?.webhooks || [];

  const handleCreateWebhook = async () => {
    if (!selectedInstallation || !formData.url || formData.eventTypes.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`/api/apps/${appSlug}/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formData.url,
          eventTypes: formData.eventTypes,
          workspaceId: selectedInstallation.workspace.id
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create webhook');
      }

      const result = await response.json();
      setWebhookSecret(result.secret);
      
      toast.success('Webhook created successfully');
      setFormData({ url: '', eventTypes: [], workspaceId: '' });
      setShowCreateDialog(false);
      router.refresh();
    } catch (error) {
      console.error('Error creating webhook:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTestWebhook = async (eventType: string) => {
    if (!selectedWebhook || !selectedInstallation) return;

    setIsTesting(true);
    try {
      const response = await fetch(`/api/apps/${appSlug}/webhooks/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookId: selectedWebhook.id,
          eventType,
          workspaceId: selectedInstallation.workspace.id
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to test webhook');
      }

      const result = await response.json();
      setTestResult(result);
      
      toast.success('Test webhook sent successfully');
    } catch (error) {
      console.error('Error testing webhook:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to test webhook');
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteWebhook = async (webhook: WebhookData) => {
    if (!selectedInstallation) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/apps/${appSlug}/webhooks/${webhook.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete webhook');
      }

      toast.success('Webhook deleted successfully');
      setDeleteWebhook(null);
      router.refresh();
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete webhook');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (activeInstallations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Webhook className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No active installations</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Your app needs to be installed in at least one workspace before you can configure webhooks.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Installation Selector */}
      {activeInstallations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Installation</CardTitle>
            <CardDescription>
              Choose which workspace installation to manage webhooks for
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={selectedInstallation?.id || ''} 
              onValueChange={(value) => {
                const installation = activeInstallations.find(inst => inst.id === value);
                setSelectedInstallation(installation || null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select workspace..." />
              </SelectTrigger>
              <SelectContent>
                {activeInstallations.map((installation) => (
                  <SelectItem key={installation.id} value={installation.id}>
                    {installation.workspace.name} ({installation.webhooks.length} webhooks)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {selectedInstallation && (
        <>
          {/* Webhooks List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Webhooks for {selectedInstallation.workspace.name}
                  </CardTitle>
                  <CardDescription>
                    Manage webhook endpoints for this installation
                  </CardDescription>
                </div>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Webhook</DialogTitle>
                      <DialogDescription>
                        Add a new webhook endpoint for {selectedInstallation.workspace.name}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="webhook-url">Webhook URL</Label>
                        <Input
                          id="webhook-url"
                          placeholder="https://your-app.com/webhooks"
                          value={formData.url}
                          onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>

                      <div>
                        <Label>Event Types</Label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {WEBHOOK_EVENT_TYPES.map((eventType) => (
                            <label key={eventType} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={formData.eventTypes.includes(eventType)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      eventTypes: [...prev.eventTypes, eventType] 
                                    }));
                                  } else {
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      eventTypes: prev.eventTypes.filter(t => t !== eventType) 
                                    }));
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="text-sm">{eventType}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateWebhook} disabled={isCreating}>
                        {isCreating ? 'Creating...' : 'Create Webhook'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {currentWebhooks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No webhooks configured</p>
                  <p className="text-sm">Add a webhook to receive real-time events.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentWebhooks.map((webhook) => (
                    <div key={webhook.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {webhook.url}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(webhook.url)}
                            className="h-6 w-6 p-0"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <div className="flex flex-wrap gap-1 mb-2">
                          {webhook.eventTypes.map((eventType) => (
                            <Badge key={eventType} variant="secondary" className="text-xs">
                              {eventType}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{webhook._count.deliveries} deliveries</span>
                          <span>Created {new Date(webhook.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                          {webhook.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedWebhook(webhook);
                                setShowTestDialog(true);
                              }}
                            >
                              <TestTube className="mr-2 h-4 w-4" />
                              Test Webhook
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setDeleteWebhook(webhook)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Webhook Secret Display */}
          {webhookSecret && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-base text-green-800">Webhook Secret</CardTitle>
                <CardDescription className="text-green-700">
                  Save this secret - it won't be shown again. Use it to verify webhook signatures.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-green-100 text-green-800 px-3 py-2 rounded text-sm font-mono">
                    {webhookSecret}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookSecret)}
                    className="border-green-300 text-green-700 hover:bg-green-100"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-green-300 text-green-700 hover:bg-green-100"
                  onClick={() => setWebhookSecret('')}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Webhook</DialogTitle>
            <DialogDescription>
              Send a test event to {selectedWebhook?.url}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Select Event Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {selectedWebhook?.eventTypes.map((eventType) => (
                  <Button
                    key={eventType}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestWebhook(eventType)}
                    disabled={isTesting}
                    className="justify-start"
                  >
                    <TestTube className="w-3 h-3 mr-2" />
                    {eventType}
                  </Button>
                ))}
              </div>
            </div>

            {testResult && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="font-medium">
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
                  </span>
                </div>
                <pre className="text-xs bg-background p-2 rounded overflow-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteWebhook} onOpenChange={() => setDeleteWebhook(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this webhook? This action cannot be undone and all delivery history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWebhook && handleDeleteWebhook(deleteWebhook)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
