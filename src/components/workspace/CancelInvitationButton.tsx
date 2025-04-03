"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

interface CancelInvitationButtonProps {
  invitationId: string;
  workspaceId: string;
  onSuccess?: () => void;
  revalidateAction?: (id: string) => Promise<void>;
}

export default function CancelInvitationButton({
  invitationId,
  workspaceId,
  onSuccess,
  revalidateAction
}: CancelInvitationButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();

  const handleCancel = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invitations?id=${invitationId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel invitation');
      }
      
      toast({
        title: 'Invitation Cancelled',
        description: 'The invitation has been cancelled successfully.',
      });
      
      if (revalidateAction) {
        await revalidateAction(workspaceId);
      }
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel invitation',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setShowConfirmDialog(true)}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
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
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
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