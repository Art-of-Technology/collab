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

  return <TimesheetClient workspaceId={workspaceId} userId={session.user.id} />;
} 