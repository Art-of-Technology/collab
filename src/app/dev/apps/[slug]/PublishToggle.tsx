'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface PublishToggleProps {
  appId: string;
  currentStatus: string;
}

export function PublishToggle({ appId, currentStatus }: PublishToggleProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublished = currentStatus === 'PUBLISHED';
  const isDraft = currentStatus === 'DRAFT';

  const handleToggle = async (newStatus: 'PUBLISHED' | 'DRAFT') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/apps/by-id/${appId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const result = await response.json();

      if (response.ok) {
        // Refresh the page to show updated status
        router.refresh();
      } else {
        setError(result.error || 'Failed to update app status');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus === 'SUSPENDED') {
    return (
      <Button variant="destructive" disabled>
        <EyeOff className="w-4 h-4 mr-2" />
        Suspended
      </Button>
    );
  }

  return (
    <>
      {error && (
        <div className="text-sm text-red-600 mb-2">
          {error}
        </div>
      )}
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant={isPublished ? "default" : "outline"}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : isPublished ? (
              <Eye className="w-4 h-4 mr-2" />
            ) : (
              <EyeOff className="w-4 h-4 mr-2" />
            )}
            {isPublished ? 'Published' : 'Publish'}
          </Button>
        </AlertDialogTrigger>
        
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPublished ? 'Unpublish App' : 'Publish App'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPublished ? (
                <>
                  This will make your app unavailable for new installations and hide it from the public app directory. 
                  Existing installations will continue to work.
                </>
              ) : (
                <>
                  This will make your app available for installation by workspace administrators and visible in the public app directory.
                  Make sure your app manifest is complete and your homepage URL is accessible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggle(isPublished ? 'DRAFT' : 'PUBLISHED')}
              className={isPublished ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {isPublished ? 'Unpublish' : 'Publish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
