"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Building2, User, Users, Mail, Bell, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CustomAvatar } from '@/components/ui/custom-avatar';
import InviteMemberForm from '@/app/(main)/workspaces/[workspaceId]/InviteMemberForm';
import WorkspaceDetailsEditor from '@/app/(main)/workspaces/[workspaceId]/WorkspaceDetailsEditor';
import CancelInvitationButton from '@/components/workspace/CancelInvitationButton';
import { WorkspaceFeatureSettings } from './WorkspaceFeatureSettings';
import { useDetailedWorkspaceById } from '@/hooks/queries/useWorkspace';

interface WorkspaceDetailClientProps {
  workspaceId: string;
  initialWorkspace: any;
  userId?: string;
}

export default function WorkspaceDetailClient({ 
  workspaceId, 
  initialWorkspace,
}: WorkspaceDetailClientProps) {
  const [activeTab, setActiveTab] = useState('members');
  
  // Fetch workspace data with TanStack Query
  const { 
    data: workspace, 
    isLoading,
    isError,
    error
  } = useDetailedWorkspaceById(workspaceId);
  
  // Use the fetched data or fallback to initial data
  const workspaceData = workspace || initialWorkspace;
  
  if (isLoading && !initialWorkspace) {
    return (
      <div className="container max-w-7xl py-8">
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="container max-w-7xl py-8">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <h2 className="text-2xl font-bold text-destructive">Error Loading Workspace</h2>
          <p className="text-muted-foreground">
            {(error as Error).message || "Failed to load workspace details"}
          </p>
          <Button asChild>
            <Link href="/workspaces">Return to Workspaces</Link>
          </Button>
        </div>
      </div>
    );
  }
  
  // Use the permissions returned from the server action
  const { isOwner, canManage } = workspaceData;
  
  // Calculate total members count (members + owner)
  const totalMembers = workspaceData.members.length + 1;
  
  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6">
        <Link href="/workspaces">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to workspaces
          </Button>
        </Link>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          {workspaceData.logoUrl ? (
            <Image 
              src={workspaceData.logoUrl} 
              alt={workspaceData.name} 
              className="h-16 w-16 rounded-md" 
              width={64}
              height={64}
            />
          ) : (
            <div className="h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          )}
          
          <div>
            <h1 className="text-3xl font-bold">{workspaceData.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">@{workspaceData.slug}</span>
              {isOwner && (
                <Badge variant="outline">Owner</Badge>
              )}
              {canManage && !isOwner && (
                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Admin</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">{workspaceData.description}</p>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <Button variant="outline" className="flex gap-2">
            <Users className="h-4 w-4" />
            <span>{totalMembers} members</span>
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          {canManage && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Members</CardTitle>
              <CardDescription>
                Manage the members of your workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Owner */}
                <div className="p-4 border border-border/40 rounded-md flex justify-between items-center hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {workspaceData.owner.useCustomAvatar ? (
                      <CustomAvatar 
                        user={workspaceData.owner} 
                        size="lg" 
                        className="h-12 w-12 border border-primary/20 shadow-sm"
                      />
                    ) : (
                      <Avatar className="h-12 w-12 border border-primary/20 shadow-sm">
                        {workspaceData.owner.image ? (
                          <AvatarImage src={workspaceData.owner.image} alt={workspaceData.owner.name || ''} />
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary text-lg">
                            {workspaceData.owner.name?.substring(0, 2).toUpperCase() || 'U'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    )}
                    <div>
                      <div className="font-medium text-base">{workspaceData.owner.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {workspaceData.owner.email}
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-primary hover:bg-primary/90">Owner</Badge>
                </div>
                
                {/* Members */}
                {workspaceData.members.map((member: any) => (
                  <div key={member.id} className="p-4 border border-border/40 rounded-md flex justify-between items-center hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {member.user.useCustomAvatar ? (
                        <CustomAvatar 
                          user={member.user} 
                          size="lg" 
                          className="h-12 w-12 border border-border/40 shadow-sm"
                        />
                      ) : (
                        <Avatar className="h-12 w-12 border border-border/40 shadow-sm">
                          {member.user.image ? (
                            <AvatarImage src={member.user.image} alt={member.user.name || ''} />
                          ) : (
                            <AvatarFallback className="bg-secondary/10 text-secondary text-lg">
                              {member.user.name?.substring(0, 2).toUpperCase() || 'U'}
                            </AvatarFallback>
                          )}
                        </Avatar>
                      )}
                      <div>
                        <div className="font-medium text-base">{member.user.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.user.email}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-secondary/10">{member.role}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="invitations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
                <CardDescription>
                  View and manage pending invitations to your workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspaceData.invitations?.length > 0 ? (
                  <div className="space-y-4">
                    {workspaceData.invitations.map((invitation: any) => (
                      <div key={invitation.id} className="p-4 border rounded-md">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{invitation.email}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Invited by {invitation.invitedBy?.name || invitation.invitedBy?.email} on {new Date(invitation.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Expires on {new Date(invitation.expiresAt).toLocaleDateString()}
                        </div>
                        {canManage && (
                          <div className="mt-3">
                            <CancelInvitationButton 
                              invitationId={invitation.id} 
                              workspaceId={workspaceId}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    No pending invitations
                  </div>
                )}
              </CardContent>
            </Card>
            
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle>Invite New Members</CardTitle>
                  <CardDescription>
                    Send invitations to new members to join your workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InviteMemberForm workspaceId={workspaceId} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        {canManage && (
          <TabsContent value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <WorkspaceFeatureSettings />
              <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle>Workspace Information</CardTitle>
                  <CardDescription>
                    Update your workspace details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Workspace Name</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/40 rounded-md">
                        <p className="text-left font-normal">
                          {workspaceData.name}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Workspace Slug</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/40 rounded-md">
                        <p className="text-left font-normal">
                          @{workspaceData.slug}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Description</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/40 rounded-md min-h-[60px]">
                        <p className="text-left font-normal">
                          {workspaceData.description || "No description provided"}
                        </p>
                      </div>
                    </div>
                    <WorkspaceDetailsEditor workspace={workspaceData} />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle>Workspace Preferences</CardTitle>
                  <CardDescription>
                    Configure workspace settings and visibility
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border border-border/40 p-3 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500/10 rounded-full">
                          <Users className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="font-medium">Privacy Settings</h3>
                          <p className="text-sm text-muted-foreground">
                            Control who can view and access this workspace
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Configure
                      </Button>
                    </div>
                    <div className="flex items-center justify-between border border-border/40 p-3 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <Bell className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium">Notification Settings</h3>
                          <p className="text-sm text-muted-foreground">
                            Manage workspace notification preferences
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Configure
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-1 md:col-span-2 bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle>Danger Zone</CardTitle>
                  <CardDescription>
                    Irreversible actions that affect your workspace
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 border border-border/40 rounded-md bg-muted/50 hover:bg-muted/70 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500/10 rounded-full">
                          <UserPlus className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="font-medium">Transfer Ownership</h3>
                          <p className="text-sm text-muted-foreground">
                            Transfer this workspace to another member
                          </p>
                        </div>
                      </div>
                      <Button variant="outline">
                        Transfer
                      </Button>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 border border-destructive/20 rounded-md bg-destructive/5 hover:bg-destructive/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-destructive/10 rounded-full">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                          <h3 className="font-medium">Delete Workspace</h3>
                          <p className="text-sm text-muted-foreground">
                            Once deleted, all members will lose access to this workspace
                          </p>
                        </div>
                      </div>
                      <Button variant="destructive">
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
} 