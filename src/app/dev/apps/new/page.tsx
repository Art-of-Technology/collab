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
import { ArrowLeft } from 'lucide-react';
import { ImportManifestRequestSchema } from '@/lib/apps/validation';

// Form schemas
type ImportManifestForm = z.infer<typeof ImportManifestRequestSchema>;

export default function NewAppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import form
  const importForm = useForm<ImportManifestForm>({
    resolver: zodResolver(ImportManifestRequestSchema),
    defaultValues: {
      url: '',
      publisherId: 'developer'
    }
  });

  const onImportSubmit = async (data: ImportManifestForm) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/apps/import-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess(`App "${result.app.name}" imported successfully!`);
        setTimeout(() => {
          router.push(`/dev/apps/${result.app.slug}`);
        }, 2000);
      } else {
        setError(result.error || 'Failed to import manifest');
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
          Add a new app to the Collab platform
        </p>
      </div>

      {/* Information about credential generation */}
      <Alert className="mb-8">
        <AlertDescription>
          <strong>Note:</strong> OAuth credentials will be automatically generated when your app is approved and published. 
          You do not need to generate credentials during the submission process.
        </AlertDescription>
      </Alert>

      {/* Success/Error Messages */}
      {success && (
        <Alert className="mb-6 border-green-600 bg-green-950/30">
          <AlertDescription className="text-green-600 bg">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-6 border-red-600 bg-red-950/30">
          <AlertDescription className="text-red-600 bg">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import from Manifest URL</CardTitle>
          <CardDescription>
            Provide a URL to your app manifest JSON file. We'll fetch and validate it automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={importForm.handleSubmit(onImportSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="url">Manifest URL *</Label>
              <Input
                id="url"
                placeholder="https://example.com/manifest.json"
                {...importForm.register('url')}
              />
              {importForm.formState.errors.url && (
                <p className="text-sm text-red-600 mt-1">
                  {importForm.formState.errors.url.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="publisherId">Publisher ID</Label>
              <Input
                id="publisherId"
                placeholder="your-publisher-id"
                {...importForm.register('publisherId')}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Optional. Defaults to 'developer' if not provided.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Importing...' : 'Import Manifest'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 p-4 bg-muted/50 rounded-lg">
        <h3 className="font-semibold mb-2">Need Help?</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Your manifest must be accessible via HTTPS in production</li>
          <li>• Manifest should include name, slug, entrypoint_url, and permissions</li>
          <li>• App slugs must be lowercase with hyphens only</li>
          <li>• Reserved slugs like 'admin', 'api', 'auth' cannot be used</li>
        </ul>
      </div>
    </div>
  );
}
