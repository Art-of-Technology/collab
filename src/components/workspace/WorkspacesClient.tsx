"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Users, Settings, DollarSign, Mail, ArrowRight, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DashboardButton from '@/components/workspace/DashboardButton';
import Image from 'next/image';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserWorkspaces, useWorkspaceLimit } from '@/hooks/queries/useWorkspace';
import { usePendingInvitations } from '@/hooks/queries/useInvitation';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

interface WorkspacesClientProps {
  initialWorkspaces: any[];
  initialInvitations: any[];
  userId: string;
}

export default function WorkspacesClient({ 
  initialWorkspaces, 
  initialInvitations,
  userId
}: WorkspacesClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get the active tab from URL params
  const activeTab = searchParams?.get('tab') === 'invitations' ? 'invitations' : 'workspaces';
  const [currentTab, setCurrentTab] = useState(activeTab);
  
  // Fetch workspaces with TanStack Query
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useUserWorkspaces();
  
  // Fetch pending invitations with TanStack Query
  const { data: pendingInvitationsData, isLoading: isLoadingInvitations } = usePendingInvitations(
    session?.user?.email || null
  );
  
  // Get workspace limit
  const { data: workspaceLimit } = useWorkspaceLimit();
  
  // Use the fetched data or fall back to the initial data
  const workspaces = workspacesData?.all || initialWorkspaces;
  const pendingInvitations = pendingInvitationsData || initialInvitations;
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setCurrentTab(value);
    
    // Update URL
    const params = new URLSearchParams(searchParams?.toString());
    if (value === 'invitations') {
      params.set('tab', 'invitations');
    } else {
      params.delete('tab');
    }
    
    const newPath = `${window.location.pathname}?${params.toString()}`;
    router.push(newPath, { scroll: false });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your workspaces and invitations</p>
        </div>
        <div className="flex items-center gap-2">
          {(!workspaceLimit || workspaceLimit.canCreateWorkspace) ? (
            <Link href="/create-workspace">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Workspace
              </Button>
            </Link>
          ) : (
            <Button variant="outline" disabled>
              <DollarSign className="mr-2 h-4 w-4" />
              Upgrade for more workspaces
            </Button>
          )}
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="mb-8">
        <TabsList className="mb-6">
          <TabsTrigger value="workspaces">My Workspaces</TabsTrigger>
          <TabsTrigger value="invitations" className="relative">
            Pending Invitations
            {pendingInvitations.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {pendingInvitations.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces">
          {isLoadingWorkspaces && initialWorkspaces.length === 0 ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : workspaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workspaces.map((workspace: any) => (
                <Card key={workspace.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        {workspace.logoUrl ? (
                          <Image
                            src={workspace.logoUrl}
                            alt={workspace.name}
                            className="h-10 w-10 rounded-md"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-xl">{workspace.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">@{workspace.slug}</span>
                            {workspace.ownerId === userId && (
                              <Badge variant="outline" className="text-xs">Owner</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {workspace.description && (
                      <CardDescription className="mb-4">{workspace.description}</CardDescription>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{workspace.members.length + 1} members</span>
                    </div>
                  </CardContent>

                  <CardFooter className="flex justify-between">
                    <DashboardButton workspaceId={workspace.id} />

                    {(workspace.ownerId === userId || session?.user?.role === 'SYSTEM_ADMIN') ? (
                      <Link href={`/workspaces/${workspace.id}`}>
                        <Button variant="secondary">
                          <Settings className="mr-2 h-4 w-4" />
                          Manage
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="secondary" disabled title="Only workspace owners and admins can manage workspaces">
                        <Settings className="mr-2 h-4 w-4" />
                        Manage
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-lg p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No workspaces yet</h2>
              <p className="text-muted-foreground mb-4">Create a workspace to start collaborating with your team</p>
              <Link href="/create-workspace">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Workspace
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="invitations">
          {isLoadingInvitations && initialInvitations.length === 0 ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : pendingInvitations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingInvitations.map((invitation: any) => (
                <Card key={invitation.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        {invitation.workspace.logoUrl ? (
                          <Image
                            src={invitation.workspace.logoUrl}
                            alt={invitation.workspace.name}
                            className="h-10 w-10 rounded-md"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <Mail className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-xl">{invitation.workspace.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">@{invitation.workspace.slug}</span>
                            <Badge variant="outline" className="text-xs">Invitation</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2 mb-4">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Invited by:</span>{' '}
                        <span className="font-medium">{invitation.invitedBy.name || invitation.invitedBy.email}</span>
                      </p>
                      {invitation.workspace.description && (
                        <p className="text-sm text-muted-foreground">
                          &quot;{invitation.workspace.description}&quot;
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Expires {format(new Date(invitation.expiresAt), 'PP')}</span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="flex justify-end">
                    <Button asChild>
                      <Link href={`/workspace-invitation/${invitation.token}`}>
                        Accept Invitation
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-lg p-8 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No pending invitations</h2>
              <p className="text-muted-foreground mb-4">
                You don&apos;t have any pending workspace invitations. Ask a workspace admin to invite you.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 