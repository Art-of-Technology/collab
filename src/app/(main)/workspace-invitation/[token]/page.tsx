'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Building2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/context/WorkspaceContext';

interface InvitationPageProps {
  params: {
    token: string;
  };
}

export default async function WorkspaceInvitationPage({ params }: InvitationPageProps) {
  const _params = await params;
  const { token } = _params;
  const { data: session, status } = useSession();
  const router = useRouter();
  const { refreshWorkspaces } = useWorkspace();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  
  useEffect(() => {
    async function fetchInvitation() {
      if (status === 'loading') return;
      
      try {
        setIsLoading(true);
        const response = await fetch(`/api/workspaces/invitations/${token}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch invitation details');
        }
        
        const invitationData = await response.json();
        setInvitation(invitationData);
      } catch (err) {
        console.error('Error fetching invitation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching the invitation');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchInvitation();
  }, [token, status]);
  
  const handleAcceptInvitation = async () => {
    if (!session?.user) {
      router.push(`/login?callbackUrl=/workspace-invitation/${token}`);
      return;
    }
    
    try {
      setIsAccepting(true);
      const response = await fetch(`/api/workspaces/invitations/${token}`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }
      
      setSuccess(true);
      await refreshWorkspaces();
      
      // Redirect after a short delay
      setTimeout(() => {
        router.push(`/workspaces/${data.workspaceId}`);
      }, 2000);
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while accepting the invitation');
    } finally {
      setIsAccepting(false);
    }
  };
  
  if (status === 'loading' || isLoading) {
    return (
      <div className="container max-w-lg py-16">
        <Card className="text-center">
          <CardHeader>
            <div className="mx-auto">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            <CardTitle className="mt-4">Loading invitation...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container max-w-lg py-16">
        <Card>
          <CardHeader>
            <div className="mx-auto">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="mt-4 text-center">Invalid Invitation</CardTitle>
            <CardDescription className="text-center">{error}</CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Link href="/workspaces">
              <Button>Go to Workspaces</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (success) {
    return (
      <div className="container max-w-lg py-16">
        <Card>
          <CardHeader>
            <div className="mx-auto">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="mt-4 text-center">Invitation Accepted!</CardTitle>
            <CardDescription className="text-center">
              You have successfully joined {invitation?.workspace?.name}. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container max-w-lg py-16">
      <Card>
        <CardHeader>
          <div className="mx-auto bg-primary/10 p-3 rounded-full">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="mt-4 text-center">Workspace Invitation</CardTitle>
          {invitation && (
            <CardDescription className="text-center">
              You have been invited to join <strong>{invitation.workspace.name}</strong>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {invitation && (
            <div className="text-center space-y-2">
              <p>
                <span className="text-muted-foreground">Invited by:</span>{' '}
                <span className="font-medium">{invitation.invitedBy.name || invitation.invitedBy.email}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Workspace:</span>{' '}
                <span className="font-medium">{invitation.workspace.name}</span>
              </p>
              {invitation.workspace.description && (
                <p className="text-muted-foreground text-sm italic">
                  "{invitation.workspace.description}"
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This invitation was sent to {invitation.email}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/workspaces">Cancel</Link>
          </Button>
          <Button onClick={handleAcceptInvitation} disabled={isAccepting}>
            {isAccepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              'Accept Invitation'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
} 