'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const ManifestSubmissionSchema = z.object({
  manifestUrl: z.string()
    .url('Please enter a valid URL')
    .refine(
      (url) => url.endsWith('.json') || url.endsWith('/manifest'),
      'Manifest URL must end with .json or /manifest'
    )
});

type ManifestSubmissionForm = z.infer<typeof ManifestSubmissionSchema>;

interface ManifestSubmissionCardProps {
  appSlug: string;
}

export function ManifestSubmissionCard({ appSlug }: ManifestSubmissionCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useForm<ManifestSubmissionForm>({
    resolver: zodResolver(ManifestSubmissionSchema),
    defaultValues: {
      manifestUrl: ''
    }
  });

  const onSubmit = async (data: ManifestSubmissionForm) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/apps/${appSlug}/submit-manifest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        setSuccess('Manifest submitted successfully! Your app is now under review.');
        form.reset();
        // Refresh the page to show updated status
        setTimeout(() => {
          router.refresh();
        }, 2000);
      } else {
        setError(result.error || 'Failed to submit manifest');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-blue-500/50 bg-blue-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-500" />
          Submit App Manifest
        </CardTitle>
        <CardDescription>
          Ready to publish? Submit your app manifest URL to move your app to review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Alert */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Before submitting:</strong> Ensure your app is running and the manifest is accessible at the URL you provide. 
            The manifest slug must match your app slug: <code className="bg-muted px-1 py-0.5 rounded">{appSlug}</code>
          </AlertDescription>
        </Alert>

        {/* Success Message */}
        {success && (
          <Alert className="border-green-600 bg-green-950/30">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert className="border-red-600 bg-red-950/30">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-600">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manifestUrl">Manifest URL *</Label>
            <Input
              id="manifestUrl"
              placeholder="https://your-app.com/manifest.json"
              {...form.register('manifestUrl')}
              disabled={loading}
              aria-describedby="manifest-url-help"
            />
            {form.formState.errors.manifestUrl && (
              <p className="text-sm text-red-600 mt-1" role="alert">
                {form.formState.errors.manifestUrl.message}
              </p>
            )}
            <p id="manifest-url-help" className="text-xs text-muted-foreground">
              The URL where your app's manifest.json file is hosted (must be HTTPS in production)
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <h4 className="text-sm font-medium">What happens next?</h4>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>We'll fetch and validate your app manifest</li>
              <li>Your app will be moved to "In Review" status</li>
              <li>Once approved, your app will be ready to publish</li>
            </ol>
          </div>

          <Button 
            type="submit" 
            disabled={loading} 
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting Manifest...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Submit Manifest for Review
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

