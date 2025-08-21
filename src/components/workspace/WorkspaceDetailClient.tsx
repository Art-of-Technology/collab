"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, User, Users, Mail, Bell, UserPlus, Trash2, Loader2, Shield, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import InviteMemberForm from "@/app/(main)/workspaces/[workspaceId]/InviteMemberForm";
import WorkspaceDetailsEditor from "@/app/(main)/workspaces/[workspaceId]/WorkspaceDetailsEditor";
import CancelInvitationButton from "@/components/workspace/CancelInvitationButton";
import { WorkspaceFeatureSettings } from "./WorkspaceFeatureSettings";
import { useDetailedWorkspaceById } from "@/hooks/queries/useWorkspace";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import PageHeader from "@/components/layout/PageHeader";
import MemberStatusToggle from "./MemberStatusToggle";
import { useQueryClient } from "@tanstack/react-query";

interface WorkspaceDetailClientProps {
  readonly workspaceId: string;
  readonly initialWorkspace: any;
}

export default function WorkspaceDetailClient({ workspaceId, initialWorkspace }: WorkspaceDetailClientProps) {
  const [activeTab, setActiveTab] = useState("members");
  const [localWorkspace, setLocalWorkspace] = useState<any>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Fetch workspace data with TanStack Query
  const { data: workspace, isLoading, isError, error } = useDetailedWorkspaceById(workspaceId);

  // Check if user can manage workspace permissions and members
  const { isWorkspaceAdmin, isWorkspaceOwner } = useWorkspacePermissions();

  // Use the fetched data or fallback to initial data
  const workspaceData = workspace || initialWorkspace;

  // Update local workspace when workspace data changes
  useEffect(() => {
    if (workspace) {
      setLocalWorkspace(workspace);
    } else if (initialWorkspace) {
      setLocalWorkspace(initialWorkspace);
    }
  }, [workspace, initialWorkspace]);

  const handleBackNavigation = () => {
    router.push("/workspaces");
  };

  // Handler for member status changes
  const handleMemberStatusChange = (memberId: string, newStatus: boolean) => {
    if (!localWorkspace) return;

    // Update local workspace state immediately
    setLocalWorkspace((prevWorkspace: any) => {
      if (!prevWorkspace) return prevWorkspace;

      return {
        ...prevWorkspace,
        members: prevWorkspace.members.map((member: any) =>
          member.id === memberId ? { ...member, status: newStatus } : member
        )
      };
    });

    // Also update the query cache
    queryClient.setQueryData(['workspace', workspaceId], (oldData: any) => {
      if (!oldData) return oldData;

      return {
        ...oldData,
        members: oldData.members.map((member: any) =>
          member.id === memberId ? { ...member, status: newStatus } : member
        )
      };
    });
  };

  if (isLoading && !initialWorkspace) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <h2 className="text-xl font-semibold text-destructive">Error Loading Workspace</h2>
          <p className="text-sm text-muted-foreground">{(error as Error)?.message || "Failed to load workspace details"}</p>
          <Button size="sm" asChild>
            <Link href="/workspaces">Return to Workspaces</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Use the permissions returned from the server action
  const { isOwner, canManage } = localWorkspace || workspace || workspaceData;


  return (
    <div className="w-full mx-auto">
      <PageHeader
        title={
          <Button variant="ghost" size="sm" onClick={handleBackNavigation} className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#e6edf3]">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Workspaces
          </Button>
        }
      />

      <div className="flex flex-col md:flex-row max-w-6xl px-6 py-4 justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {(localWorkspace?.logoUrl || workspace?.logoUrl || workspaceData.logoUrl) ? (
            <Image
              src={localWorkspace?.logoUrl || workspace?.logoUrl || workspaceData.logoUrl}
              alt={localWorkspace?.name || workspace?.name || workspaceData.name}
              className="h-12 w-12 rounded border border-border/40"
              width={48}
              height={48}
            />
          ) : (
            <div className="h-12 w-12 rounded border border-border/40 bg-muted/50 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div>
            <h1 className="text-2xl font-semibold text-foreground">{localWorkspace?.name || workspace?.name || workspaceData.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-muted-foreground">@{localWorkspace?.slug || workspace?.slug || workspaceData.slug}</span>
              {isOwner && (
                <Badge variant="outline" className="h-5 px-2 text-xs">
                  Owner
                </Badge>
              )}
              {canManage && !isOwner && (
                <Badge variant="outline" className="h-5 px-2 text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Admin
                </Badge>
              )}
            </div>
            {(localWorkspace?.description || workspace?.description || workspaceData.description) && <p className="text-sm text-muted-foreground mt-0.5">{localWorkspace?.description || workspace?.description || workspaceData.description}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Button variant="outline" size="sm" className="flex gap-1.5">
            <Users className="h-4 w-4" />
            <span>
              {localWorkspace?.members.filter((m: any) => m.status).length + 1 || workspace?.members.filter((m: any) => m.status).length + 1 || workspaceData.members.filter((m: any) => m.status).length + 1} active
              {(localWorkspace?.members.some((m: any) => !m.status) || workspace?.members.some((m: any) => !m.status) || workspaceData.members.some((m: any) => !m.status)) && (
                <span className="text-muted-foreground"> / {(localWorkspace?.members.length || workspace?.members.length || workspaceData.members.length) + 1} total</span>
              )}
            </span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 ml-6">
          <TabsTrigger value="members" className="text-sm">
            Members
          </TabsTrigger>
          <TabsTrigger value="invitations" className="text-sm">
            Invitations
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="settings" className="text-sm">
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent className="max-w-6xl px-6 py-4" value="members">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Workspace Members
              </CardTitle>
              <CardDescription className="text-xs">Manage the members of your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {/* Owner */}
                <div className="p-3 border border-border/20 rounded flex justify-between items-center hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2.5">
                    {(localWorkspace?.owner.useCustomAvatar || workspace?.owner.useCustomAvatar || workspaceData.owner.useCustomAvatar) ? (
                      <CustomAvatar user={localWorkspace?.owner || workspace?.owner || workspaceData.owner} size="lg" className="h-8 w-8 border border-primary/20" />
                    ) : (
                      <Avatar className="h-8 w-8 border border-primary/20">
                        {(localWorkspace?.owner.image || workspace?.owner.image || workspaceData.owner.image) ? (
                          <AvatarImage src={localWorkspace?.owner.image || workspace?.owner.image || workspaceData.owner.image} alt={(localWorkspace?.owner.name || workspace?.owner.name || workspaceData.owner.name) || ""} />
                        ) : (
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {(localWorkspace?.owner.name || workspace?.owner.name || workspaceData.owner.name)?.substring(0, 2).toUpperCase() || "U"}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    )}
                    <div>
                      <div className="font-medium text-sm">{localWorkspace?.owner.name || workspace?.owner.name || workspaceData.owner.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {localWorkspace?.owner.email || workspace?.owner.email || workspaceData.owner.email}
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-primary hover:bg-primary/90 h-5 px-2 text-xs">Owner</Badge>
                </div>

                {/* Members */}
                {(localWorkspace?.members.filter((member: any) => member.status) || workspace?.members.filter((member: any) => member.status) || workspaceData.members.filter((member: any) => member.status)).map((member: any) => (
                  <div
                    key={member.id}
                    className="p-3 border border-border/20 rounded flex justify-between items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {member.user.useCustomAvatar ? (
                        <CustomAvatar user={member.user} size="lg" className="h-8 w-8 border border-border/30" />
                      ) : (
                        <Avatar className="h-8 w-8 border border-border/30">
                          {member.user.image ? (
                            <AvatarImage src={member.user.image} alt={member.user.name || ""} />
                          ) : (
                            <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">
                              {member.user.name?.substring(0, 2).toUpperCase() || "U"}
                            </AvatarFallback>
                          )}
                        </Avatar>
                      )}
                      <div>
                        <div className="font-medium text-sm">{member.user.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.user.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MemberStatusToggle
                        memberId={member.id}
                        workspaceId={workspaceId}
                        currentStatus={member.status}
                        memberName={member.user.name || member.user.email}
                        canManage={isWorkspaceAdmin || isWorkspaceOwner}
                        isOwner={false}
                        onStatusChange={handleMemberStatusChange}
                      />
                      <Badge variant="outline" className="bg-muted/30 h-5 px-2 text-xs">
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show inactive members if there are any and user can manage */}
              {(localWorkspace?.members.some((member: any) => !member.status) || workspace?.members.some((member: any) => !member.status) || workspaceData.members.some((member: any) => !member.status)) && (
                <div className="mt-4 pt-4 border-t border-border/20">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <UserX className="h-4 w-4" />
                    Inactive Members
                  </h4>
                  <div className="space-y-2">
                    {(localWorkspace?.members.filter((member: any) => !member.status) || workspace?.members.filter((member: any) => !member.status) || workspaceData.members.filter((member: any) => !member.status)).map((member: any) => (
                      <div
                        key={member.id}
                        className="p-3 border border-border/20 rounded flex justify-between items-center hover:bg-muted/30 transition-colors bg-muted/20"
                      >
                        <div className="flex items-center gap-2.5">
                          {member.user.useCustomAvatar ? (
                            <CustomAvatar user={member.user} size="lg" className="h-8 w-8 border border-border/30" />
                          ) : (
                            <Avatar className="h-8 w-8 border border-border/30">
                              {member.user.image ? (
                                <AvatarImage src={member.user.image} alt={member.user.name || ""} />
                              ) : (
                                <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs">
                                  {member.user.name?.substring(0, 2).toUpperCase() || "U"}
                                </AvatarFallback>
                              )}
                            </Avatar>
                          )}
                          <div>
                            <div className="font-medium text-sm">{member.user.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {member.user.email}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(isWorkspaceAdmin || isWorkspaceOwner) && (
                            <MemberStatusToggle
                              memberId={member.id}
                              workspaceId={workspaceId}
                              currentStatus={member.status}
                              memberName={member.user.name || member.user.email}
                              canManage={isWorkspaceAdmin || isWorkspaceOwner}
                              isOwner={false}
                              onStatusChange={handleMemberStatusChange}
                            />
                          )}
                          <Badge variant="outline" className="bg-muted/30 h-5 px-2 text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="max-w-6xl px-6 py-4" value="invitations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border border-border/40 bg-card/50">
              <CardHeader className="pb-3 pt-4 px-4">
                <CardTitle className="text-base font-medium">Pending Invitations</CardTitle>
                <CardDescription className="text-xs">View and manage pending invitations to your workspace.</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(localWorkspace?.invitations?.length || workspace?.invitations?.length || workspaceData.invitations?.length) > 0 ? (
                  <div className="space-y-3">
                    {(localWorkspace?.invitations || workspace?.invitations || workspaceData.invitations).map((invitation: any) => (
                      <div key={invitation.id} className="p-3 border border-border/20 rounded">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-sm">{invitation.email}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Invited by {invitation.invitedBy?.name || invitation.invitedBy?.email} on{" "}
                          {new Date(invitation.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Expires on {new Date(invitation.expiresAt).toLocaleDateString()}
                        </div>
                        {canManage && (
                          <div className="mt-2">
                            <CancelInvitationButton invitationId={invitation.id} workspaceId={workspaceId} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">No pending invitations</div>
                )}
              </CardContent>
            </Card>

            {canManage && (
              <Card className="border border-border/40 bg-card/50">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base font-medium">Invite New Members</CardTitle>
                  <CardDescription className="text-xs">Send invitations to new members to join your workspace.</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <InviteMemberForm workspaceId={workspaceId} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {canManage && (
          <TabsContent className="max-w-6xl px-6 py-4" value="settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border border-border/40 bg-card/50">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base font-medium">Workspace Preferences</CardTitle>
                  <CardDescription className="text-xs">Configure workspace settings and visibility</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {(isWorkspaceAdmin || isWorkspaceOwner) && (
                      <div className="flex items-center justify-between border border-border/20 p-2.5 rounded hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-green-500/10 rounded">
                            <Shield className="h-3 w-3 text-green-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium">Permissions & Roles</h3>
                            <p className="text-xs text-muted-foreground">Manage role permissions and member access levels</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs h-7" asChild>
                          <Link href={`/workspaces/${workspaceId}/settings/permissions`}>Manage</Link>
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center justify-between border border-border/20 p-2.5 rounded hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-500/10 rounded">
                          <Users className="h-3 w-3 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">Privacy Settings</h3>
                          <p className="text-xs text-muted-foreground">Control who can view and access this workspace</p>
                        </div>
                      </div>
                      <Button disabled variant="outline" size="sm" className="text-xs h-7">
                        Coming Soon
                      </Button>
                    </div>
                    <div className="flex items-center justify-between border border-border/20 p-2.5 rounded hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-muted/50 rounded">
                          <Bell className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">Notification Settings</h3>
                          <p className="text-xs text-muted-foreground">Manage workspace notification preferences</p>
                        </div>
                      </div>
                      <Button disabled variant="outline" size="sm" className="text-xs h-7">
                        Coming Soon
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border border-border/40 bg-card/50">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base font-medium">Workspace Information</CardTitle>
                  <CardDescription className="text-xs">Update your workspace details</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-muted-foreground">Workspace Name</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/20 rounded">
                        <p className="text-sm">{localWorkspace?.name || workspace?.name || workspaceData.name}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-muted-foreground">Workspace Slug</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/20 rounded">
                        <p className="text-sm">@{localWorkspace?.slug || workspace?.slug || workspaceData.slug}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
                      <div className="w-full p-2 bg-muted/30 border border-border/20 rounded min-h-[50px]">
                        <p className="text-sm">{localWorkspace?.description || workspace?.description || workspaceData.description || "No description provided"}</p>
                      </div>
                    </div>
                    <WorkspaceDetailsEditor workspace={localWorkspace || workspace || workspaceData} />
                  </div>
                </CardContent>
              </Card>
              <WorkspaceFeatureSettings />
              <Card className="border border-border/40 bg-card/50">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-base font-medium">Danger Zone</CardTitle>
                  <CardDescription className="text-xs">Irreversible actions that affect your workspace</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2.5 border border-border/20 rounded bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-500/10 rounded">
                          <UserPlus className="h-3 w-3 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">Transfer Ownership</h3>
                          <p className="text-xs text-muted-foreground">Transfer this workspace to another member</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="text-xs h-7">
                        Transfer
                      </Button>
                    </div>

                    <div className="flex justify-between items-center p-2.5 border border-destructive/20 rounded bg-destructive/5 hover:bg-destructive/10 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-destructive/10 rounded">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">Delete Workspace</h3>
                          <p className="text-xs text-muted-foreground">Once deleted, all members will lose access to this workspace</p>
                        </div>
                      </div>
                      <Button variant="destructive" size="sm" className="text-xs h-7">
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
