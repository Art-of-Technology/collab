'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Rocket } from 'lucide-react';

// Form schema for creating a draft app
const CreateDraftAppSchema = z.object({
  name: z.string()
    .min(1, 'App name is required')
    .max(100, 'App name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'App name can only contain letters, numbers, spaces, hyphens, and underscores'),
  publisherId: z.string()
    .min(1, 'Publisher ID is required')
    .max(100, 'Publisher ID must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Publisher ID can only contain letters, numbers, hyphens, and underscores')
    .optional()
    .or(z.literal(''))
});

type CreateDraftForm = z.infer<typeof CreateDraftAppSchema>;

export default function NewAppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create app form
  const createForm = useForm<CreateDraftForm>({
    resolver: zodResolver(CreateDraftAppSchema),
    defaultValues: {
      name: '',
      publisherId: ''
    }
  });

  const onCreateSubmit = async (data: CreateDraftForm) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Remove empty publisherId before sending
      const payload = {
        name: data.name,
        ...(data.publisherId && data.publisherId.trim() !== '' && { publisherId: data.publisherId })
      };

      const response = await fetch('/api/apps/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess(`App "${result.app.name}" created successfully! Redirecting...`);
        // Redirect to app detail page where credentials will be shown
        setTimeout(() => {
          router.push(`/dev/apps/${result.app.slug}`);
        }, 1500);
      } else {
        setError(result.error || 'Failed to create app');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <Link href="/dev/apps" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Apps
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Create New App</h1>
        <p className="text-muted-foreground mt-2">
          Start building your app for the Collab platform
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <Alert className="mb-6 border-green-600 bg-green-950/30">
          <AlertDescription className="text-green-600">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-6 border-red-600 bg-red-950/30">
          <AlertDescription className="text-red-600">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            App Details
          </CardTitle>
          <CardDescription>
            Choose a name for your app. We'll generate OAuth credentials immediately so you can start developing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">App Name *</Label>
              <Input
                id="name"
                placeholder="My Awesome App"
                {...createForm.register('name')}
                disabled={loading}
                aria-describedby="name-help"
              />
              {createForm.formState.errors.name && (
                <p className="text-sm text-red-600 mt-1" role="alert">
                  {createForm.formState.errors.name.message}
                </p>
              )}
              <p id="name-help" className="text-xs text-muted-foreground">
                This will be used to generate a unique slug for your app
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="publisherId">Publisher ID</Label>
              <Input
                id="publisherId"
                placeholder="your-publisher-id"
                {...createForm.register('publisherId')}
                disabled={loading}
                aria-describedby="publisher-help"
              />
              {createForm.formState.errors.publisherId && (
                <p className="text-sm text-red-600 mt-1" role="alert">
                  {createForm.formState.errors.publisherId.message}
                </p>
              )}
              <p id="publisher-help" className="text-xs text-muted-foreground">
                Optional. This identifies who is publishing the app. Defaults to your user ID if not provided.
              </p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <h4 className="text-sm font-medium">What happens next?</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>We'll create your app and generate OAuth credentials</li>
                <li>Use these credentials to develop and test your app</li>
                <li>When ready, submit your app manifest URL to publish</li>
              </ol>
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? 'Creating App...' : 'Create App & Get Credentials'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Development Flow</h3>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>
            <strong>1. Create App:</strong> Provide your app name and get credentials immediately
          </li>
          <li>
            <strong>2. Develop:</strong> Build your app using the provided Client ID and Secret
          </li>
          <li>
            <strong>3. Publish:</strong> Submit your manifest URL when your app is ready
          </li>
        </ul>
      </div>
    </div>
  );
}
