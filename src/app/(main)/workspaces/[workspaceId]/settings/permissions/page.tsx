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
  const { hasPermission } = await checkUserPermission(
    session.user.id,
    workspaceId,
    Permission.MANAGE_WORKSPACE_PERMISSIONS
  );

  if (!hasPermission) {
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href={`/workspaces/${workspaceId}`}>
          <Button variant="ghost" size="sm" className="pl-0 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to workspace settings
          </Button>
        </Link>
      </div>
      
      <div className="border-b border-border/40 pb-3 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Permissions & Roles</h1>
        <p className="text-sm text-muted-foreground">
          Manage permissions and member roles for <strong>{workspace.name}</strong>
        </p>
      </div>

      <Tabs defaultValue="permissions" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="permissions" className="flex items-center gap-1.5 text-sm">
            <Shield className="h-3 w-3" />
            Role Permissions
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-1.5 text-sm">
            <Users className="h-3 w-3" />
            Member Roles
          </TabsTrigger>
          <TabsTrigger value="custom-roles" className="flex items-center gap-1.5 text-sm">
            <Sparkles className="h-3 w-3" />
            Custom Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Role Permissions</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Configure what each role can do in this workspace. Changes apply immediately to all users with that role.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <PermissionsManager 
                workspaceId={workspaceId} 
                currentUserRole={userRole as any}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Member Roles</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Assign roles to workspace members. Each role has different permissions that can be customized in the Permissions tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MemberManager 
                workspaceId={workspaceId}
                currentUserId={session.user.id}
                currentUserRole={userRole}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom-roles" className="space-y-4">
          <Card className="border border-border/40 bg-card/50">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Custom Roles</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Create custom roles with specific permissions tailored to your workspace needs. Custom roles can be assigned to members just like built-in roles.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="border-b border-border/40 pb-3 mb-4">
        <Skeleton className="h-7 w-64 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />
        
        <Card className="border border-border/40 bg-card/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-3 w-full" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Skeleton key={j} className="h-14 w-full" />
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