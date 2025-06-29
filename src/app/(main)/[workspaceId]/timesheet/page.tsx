import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import { TimesheetClient } from "./components/TimesheetClient";

export const metadata: Metadata = {
  title: "Timesheet",
  description: "Track and manage your time across tasks and activities",
};

export default async function TimesheetPage() {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  const workspaceId = await verifyWorkspaceAccess(session.user);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">
          Track and analyze your time spent on tasks and activities
        </p>
      </div>

      <TimesheetClient workspaceId={workspaceId} userId={session.user.id} />
    </div>
  );
} 