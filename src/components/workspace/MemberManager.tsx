/* eslint-disable */
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserCog, Users, Crown, Shield, Sparkles } from 'lucide-react';
import { WorkspaceRole, getRoleDisplayName } from '@/lib/permissions';
import { useCustomRoles } from '@/hooks/queries/useCustomRoles';

interface WorkspaceMember {
  id: string;
  userId: string;
  role: string; // Changed to string to support custom roles
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

interface MemberManagerProps {
  workspaceId: string;
  currentUserId: string;
  currentUserRole: string; // Changed to string to support custom roles
}

export default function MemberManager({ workspaceId, currentUserId, currentUserRole }: MemberManagerProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingMember, setUpdatingMember] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    member: WorkspaceMember | null;
    newRole: string | null;
  }>({
    open: false,
    member: null,
    newRole: null,
  });

  // Fetch custom roles
  const { data: customRoles } = useCustomRoles(workspaceId);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      
      const data = await response.json();
      setMembers(data);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load workspace members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [workspaceId]);

  const updateMemberRole = async (memberId: string, newRole: string) => {
    setUpdatingMember(memberId);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update member role');
      }

      const { member } = await response.json();

      // Update local state
      setMembers(prev => 
        prev.map(m => 
          m.id === memberId 
            ? { ...m, role: newRole }
            : m
        )
      );

      toast({
        title: 'Success',
        description: `${member.user.name}'s role has been updated to ${getDisplayName(newRole)}`,
      });
    } catch (error: any) {
      console.error('Error updating member role:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update member role',
        variant: 'destructive',
      });
    } finally {
      setUpdatingMember(null);
      setConfirmDialog({ open: false, member: null, newRole: null });
    }
  };

  const handleRoleChange = (member: WorkspaceMember, newRole: string) => {
    // If it's a significant role change, show confirmation
    const isSignificantChange = 
      (member.role === 'OWNER' && newRole !== 'OWNER') ||
      (member.role === 'ADMIN' && newRole === 'VIEWER') ||
      (member.role === 'ADMIN' && newRole === 'GUEST');

    if (isSignificantChange) {
      setConfirmDialog({
        open: true,
        member,
        newRole,
      });
    } else {
      updateMemberRole(member.id, newRole);
    }
  };

  const canManageRole = (member: WorkspaceMember): boolean => {
    // Can't manage own role
    if (member.userId === currentUserId) return false;
    
    // Owners can manage all roles
    if (currentUserRole === 'OWNER') return true;
    
    // Admins can manage non-owner/admin roles
    if (currentUserRole === 'ADMIN') {
      return member.role !== 'OWNER' && member.role !== 'ADMIN';
    }
    
    return false;
  };

  const getRoleIcon = (role: string) => {
    // Check if it's a custom role
    const customRole = customRoles?.find(r => r.name === role);
    if (customRole) {
      return <Sparkles className="h-3 w-3" style={{ color: customRole.color || '#6366F1' }} />;
    }

    switch (role) {
      case 'OWNER':
        return <Crown className="h-3 w-3 text-yellow-500" />;
      case 'ADMIN':
        return <Shield className="h-3 w-3 text-blue-500" />;
      default:
        return <Users className="h-3 w-3 text-gray-500" />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    // Custom roles get a special variant
    if (customRoles?.some(r => r.name === role)) {
      return 'default';
    }

    switch (role) {
      case 'OWNER':
        return 'default';
      case 'ADMIN':
        return 'secondary';
      case 'VIEWER':
      case 'GUEST':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getDisplayName = (role: string): string => {
    // Check if it's a custom role
    const customRole = customRoles?.find(r => r.name === role);
    if (customRole) {
      return customRole.name;
    }

    // Otherwise use the built-in role display name
    return getRoleDisplayName(role as WorkspaceRole);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Member Management</h2>
          <p className="text-muted-foreground">
            Manage workspace members and their roles
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4">
        {members.map((member) => {
          const isUpdating = updatingMember === member.id;
          const canManage = canManageRole(member);

          return (
            <Card key={member.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.user.image || ''} alt={member.user.name} />
                      <AvatarFallback>
                        {member.user.name?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{member.user.name}</p>
                        {member.userId === currentUserId && (
                          <Badge variant="outline" className="text-xs">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(member.role)}
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {getDisplayName(member.role)}
                      </Badge>
                    </div>

                    {canManage ? (
                      <div className="flex items-center gap-2">
                        {isUpdating && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        <Select
                          value={member.role}
                          onValueChange={(value) => handleRoleChange(member, value)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Built-in roles */}
                            <div className="mb-2">
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                Built-in Roles
                              </div>
                              {Object.values(WorkspaceRole).map((role) => {
                                // Only owners can assign owner role
                                if (role === WorkspaceRole.OWNER && currentUserRole !== 'OWNER') {
                                  return null;
                                }
                                // Admins can't assign admin role
                                if (role === WorkspaceRole.ADMIN && currentUserRole === 'ADMIN') {
                                  return null;
                                }
                                
                                return (
                                  <SelectItem key={role} value={role}>
                                    <div className="flex items-center gap-2">
                                      {getRoleIcon(role)}
                                      {getRoleDisplayName(role)}
                                    </div>
                                  </SelectItem>
                                );
                              })}
                            </div>

                            {/* Custom roles */}
                            {customRoles && customRoles.length > 0 && (
                              <>
                                <div className="border-t mx-2 my-2" />
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  Custom Roles
                                </div>
                                {customRoles.map((customRole) => (
                                  <SelectItem key={customRole.id} value={customRole.name}>
                                    <div className="flex items-center gap-2">
                                      <Sparkles 
                                        className="h-3 w-3" 
                                        style={{ color: customRole.color || '#6366F1' }} 
                                      />
                                      {customRole.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <UserCog className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => setConfirmDialog({ open, member: null, newRole: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change
              <strong>{confirmDialog.member?.user.name}</strong>&apos;s role from
              <strong>{confirmDialog.member ? getDisplayName(confirmDialog.member.role) : ''}</strong> to
              <strong>{confirmDialog.newRole ? getDisplayName(confirmDialog.newRole) : ''}</strong>?
              {confirmDialog.member?.role === 'OWNER' && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
                  <strong>Warning:</strong> This will remove their workspace ownership privileges.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog.member && confirmDialog.newRole) {
                  updateMemberRole(confirmDialog.member.id, confirmDialog.newRole);
                }
              }}
            >
              Change Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 