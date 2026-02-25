/* eslint-disable */
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Settings, Users, Shield, AlertTriangle, Clock, UserCircleIcon, ShoppingBag } from 'lucide-react';
import { WorkspaceRole, Permission, getRoleDisplayName, getPermissionDisplayName } from '@/lib/permissions';

interface PermissionItem {
  id: string;
  workspaceId: string;
  role: WorkspaceRole;
  permission: Permission;
  enabled: boolean;
}

interface PermissionsManagerProps {
  workspaceId: string;
  currentUserRole: WorkspaceRole;
}

interface PermissionGroup {
  name: string;
  permissions: Permission[];
  description: string;
  icon: React.ReactNode;
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: 'Posts & Communication',
    description: 'Manage posts, comments, and general communication',
    icon: <Users className="h-4 w-4" />,
    permissions: [
      Permission.CREATE_POST,
      Permission.EDIT_SELF_POST,
      Permission.EDIT_ANY_POST,
      Permission.DELETE_SELF_POST,
      Permission.DELETE_ANY_POST,
      Permission.VIEW_POSTS,
      Permission.COMMENT_ON_POST,
      Permission.EDIT_SELF_COMMENT,
      Permission.EDIT_ANY_COMMENT,
      Permission.DELETE_SELF_COMMENT,
      Permission.DELETE_ANY_COMMENT,
      Permission.REACT_TO_POST,
      Permission.REACT_TO_COMMENT,
      Permission.MENTION_USERS,
      Permission.BOOKMARK_POST,
      Permission.PIN_POST,
      Permission.RESOLVE_BLOCKER,
    ]
  },
  {
    name: 'Task Management',
    description: 'Control task creation, editing, and assignment',
    icon: <Settings className="h-4 w-4" />,
    permissions: [
      Permission.CREATE_TASK,
      Permission.EDIT_SELF_TASK,
      Permission.EDIT_ANY_TASK,
      Permission.DELETE_SELF_TASK,
      Permission.DELETE_ANY_TASK,
      Permission.ASSIGN_TASK,
      Permission.CHANGE_TASK_STATUS,
      Permission.COMMENT_ON_TASK,
      Permission.VIEW_TASKS,
    ]
  },
  {
    name: 'Board Management',
    description: 'Manage boards and project organization',
    icon: <Settings className="h-4 w-4" />,
    permissions: [
      Permission.CREATE_BOARD,
      Permission.EDIT_BOARD,
      Permission.DELETE_BOARD,
      Permission.MANAGE_BOARD_SETTINGS,
      Permission.VIEW_BOARDS,
    ]
  },
  {
    name: 'Project Planning',
    description: 'Epics, stories, milestones, and feature requests',
    icon: <Settings className="h-4 w-4" />,
    permissions: [
      Permission.CREATE_MILESTONE,
      Permission.EDIT_SELF_MILESTONE,
      Permission.EDIT_ANY_MILESTONE,
      Permission.DELETE_SELF_MILESTONE,
      Permission.DELETE_ANY_MILESTONE,
      Permission.VIEW_MILESTONES,
      Permission.CREATE_EPIC,
      Permission.EDIT_SELF_EPIC,
      Permission.EDIT_ANY_EPIC,
      Permission.DELETE_SELF_EPIC,
      Permission.DELETE_ANY_EPIC,
      Permission.VIEW_EPICS,
      Permission.CREATE_STORY,
      Permission.EDIT_SELF_STORY,
      Permission.EDIT_ANY_STORY,
      Permission.DELETE_SELF_STORY,
      Permission.DELETE_ANY_STORY,
      Permission.VIEW_STORIES,
      Permission.CREATE_FEATURE_REQUEST,
      Permission.EDIT_SELF_FEATURE_REQUEST,
      Permission.EDIT_ANY_FEATURE_REQUEST,
      Permission.DELETE_SELF_FEATURE_REQUEST,
      Permission.DELETE_ANY_FEATURE_REQUEST,
      Permission.VOTE_ON_FEATURE,
      Permission.COMMENT_ON_FEATURE,
      Permission.VIEW_FEATURES,
    ]
  },
  {
    name: 'Messages & Communication',
    description: 'Direct messaging and communication',
    icon: <Users className="h-4 w-4" />,
    permissions: [
      Permission.SEND_MESSAGE,
      Permission.VIEW_MESSAGES,
      Permission.DELETE_SELF_MESSAGE,
      Permission.DELETE_ANY_MESSAGE,
    ]
  },
  {
    name: 'Notes & Documentation',
    description: 'Personal and shared note management',
    icon: <Settings className="h-4 w-4" />,
    permissions: [
      Permission.CREATE_NOTE,
      Permission.EDIT_SELF_NOTE,
      Permission.EDIT_ANY_NOTE,
      Permission.DELETE_SELF_NOTE,
      Permission.DELETE_ANY_NOTE,
      Permission.VIEW_NOTES,
    ]
  },
  {
    name: 'HR & Leave Management',
    description: 'Human resources and employee leave management',
    icon: <UserCircleIcon className="h-4 w-4" />,
    permissions: [
      Permission.MANAGE_LEAVE,
    ]
  },
  {
    name: "App Store Management",
    description: "Manage access to install apps",
    icon: <ShoppingBag className="h-4 w-4" />,
    permissions: [Permission.MANAGE_APPS],
  },
  {
    name: 'Workspace Administration',
    description: 'High-level workspace management and settings',
    icon: <Shield className="h-4 w-4" />,
    permissions: [
      Permission.MANAGE_WORKSPACE_SETTINGS,
      Permission.MANAGE_WORKSPACE_MEMBERS,
      Permission.MANAGE_WORKSPACE_PERMISSIONS,
      Permission.VIEW_WORKSPACE_ANALYTICS,
      Permission.INVITE_MEMBERS,
      Permission.REMOVE_MEMBERS,
      Permission.CHANGE_MEMBER_ROLES,
      Permission.VIEW_MEMBER_LIST,
      Permission.MANAGE_INTEGRATIONS,
      Permission.EXPORT_DATA,
      Permission.IMPORT_DATA,
      Permission.VIEW_AUDIT_LOGS,
      Permission.MANAGE_NOTIFICATIONS,
      Permission.VIEW_REPORTS,
    ]
  },
];

