'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface AppReviewActionsProps {
  appId: string;
  appName: string;
}

export function AppReviewActions({ appId, appName }: AppReviewActionsProps) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleApprove = async () => {
    setApproving(true);
    try {
      const response = await fetch(`/api/apps/by-id/${appId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to approve app');
      }

      toast({
        title: 'App Approved',
        description: `${appName} has been approved. OAuth credentials have been generated based on the app's authentication method. The developer can now publish the app.`,
      });

      router.refresh();
    } catch (error) {
      console.error('Error approving app:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve app',
        variant: 'destructive',
      });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection reason required',
        description: 'Please provide a reason for rejecting this app.',
        variant: 'destructive',
      });
      return;
    }

    setRejecting(true);
    try {
      const response = await fetch(`/api/apps/by-id/${appId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: rejectionReason.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject app');
      }

      toast({
        title: 'App Rejected',
        description: `${appName} has been rejected.`,
      });

      router.refresh();
    } catch (error) {
      console.error('Error rejecting app:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject app',
        variant: 'destructive',
      });
    } finally {
      setRejecting(false);
      setRejectionReason('');
    }
  };

  return (
    <>
      {/* Approve Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="default" 
            size="sm" 
            className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
            disabled={approving || rejecting}
          >
            {approving ? (
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            )}
            <span className="text-xs sm:text-sm">Approve</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve App</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve "{appName}"? This will:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Change the app status to DRAFT</li>
                <li>Generate OAuth client_id for all apps</li>
                <li>Generate client_secret only for confidential apps using client_secret_basic</li>
                <li>Validate JWKS for apps using private_key_jwt authentication</li>
                <li>Allow the developer to publish the app</li>
                <li>Enable workspace installations</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
              disabled={approving}
            >
              {approving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve App
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="destructive" 
            size="sm" 
            className="flex-1 sm:flex-none"
            disabled={approving || rejecting}
          >
            {rejecting ? (
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            )}
            <span className="text-xs sm:text-sm">Reject</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject App</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject "{appName}"? Please provide a reason for the rejection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Rejection Reason</Label>
            <Textarea
              id="rejection-reason"
              placeholder="Please explain why this app is being rejected..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectionReason('')}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={rejecting || !rejectionReason.trim()}
            >
              {rejecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject App
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
