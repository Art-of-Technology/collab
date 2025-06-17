'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCustomRoles, useCreateCustomRole, useUpdateCustomRole, useDeleteCustomRole } from '@/hooks/queries/useCustomRoles';

import { Permission, getPermissionDisplayName } from '@/lib/permissions';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
// Remove unused import

interface CustomRolesManagerProps {
    workspaceId: string;
}

interface CustomRole {
    id: string;
    name: string;
    description?: string | null;
    color?: string | null;
    permissions?: string[];
}

const DEFAULT_COLORS = [
    '#6366F1', // Indigo
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
];

const PERMISSION_CATEGORIES = {
    'Posts': [
        'CREATE_POST', 'EDIT_SELF_POST', 'EDIT_ANY_POST', 'DELETE_SELF_POST', 'DELETE_ANY_POST',
        'COMMENT_ON_POST', 'EDIT_SELF_COMMENT', 'EDIT_ANY_COMMENT', 'DELETE_SELF_COMMENT', 'DELETE_ANY_COMMENT',
        'REACT_TO_POST', 'REACT_TO_COMMENT', 'MENTION_USERS', 'VIEW_POSTS', 'BOOKMARK_POST', 'PIN_POST', 'RESOLVE_BLOCKER'
    ],
    'Tasks': [
        'CREATE_TASK', 'EDIT_SELF_TASK', 'EDIT_ANY_TASK', 'DELETE_SELF_TASK', 'DELETE_ANY_TASK',
        'ASSIGN_TASK', 'CHANGE_TASK_STATUS', 'COMMENT_ON_TASK', 'VIEW_TASKS'
    ],
    'Boards': [
        'CREATE_BOARD', 'EDIT_BOARD', 'DELETE_BOARD', 'MANAGE_BOARD_SETTINGS', 'VIEW_BOARDS'
    ],
    'Project Management': [
        'CREATE_MILESTONE', 'EDIT_SELF_MILESTONE', 'EDIT_ANY_MILESTONE', 'DELETE_SELF_MILESTONE', 'DELETE_ANY_MILESTONE', 'VIEW_MILESTONES',
        'CREATE_EPIC', 'EDIT_SELF_EPIC', 'EDIT_ANY_EPIC', 'DELETE_SELF_EPIC', 'DELETE_ANY_EPIC', 'VIEW_EPICS',
        'CREATE_STORY', 'EDIT_SELF_STORY', 'EDIT_ANY_STORY', 'DELETE_SELF_STORY', 'DELETE_ANY_STORY', 'VIEW_STORIES'
    ],
    'Features': [
        'CREATE_FEATURE_REQUEST', 'EDIT_SELF_FEATURE_REQUEST', 'EDIT_ANY_FEATURE_REQUEST',
        'DELETE_SELF_FEATURE_REQUEST', 'DELETE_ANY_FEATURE_REQUEST', 'VOTE_ON_FEATURE', 'COMMENT_ON_FEATURE', 'VIEW_FEATURES'
    ],
    'Messages & Notes': [
        'SEND_MESSAGE', 'VIEW_MESSAGES', 'DELETE_SELF_MESSAGE', 'DELETE_ANY_MESSAGE',
        'CREATE_NOTE', 'EDIT_SELF_NOTE', 'EDIT_ANY_NOTE', 'DELETE_SELF_NOTE', 'DELETE_ANY_NOTE', 'VIEW_NOTES'
    ],
    'Workspace Management': [
        'MANAGE_WORKSPACE_SETTINGS', 'MANAGE_WORKSPACE_MEMBERS', 'MANAGE_WORKSPACE_PERMISSIONS',
        'VIEW_WORKSPACE_ANALYTICS', 'INVITE_MEMBERS', 'REMOVE_MEMBERS', 'CHANGE_MEMBER_ROLES',
        'VIEW_MEMBER_LIST', 'MANAGE_INTEGRATIONS', 'EXPORT_DATA', 'IMPORT_DATA', 'VIEW_AUDIT_LOGS',
        'MANAGE_NOTIFICATIONS', 'VIEW_REPORTS'
    ]
};

