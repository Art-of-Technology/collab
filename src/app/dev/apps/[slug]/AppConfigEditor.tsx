'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Loader2, ExternalLink, Save, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AppConfigSchema = z.object({
  entrypoint_url: z.string().url('Please enter a valid URL'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  icon_url: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  redirect_uris: z.string().optional(),
  connect_src: z.string().optional(),
});

type AppConfigForm = z.infer<typeof AppConfigSchema>;

interface AppVersion {
  id: string;
  version: string;
  manifest: {
    name?: string;
    description?: string;
    entrypoint_url?: string;
    icon_url?: string;
    oauth?: {
      redirect_uris?: string[];
    };
    csp?: {
      connectSrc?: string[];
    };
  };
}

interface AppConfigEditorProps {
  appId: string;
  appName: string;
  appSlug: string;
  appStatus: string;
  version?: AppVersion;
}

export function AppConfigEditor({
  appId,
  appName,
  appSlug,
  appStatus,
  version,
}: AppConfigEditorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const manifest = version?.manifest || {};

  const form = useForm<AppConfigForm>({
    resolver: zodResolver(AppConfigSchema),
    defaultValues: {
      entrypoint_url: manifest.entrypoint_url || '',
      name: manifest.name || appName,
      description: manifest.description || '',
      icon_url: manifest.icon_url || '',
      redirect_uris: manifest.oauth?.redirect_uris?.join(', ') || '',
      connect_src: manifest.csp?.connectSrc?.join(', ') || '',
    },
  });

  const onSubmit = async (data: AppConfigForm) => {
    if (!version) {
      toast({
        title: 'Error',
        description: 'No app version found to update',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        entrypoint_url: data.entrypoint_url,
        name: data.name,
        description: data.description || undefined,
        icon_url: data.icon_url || null,
      };

      if (data.redirect_uris) {
        const uris = data.redirect_uris.split(',').map((u) => u.trim()).filter(Boolean);
        if (uris.length > 0) {
          payload.oauth = { redirect_uris: uris };
        }
      }

      if (data.connect_src) {
        const sources = data.connect_src.split(',').map((s) => s.trim()).filter(Boolean);
        if (sources.length > 0) {
          payload.csp = { connectSrc: sources };
        }
      }

      const response = await fetch(
        `/api/apps/by-id/${appId}/versions/${version.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update app configuration');
      }

      toast({
        title: 'Configuration Updated',
        description: `${appName} configuration has been updated successfully.`,
      });

      setOpen(false);
      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update app configuration',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isPublished = appStatus === 'PUBLISHED';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4 mr-2" />
          Edit Configuration
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit {appName} Configuration
          </DialogTitle>
          <DialogDescription>
            Update the app configuration and manifest settings. Changes take effect immediately.
          </DialogDescription>
        </DialogHeader>

        {!version ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No app version found. Please submit a manifest first.</p>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {isPublished && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This app is published. Changes will take effect immediately for all installations.
                </AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="oauth">OAuth</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">App Name</Label>
                  <Input
                    id="name"
                    {...form.register('name')}
                    disabled={loading}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entrypoint_url">Entrypoint URL *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="entrypoint_url"
                      {...form.register('entrypoint_url')}
                      placeholder="https://your-app.example.com/app"
                      className="flex-1"
                      disabled={loading}
                    />
                    {form.watch('entrypoint_url') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(form.watch('entrypoint_url'), '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {form.formState.errors.entrypoint_url && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.entrypoint_url.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The URL where your app is hosted and will be loaded in an iframe.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    {...form.register('description')}
                    placeholder="A brief description of what this app does..."
                    rows={3}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="icon_url">Icon URL</Label>
                  <Input
                    id="icon_url"
                    {...form.register('icon_url')}
                    placeholder="https://your-app.example.com/icon.png"
                    disabled={loading}
                  />
                  {form.formState.errors.icon_url && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.icon_url.message}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="oauth" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="redirect_uris">Redirect URIs</Label>
                  <Textarea
                    id="redirect_uris"
                    {...form.register('redirect_uris')}
                    placeholder="https://app.example.com/callback, https://dev-app.example.com/callback"
                    rows={3}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of allowed OAuth redirect URIs. Include all environment URLs (dev, staging, prod).
                  </p>
                </div>

                <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                  <h4 className="text-sm font-medium">Current Version</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Version: <span className="text-foreground">{version.version}</span></p>
                    <p>Slug: <span className="text-foreground">/{appSlug}</span></p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="connect_src">CSP connect-src</Label>
                  <Textarea
                    id="connect_src"
                    {...form.register('connect_src')}
                    placeholder="https://api.example.com, https://dev-api.example.com"
                    rows={3}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of allowed connection sources for Content Security Policy.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
