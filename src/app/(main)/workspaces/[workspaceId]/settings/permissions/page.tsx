import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission, getUserWorkspaceRole } from '@/lib/permissions';
import PermissionsManager from '@/components/workspace/PermissionsManager';
import MemberManager from '@/components/workspace/MemberManager';
import CustomRolesManager from '@/components/workspace/CustomRolesManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Users, ArrowLeft, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface PermissionsPageProps {
  params: {
    workspaceId: string;
  };
}

async function PermissionsPageContent({ workspaceId }: { workspaceId: string }) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Check if user has permission to manage workspace permissions
  const hasPermission = await checkUserPermission(
    session.user.id,
    workspaceId,
    Permission.MANAGE_WORKSPACE_PERMISSIONS
  );

  if (!hasPermission.hasPermission) {
    notFound();
  }

  // Get user's role in the workspace
  const userRole = await getUserWorkspaceRole(session.user.id, workspaceId);
  
  if (!userRole) {
    notFound();
  }

  // Get workspace info
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      description: true,
    }
  });

  if (!workspace) {
    notFound();
  }

  return (
    <div className="container mx-auto p-0">
      <div className="mb-6">
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to workspace settings
          </Button>
        </Link>
      </div>
      
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold">Permissions & Roles</h1>
        <p className="text-muted-foreground">
          Manage permissions and member roles for <strong>{workspace.name}</strong>
        </p>
      </div>

      <Tabs defaultValue="permissions" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="permissions" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Role Permissions
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Member Roles
          </TabsTrigger>
          <TabsTrigger value="custom-roles" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Custom Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <CardTitle>Role Permissions</CardTitle>
              </div>
              <CardDescription>
                Configure what each role can do in this workspace. Changes apply immediately to all users with that role.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PermissionsManager 
                workspaceId={workspaceId} 
                currentUserRole={userRole as any}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Member Roles</CardTitle>
              </div>
              <CardDescription>
                Assign roles to workspace members. Each role has different permissions that can be customized in the Permissions tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemberManager 
                workspaceId={workspaceId}
                currentUserId={session.user.id}
                currentUserRole={userRole}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom-roles" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                <CardTitle>Custom Roles</CardTitle>
              </div>
              <CardDescription>
                Create custom roles with specific permissions tailored to your workspace needs. Custom roles can be assigned to members just like built-in roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomRolesManager workspaceId={workspaceId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermissionsPageSkeleton() {
  return (
    <div className="container mx-auto p-0">
      <div className="border-b pb-4">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Skeleton key={j} className="h-16 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function PermissionsPage({ params }: PermissionsPageProps) {
  const _params = await params;
  const { workspaceId } = _params;

  return (
    <Suspense fallback={<PermissionsPageSkeleton />}>
      <PermissionsPageContent workspaceId={workspaceId} />
    </Suspense>
  );
} 