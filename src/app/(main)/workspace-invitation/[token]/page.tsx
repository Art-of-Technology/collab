import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { getInvitationByToken } from '@/actions/invitation';
import InvitationClient from '@/components/workspace/InvitationClient';

interface InvitationPageProps {
  params: {
    token: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceInvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;
  const session = await getAuthSession();
  
  if (!session?.user) {
    console.log("Redirecting to login: callbackUrl", `/workspace-invitation/${token}`);
    redirect(`/login?callbackUrl=${encodeURIComponent(`/workspace-invitation/${token}`)}`);
  }
  
  try {
    // Fetch invitation data
    const invitation = await getInvitationByToken(token);
    
    return (
      <InvitationClient 
        invitation={invitation} 
        token={token}
      />
    );
  } catch (error) {
    console.error("Error loading invitation:", error);
    
    // Handle different error cases
    if ((error as Error).message.includes('Invitation not found')) {
      notFound();
    }
    
    // Render error state
    return (
      <div className="container max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Invitation</h1>
        <p className="text-muted-foreground mb-6">
          {(error as Error).message || "Failed to load workspace invitation"}
        </p>
      </div>
    );
  }
} 