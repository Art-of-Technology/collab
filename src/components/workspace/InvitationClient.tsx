"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Building2, Users, Calendar, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format } from 'date-fns';
import { useAcceptInvitation } from '@/hooks/queries/useInvitation';

interface InvitationClientProps {
  invitation: any;
  token: string;
}

export default function InvitationClient({ invitation, token }: InvitationClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  
  // Use TanStack Query mutation for accepting the invitation
  const { mutate: acceptInvitation, isPending } = useAcceptInvitation({
    onSuccess: (data) => {
      // Redirect to the workspace on success
      if (data.workspaceId) {
        router.push(`/workspaces/${data.workspaceId}`);
      } else {
        router.push('/workspaces');
      }
    },
    onError: (err) => {
      setError((err as Error).message || 'Failed to accept invitation');
    }
  });
  
  // Handle invitation acceptance
  const handleAccept = () => {
    acceptInvitation(token);
  };
  
  // Handle invitation decline
  const handleDecline = () => {
    // Just go back to workspaces
    router.push('/workspaces');
  };
  
  // Format dates
  const invitedDate = new Date(invitation.createdAt);
  const expiresDate = new Date(invitation.expiresAt);
  
  return (
    <div className="container max-w-2xl py-4 md:py-8 px-4 mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-2xl md:text-3xl font-bold">Workspace Invitation</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">
          You&apos;ve been invited to join a workspace
        </p>
      </div>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <Card className="border-border/40 shadow-md">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {invitation.workspace.logoUrl ? (
              <Image 
                src={invitation.workspace.logoUrl} 
                alt={invitation.workspace.name} 
                className="h-12 w-12 md:h-16 md:w-16 rounded-md flex-shrink-0" 
                width={64}
                height={64}
              />
            ) : (
              <div className="h-12 w-12 md:h-16 md:w-16 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
            )}
            <div className="text-center md:text-left min-w-0 flex-1">
              <CardTitle className="text-lg md:text-2xl break-words">{invitation.workspace.name}</CardTitle>
              <CardDescription className="break-all">@{invitation.workspace.slug}</CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground break-words">
              {invitation.invitedBy.name || invitation.invitedBy.email} has invited you to join this workspace
            </p>
            
            {invitation.workspace.description && (
              <div className="mt-4 p-3 md:p-4 bg-muted/40 rounded-md">
                <p className="italic text-sm break-words">&quot;{invitation.workspace.description}&quot;</p>
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-3 pt-4 border-t border-border/40">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                {(invitation.workspace._count?.members || 0) + 1} members
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                Invited on {format(invitedDate, 'PPP')}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">
                Expires on {format(expiresDate, 'PPP')}
              </span>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="flex flex-col md:flex-row gap-3 md:gap-4 border-t border-border/40">
          <Button 
            variant="outline" 
            onClick={handleDecline}
            disabled={isPending}
            className="w-full md:w-auto order-2 md:order-1"
          >
            <X className="mr-2 h-4 w-4" />
            Decline
          </Button>
          
          <Button
            onClick={handleAccept}
            disabled={isPending}
            className="w-full md:w-auto order-1 md:order-2"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Accept Invitation
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 