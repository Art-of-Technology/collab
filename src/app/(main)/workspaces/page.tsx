import React from 'react';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Building2, Plus, Users, Settings, DollarSign, Mail, ArrowRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DashboardButton from '@/components/workspace/DashboardButton';
import Image from 'next/image';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface WorkspacesPageProps {
  searchParams?: {
    tab?: string;
  };
}

export default async function WorkspacesPage({ searchParams }: WorkspacesPageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    redirect('/login');
  }
  
  // Get the active tab from URL params
  const _searchParams = await searchParams;
  const activeTab = _searchParams?.tab === 'invitations' ? 'invitations' : 'workspaces';
  
  // Fetch user's workspaces
  const workspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  // Fetch pending invitations
  const pendingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: session.user.email || '',
      status: 'pending',
      expiresAt: {
        gte: new Date()
      }
    },
    include: {
      workspace: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  const ownedWorkspacesCount = workspaces.filter(w => w.ownerId === session.user.id).length;
  
  return (
    <div className="container max-w-5xl py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your workspaces and invitations</p>
        </div>
        <div className="flex items-center gap-2">
          {session.user.role === 'admin' ? (
            ownedWorkspacesCount < 3 ? (
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
            )
          ) : (
            <Button variant="outline" disabled title="Only admins can create workspaces">
              <Plus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue={activeTab} className="mb-8">
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
          {workspaces.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workspaces.map((workspace) => (
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
                            {workspace.ownerId === session.user.id && (
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
                    
                    {(workspace.ownerId === session.user.id || session.user.role === 'admin') ? (
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
              {session.user.role === 'admin' ? (
                <Link href="/create-workspace">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Workspace
                  </Button>
                </Link>
              ) : (
                <div className="space-y-2 text-center">
                  <Button disabled title="Only admins can create workspaces">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Workspace
                  </Button>
                  <p className="text-sm text-muted-foreground">Only admins can create workspaces. Please contact an administrator.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invitations">
          {pendingInvitations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingInvitations.map((invitation) => (
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