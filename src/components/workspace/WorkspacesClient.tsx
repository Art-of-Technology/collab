"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Users, Settings, DollarSign, Mail, ArrowRight, Calendar, Loader2, Crown, Globe, Lock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DashboardButton from '@/components/workspace/DashboardButton';
import Image from 'next/image';
import { format } from 'date-fns';

import { useUserWorkspaces, useWorkspaceLimit } from '@/hooks/queries/useWorkspace';
import { usePendingInvitations } from '@/hooks/queries/useInvitation';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader, { pageHeaderButtonStyles } from '@/components/layout/PageHeader';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
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
    <div className="h-full bg-[#101011] flex flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        icon={Building2}
        title="Workspaces"
        subtitle="Manage your workspaces and invitations"
        actions={
          (!workspaceLimit || workspaceLimit.canCreateWorkspace) ? (
            <Button
              variant="ghost"
              size="sm"
              className={pageHeaderButtonStyles.primary}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Workspace
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="sm" 
              disabled 
              className={pageHeaderButtonStyles.ghost}
            >
              <DollarSign className="h-3 w-3 mr-1" />
              Upgrade for more workspaces
            </Button>
          )
        }
      />

      {/* Filters and Display Controls Bar */}
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Tab Filters */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange('workspaces')}
              className={`h-6 px-2 text-xs border ${
                currentTab === 'workspaces' 
                  ? 'border-[#58a6ff] text-[#58a6ff] bg-[#0d1421] hover:bg-[#0d1421] hover:border-[#58a6ff]' 
                  : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
            >
              My Workspaces
              <span className="ml-1 text-xs opacity-70">{workspaces.length}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange('invitations')}
              className={`h-6 px-2 text-xs border relative ${
                currentTab === 'invitations' 
                  ? 'border-[#f85149] text-[#f85149] bg-[#21110f] hover:bg-[#21110f] hover:border-[#f85149]' 
                  : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
            >
              Pending Invitations
              <span className="ml-1 text-xs opacity-70">{pendingInvitations.length}</span>
              {pendingInvitations.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#f85149] text-[9px] text-white font-medium">
                  {pendingInvitations.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-auto">
          {currentTab === 'workspaces' ? (
            isLoadingWorkspaces && initialWorkspaces.length === 0 ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
              </div>
            ) : workspaces.length > 0 ? (
              <div>
                {workspaces.map((workspace: any) => (
                  <div 
                    key={workspace.id} 
                    className="group flex items-center px-6 py-2 border-b border-[#1f1f1f] hover:bg-[#0f1011] hover:border-[#333] transition-all duration-150 cursor-pointer"
                  >
                    {/* Workspace Icon */}
                    <div className="flex items-center w-12 mr-4 flex-shrink-0">
                      {workspace.logoUrl ? (
                        <Image
                          src={workspace.logoUrl}
                          alt={workspace.name}
                          className="h-8 w-8 rounded border border-[#30363d]"
                          width={32}
                          height={32}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded border border-[#30363d] bg-[#1a1a1a] flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-[#8b949e]" />
                        </div>
                      )}
                    </div>

                    {/* Workspace Info */}
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
                          {workspace.name}
                        </span>
                        {workspace.ownerId === userId && (
                          <Badge className="h-4 px-1.5 text-[9px] font-medium bg-[#f59e0b]/30 text-[#f59e0b] border-0 rounded flex items-center gap-1">
                            <Crown className="h-2.5 w-2.5" />
                            Owner
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[#8b949e] text-xs font-mono">@{workspace.slug}</span>
                        
                        {/* Privacy Badge */}
                        <Badge className="h-3.5 px-1.5 text-[8px] font-medium bg-[#6e7681]/20 text-[#8b949e] border-0 rounded flex items-center gap-1">
                          {workspace.isPublic ? (
                            <>
                              <Globe className="h-2 w-2" />
                              Public
                            </>
                          ) : (
                            <>
                              <Lock className="h-2 w-2" />
                              Private
                            </>
                          )}
                        </Badge>

                        {/* Member Count Badge */}
                        <Badge className="h-3.5 px-1.5 text-[8px] font-medium bg-[#58a6ff]/20 text-[#58a6ff] border-0 rounded flex items-center gap-1">
                          <Users className="h-2 w-2" />
                          {workspace.members.length}
                        </Badge>

                        {/* Creation Date */}
                        <div className="flex items-center gap-1 text-[#6e7681] text-xs">
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(workspace.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>

                      {workspace.description && (
                        <p className="text-[#8b949e] text-xs mt-1 truncate">{workspace.description}</p>
                      )}
                    </div>

                    {/* Metrics and Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 mr-4">
                      {/* Activity Badge */}
                      {workspace.lastActivityAt && (
                        <Badge className="h-5 px-2 text-[10px] font-medium leading-none bg-[#22c55e]/20 text-[#22c55e] border-0 rounded-md">
                          Active {format(new Date(workspace.lastActivityAt), 'MMM d')}
                        </Badge>
                      )}

                      {/* Project Count Badge */}
                      {workspace.projectCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-[#58a6ff]/20 text-[#58a6ff] rounded-md">
                          <Building2 className="h-3 w-3" />
                          <span className="text-[10px] font-medium">{workspace.projectCount}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <DashboardButton workspaceId={workspace.id} />
                      {(workspace.ownerId === userId || session?.user?.role === 'SYSTEM_ADMIN') ? (
                        <Link href={`/workspaces/${workspace.id}`}>
                          <Button variant="outline" size="sm" className="border-[#30363d] text-[#8b949e] hover:bg-[#1a1a1a] hover:text-[#e6edf3]">
                            <Settings className="mr-1.5 h-3 w-3" />
                            Manage
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="outline" size="sm" disabled className="border-[#30363d] text-[#6e7681]" title="Only workspace owners and admins can manage workspaces">
                          <Settings className="mr-1.5 h-3 w-3" />
                          Manage
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-[#8b949e]">
                <div className="text-center">
                  <Building2 className="h-8 w-8 mx-auto mb-2 text-[#6e7681]" />
                  <p className="text-sm">No workspaces yet</p>
                  <p className="text-xs text-[#6e7681] mt-1 mb-3">
                    Create a workspace to start collaborating with your team
                  </p>
                  <Button 
                    size="sm" 
                    className="bg-[#238636] hover:bg-[#2ea043] text-white border-0"
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    <Plus className="mr-1.5 h-3 w-3" />
                    Create Your First Workspace
                  </Button>
                </div>
              </div>
            )
          ) : (
            isLoadingInvitations && initialInvitations.length === 0 ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
              </div>
            ) : pendingInvitations.length > 0 ? (
              <div>
                {pendingInvitations.map((invitation: any) => (
                  <div 
                    key={invitation.id} 
                    className="group flex items-center px-6 py-2 border-b border-[#1f1f1f] hover:bg-[#0f1011] hover:border-[#333] transition-all duration-150 cursor-pointer"
                  >
                    {/* Invitation Icon */}
                    <div className="flex items-center w-12 mr-4 flex-shrink-0">
                      {invitation.workspace.logoUrl ? (
                        <Image
                          src={invitation.workspace.logoUrl}
                          alt={invitation.workspace.name}
                          className="h-8 w-8 rounded border border-[#30363d]"
                          width={32}
                          height={32}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded border border-[#30363d] bg-[#1a1a1a] flex items-center justify-center">
                          <Mail className="h-4 w-4 text-[#8b949e]" />
                        </div>
                      )}
                    </div>

                    {/* Invitation Info */}
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
                          {invitation.workspace.name}
                        </span>
                        <Badge className="h-4 px-1.5 text-[9px] font-medium bg-[#f85149]/30 text-[#f85149] border-0 rounded flex items-center gap-1">
                          <Mail className="h-2.5 w-2.5" />
                          Pending
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[#8b949e] text-xs font-mono">@{invitation.workspace.slug}</span>
                        
                        {/* Invited by Badge */}
                        <Badge className="h-3.5 px-1.5 text-[8px] font-medium bg-[#6e7681]/20 text-[#8b949e] border-0 rounded flex items-center gap-1">
                          <Users className="h-2 w-2" />
                          by {invitation.invitedBy.name || invitation.invitedBy.email.split('@')[0]}
                        </Badge>

                        {/* Role Badge */}
                        <Badge className="h-3.5 px-1.5 text-[8px] font-medium bg-[#8b5cf6]/20 text-[#8b5cf6] border-0 rounded">
                          {invitation.role || 'Member'}
                        </Badge>

                        {/* Expiry Warning */}
                        <div className="flex items-center gap-1 text-[#f59e0b] text-xs">
                          <Calendar className="h-2.5 w-2.5" />
                          Expires {format(new Date(invitation.expiresAt), 'MMM d')}
                        </div>
                      </div>

                      {invitation.workspace.description && (
                        <p className="text-[#8b949e] text-xs mt-1 truncate">{invitation.workspace.description}</p>
                      )}
                    </div>

                    {/* Metrics and Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 mr-4">
                      {/* Urgency Badge */}
                      {new Date(invitation.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
                        <Badge className="h-5 px-2 text-[10px] font-medium leading-none bg-[#f59e0b]/20 text-[#f59e0b] border-0 rounded-md">
                          Expires Soon
                        </Badge>
                      )}
                    </div>

                    {/* Action */}
                    <div className="flex items-center flex-shrink-0">
                      <Button 
                        asChild 
                        variant="outline" 
                        size="sm" 
                        className="border-[#238636] text-[#238636] hover:bg-[#238636] hover:text-white"
                      >
                        <Link href={`/workspace-invitation/${invitation.token}`}>
                          Accept
                          <ArrowRight className="ml-1.5 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-[#8b949e]">
                <div className="text-center">
                  <Mail className="h-8 w-8 mx-auto mb-2 text-[#6e7681]" />
                  <p className="text-sm">No pending invitations</p>
                  <p className="text-xs text-[#6e7681] mt-1">
                    You don&apos;t have any pending workspace invitations. Ask a workspace admin to invite you.
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal 
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
} 