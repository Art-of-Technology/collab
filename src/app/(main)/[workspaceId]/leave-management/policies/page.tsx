import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";
import LeavePolicyManagementClient from "@/components/hr/LeavePolicyManagementClient";


export const metadata: Metadata = {
  title: "Leave Policy Management",
  description: "Manage leave policies and types for your workspace",
};

async function checkPolicyManagementPermissions(workspaceId: string, userId: string) {
  // Check if user can manage leave policies
  const canManageLeave = await checkUserPermission(
    userId,
    workspaceId,
    Permission.MANAGE_LEAVE
  );

  return {
    hasAccess: canManageLeave.hasPermission,
    userRole: canManageLeave.userRole,
  };
}

export default async function LeavePolicyManagementPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(session.user, !!params.workspaceId);

  // Check permissions for leave policy management
  const { hasAccess } = await checkPolicyManagementPermissions(
    workspaceId,
    session.user.id
  );

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to manage leave policies. Please contact your workspace administrator for access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <LeavePolicyManagementClient workspaceId={workspaceId} />
  );
}