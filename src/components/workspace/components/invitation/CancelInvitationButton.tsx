"use client";

import { useState } from 'react';
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
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useCancelInvitation } from './hooks';

interface CancelInvitationButtonProps {
  invitationId: string;
  workspaceId: string;
  onSuccess?: () => void;
}

export default function CancelInvitationButton({
  invitationId,
  workspaceId,
  onSuccess
}: CancelInvitationButtonProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const cancelMutation = useCancelInvitation(workspaceId);

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(invitationId);
      setShowConfirmDialog(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      // Error is already handled by the mutation hook
      console.error('Cancel invitation error:', error);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setShowConfirmDialog(true)}
        disabled={cancelMutation.isPending}
      >
        {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Cancel Invitation
      </Button>
      
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this invitation? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Cancelling...
                </>
              ) : (
                'Yes, cancel invitation'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