export default function CustomRolesManager({ workspaceId }: CustomRolesManagerProps) {
    const { toast } = useToast();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
    const [deletingRole, setDeletingRole] = useState<CustomRole | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        color: DEFAULT_COLORS[0],
        permissions: [] as string[]
    });

    const { data: customRoles, isLoading: isLoadingRoles } = useCustomRoles(workspaceId);
    const createRole = useCreateCustomRole(workspaceId);
    const updateRole = useUpdateCustomRole(workspaceId, editingRole?.id || '');
    const deleteRole = useDeleteCustomRole(workspaceId);

    const handleCreateRole = async () => {
        try {
            await createRole.mutateAsync(formData);
            toast({
                title: 'Success',
                description: 'Custom role created successfully',
            });
            setIsCreateDialogOpen(false);
            resetForm();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to create custom role',
                variant: 'destructive',
            });
        }
    };

    const handleUpdateRole = async () => {
        if (!editingRole) return;

        try {
            await updateRole.mutateAsync(formData);
            toast({
                title: 'Success',
                description: 'Custom role updated successfully',
            });
            setEditingRole(null);
            resetForm();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to update custom role',
                variant: 'destructive',
            });
        }
    };

    const handleDeleteRole = async () => {
        if (!deletingRole) return;

        try {
            await deleteRole.mutateAsync(deletingRole.id);
            toast({
                title: 'Success',
                description: 'Custom role deleted successfully',
            });
            setDeletingRole(null);
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete custom role',
                variant: 'destructive',
            });
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            color: DEFAULT_COLORS[0],
            permissions: []
        });
    };

    const openEditDialog = (role: CustomRole) => {
        setEditingRole(role);
        setFormData({
            name: role.name,
            description: role.description || '',
            color: role.color || DEFAULT_COLORS[0],
            permissions: role.permissions || []
        });
    };

    const togglePermission = (permission: string) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permission)
                ? prev.permissions.filter(p => p !== permission)
                : [...prev.permissions, permission]
        }));
    };

    const selectAllInCategory = (permissions: string[]) => {
        // Only select implemented permissions
        const implementedPermissions = [
            'PIN_POST',
            'RESOLVE_BLOCKER',
            'MANAGE_WORKSPACE_PERMISSIONS'
        ];
        const implementedInCategory = permissions.filter(p => implementedPermissions.includes(p));
        
        setFormData(prev => ({
            ...prev,
            permissions: [
                ...new Set([...prev.permissions, ...implementedInCategory])
            ]
        }));
    };

    const deselectAllInCategory = (permissions: string[]) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.filter(p => !permissions.includes(p))
        }));
    };

    if (isLoadingRoles) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Custom Roles</h3>
                    <p className="text-sm text-muted-foreground">
                        Create custom roles with specific permissions for your workspace
                    </p>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Custom Role
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customRoles?.map((role) => (
                    <Card key={role.id}>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-8 w-8 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: role.color || DEFAULT_COLORS[0] }}
                                    >
                                        <Shield className="h-4 w-4 text-white" />
                                    </div>
                                    <CardTitle className="text-base">{role.name}</CardTitle>
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => openEditDialog(role)}
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive"
                                        onClick={() => setDeletingRole(role)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {role.description && (
                                <CardDescription className="mb-3">{role.description}</CardDescription>
                            )}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Shield className="h-4 w-4" />
                                <span>{role.permissions?.length || 0} permissions</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Create/Edit Dialog */}
            <Dialog
                open={isCreateDialogOpen || !!editingRole}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateDialogOpen(false);
                        setEditingRole(null);
                        resetForm();
                    }
                }}
            >
                <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6">
                        <DialogTitle>
                            {editingRole ? 'Edit Custom Role' : 'Create Custom Role'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingRole
                                ? 'Update the role details and permissions'
                                : 'Define a new role with specific permissions for your workspace'}
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="grid w-full grid-cols-2 mx-6 w-auto">
                            <TabsTrigger value="details">Role Details</TabsTrigger>
                            <TabsTrigger value="permissions">Permissions</TabsTrigger>
                        </TabsList>

                        <div className="flex-1 overflow-hidden">
                            <TabsContent value="details" className="h-full overflow-y-auto px-6 pb-6 mt-6">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Role Name</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="e.g., Content Reviewer"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Describe the purpose and responsibilities of this role"
                                            rows={3}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Color</Label>
                                        <div className="flex gap-2">
                                            {DEFAULT_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    className={`h-8 w-8 rounded-full transition-all ${formData.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''
                                                        }`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="permissions" className="h-full mt-0 px-6 pb-6">
                                <div className="h-full overflow-y-auto">
                                    <div className="space-y-6 py-6">
                                        {Object.entries(PERMISSION_CATEGORIES).map(([category, permissions]) => (
                                            <div key={category} className="space-y-3">
                                                <div className="flex items-center justify-between sticky top-0 bg-background z-10 pb-2">
                                                    <h4 className="text-sm font-medium">{category}</h4>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => selectAllInCategory(permissions)}
                                                        >
                                                            Select All
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => deselectAllInCategory(permissions)}
                                                        >
                                                            Deselect All
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {permissions.map((permission) => {
                                                        // List of permissions that are fully implemented and can be toggled
                                                        const implementedPermissions = [
                                                            'PIN_POST',
                                                            'RESOLVE_BLOCKER',
                                                            'MANAGE_WORKSPACE_PERMISSIONS'
                                                        ];
                                                        const isPermissionImplemented = implementedPermissions.includes(permission);
                                                        
                                                        return (
                                                            <div key={permission} className={`flex items-center space-x-2 ${!isPermissionImplemented ? 'opacity-50' : ''}`}>
                                                                <Checkbox
                                                                    id={permission}
                                                                    checked={formData.permissions.includes(permission)}
                                                                    disabled={!isPermissionImplemented}
                                                                    onCheckedChange={() => togglePermission(permission)}
                                                                />
                                                                <div className="flex flex-col flex-1">
                                                                    <Label
                                                                        htmlFor={permission}
                                                                        className="text-sm font-normal cursor-pointer"
                                                                    >
                                                                        {getPermissionDisplayName(permission as Permission)}
                                                                    </Label>
                                                                    {!isPermissionImplemented && (
                                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                                                            <Clock className="h-3 w-3" />
                                                                            Coming soon
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>

                    <DialogFooter className="px-6 py-4 border-t">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsCreateDialogOpen(false);
                                setEditingRole(null);
                                resetForm();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={editingRole ? handleUpdateRole : handleCreateRole}
                            disabled={!formData.name || createRole.isPending || updateRole.isPending}
                        >
                            {(createRole.isPending || updateRole.isPending) && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {editingRole ? 'Update Role' : 'Create Role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deletingRole} onOpenChange={() => setDeletingRole(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Custom Role</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete the &quot;{deletingRole?.name}&quot; role? This action cannot be undone.
                            {deletingRole?.permissions && deletingRole.permissions.length > 0 && (
                                <span className="block mt-2 text-amber-600">
                                    This role has {deletingRole.permissions.length} permissions configured.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteRole}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteRole.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Delete Role
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
} 