export default function PermissionsManager({ workspaceId, currentUserRole }: PermissionsManagerProps) {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, PermissionItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [roleToReset, setRoleToReset] = useState<WorkspaceRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>(Object.values(WorkspaceRole)[0]);

  const fetchPermissions = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/permissions`);
      if (!response.ok) {
        throw new Error('Failed to fetch permissions');
      }

      const data = await response.json();
      setPermissions(data.permissions);
      setPermissionsByRole(data.permissionsByRole);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load permissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [workspaceId]);

  const updatePermission = async (role: WorkspaceRole, permission: Permission, enabled: boolean) => {
    const updateKey = `${role}-${permission}`;
    setUpdating(updateKey);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          permission,
          enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update permission');
      }

      // Update local state by adding/removing permissions
      if (enabled) {
        // Add permission if enabling and doesn't exist
        const exists = permissions.some(p => p.role === role && p.permission === permission);
        if (!exists) {
          const newPermission = {
            id: `${workspaceId}-${role}-${permission}`,
            workspaceId,
            role,
            permission,
            enabled: true
          };
          setPermissions(prev => [...prev, newPermission]);
          setPermissionsByRole(prev => ({
            ...prev,
            [role]: [...(prev[role] || []), newPermission]
          }));
        }
      } else {
        // Remove permission if disabling
        setPermissions(prev =>
          prev.filter(p => !(p.role === role && p.permission === permission))
        );
        setPermissionsByRole(prev => ({
          ...prev,
          [role]: (prev[role] || []).filter(p => p.permission !== permission)
        }));
      }

      toast({
        title: 'Success',
        description: `Permission ${enabled ? 'enabled' : 'disabled'} for ${getRoleDisplayName(role)}`,
      });
    } catch (error: any) {
      console.error('Error updating permission:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update permission',
        variant: 'destructive',
      });
    } finally {
      setUpdating(null);
    }
  };

  const resetRolePermissions = async (role: WorkspaceRole) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/permissions/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset permissions');
      }

      await fetchPermissions();

      toast({
        title: 'Success',
        description: `Permissions for ${getRoleDisplayName(role)} have been reset to defaults`,
      });
    } catch (error: any) {
      console.error('Error resetting permissions:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset permissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setResetDialogOpen(false);
      setRoleToReset(null);
    }
  };

  const getPermissionStatus = (role: WorkspaceRole, permission: Permission): boolean => {
    const rolePermissions = permissionsByRole[role] || [];
    const permissionItem = rolePermissions.find(p => p.permission === permission);
    return !!permissionItem; // Permission exists = enabled, doesn't exist = disabled
  };

  const isPermissionUpdating = (role: WorkspaceRole, permission: Permission): boolean => {
    return updating === `${role}-${permission}`;
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
          <h2 className="text-2xl font-bold">Permissions Management</h2>
          <p className="text-muted-foreground">
            Configure role-based permissions for this workspace
          </p>
        </div>
        <Button onClick={fetchPermissions} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">Select Role</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.values(WorkspaceRole).map((role) => (
              <Button
                key={role}
                variant="ghost"
                onClick={() => setSelectedRole(role)}
                className={`p-4 rounded-lg border text-left transition-all duration-200 hover:shadow-md ${selectedRole === role
                    ? 'bg-primary text-primary-foreground border-primary shadow-lg'
                    : 'bg-card border-border hover:bg-accent/50'
                  }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{getRoleDisplayName(role)}</span>
                  <span className={`text-xs mt-1 ${selectedRole === role ? 'opacity-80' : 'text-muted-foreground'
                    }`}>
                    {permissionsByRole[role]?.length || 0} permissions
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border">
            <div>
              <h3 className="text-lg font-semibold">{getRoleDisplayName(selectedRole)} Permissions</h3>
              <p className="text-sm text-muted-foreground">
                {permissionsByRole[selectedRole]?.length || 0} of {Object.values(Permission).length} permissions enabled
              </p>
            </div>
            <Button
              onClick={() => {
                setRoleToReset(selectedRole);
                setResetDialogOpen(true);
              }}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>

          <div className="grid gap-4">
            {PERMISSION_GROUPS.map((group) => (
              <Card key={group.name} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {group.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      <CardDescription className="text-sm mt-1">
                        {group.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                    {group.permissions.map((permission) => {
                      const isEnabled = getPermissionStatus(selectedRole, permission);
                      const isUpdatingThis = isPermissionUpdating(selectedRole, permission);
                      
                      // List of permissions that are fully implemented and can be toggled
                      const implementedPermissions = [
                        Permission.PIN_POST,
                        Permission.RESOLVE_BLOCKER,
                        Permission.MANAGE_WORKSPACE_PERMISSIONS,
                        Permission.CREATE_BOARD,
                        Permission.EDIT_BOARD,
                        Permission.MANAGE_BOARD_SETTINGS,
                        Permission.MANAGE_LEAVE,
                        Permission.INVITE_MEMBERS,
                        Permission.MANAGE_APPS,
                      ];
                      const isPermissionImplemented = implementedPermissions.includes(permission);
                      
                      const isDisabled =
                        isUpdatingThis ||
                        (!isPermissionImplemented) ||
                        (permission === Permission.MANAGE_WORKSPACE_PERMISSIONS &&
                          selectedRole === currentUserRole &&
                          isEnabled);

                      return (
                        <div
                          key={permission}
                          className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-200 ${isEnabled
                              ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                              : 'bg-card hover:bg-accent/30'
                            } ${!isPermissionImplemented ? 'opacity-50' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium leading-none">
                                {getPermissionDisplayName(permission)}
                              </p>
                              {isEnabled && (
                                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              )}
                              {!isPermissionImplemented && (
                                <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-md">
                                  Coming Soon
                                </div>
                              )}
                            </div>
                            {permission === Permission.MANAGE_WORKSPACE_PERMISSIONS &&
                              selectedRole === currentUserRole && (
                                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  Cannot disable own access
                                </div>
                              )}
                            {!isPermissionImplemented && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                <Clock className="h-3 w-3" />
                                This permission is not yet integrated
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {isUpdatingThis && (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            )}
                            <Switch
                              checked={isEnabled}
                              disabled={isDisabled}
                              onCheckedChange={(enabled) =>
                                updatePermission(selectedRole, permission, enabled)
                              }
                              className="data-[state=checked]:bg-green-600"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Permissions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset all permissions for{' '}
              <strong>{roleToReset ? getRoleDisplayName(roleToReset) : ''}</strong> to default values?
              This will overwrite any custom permission settings for this role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleToReset && resetRolePermissions(roleToReset)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset Permissions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}  