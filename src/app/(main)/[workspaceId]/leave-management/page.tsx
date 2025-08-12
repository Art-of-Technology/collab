import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import { getWorkspaceLeaveRequests } from "@/actions/leave";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";
import { checkUserPermission, Permission } from "@/lib/permissions";
import LeaveManagementClient from "@/components/hr/LeaveManagementClient";

export const metadata: Metadata = {
  title: "Leave Management",
  description: "Review and manage leave requests from your team members",
};

async function checkLeaveManagementPermissions(workspaceId: string, userId: string) {
  // Check if user can manage leave
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

export default async function LeaveManagementPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(session.user);

  // Check permissions for leave management
  const { hasAccess } = await checkLeaveManagementPermissions(
    workspaceId,
    session.user.id
  );

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to manage leave requests. Please contact your workspace administrator for access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <LeaveManagementClient workspaceId={workspaceId} />
  );
}