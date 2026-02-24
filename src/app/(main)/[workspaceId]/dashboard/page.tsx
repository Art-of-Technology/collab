import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { verifyWorkspaceAccess, getWorkspaceSlugOrId } from "@/lib/workspace-helpers";
import DashboardClient from "./components/DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your AI-powered workspace dashboard",
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId: workspaceIdParam } = await params;
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Verify workspace access and redirect if needed
  let workspaceId = "";
  let workspaceSlug = "";
  try {
    workspaceId = await verifyWorkspaceAccess(session.user);
    workspaceSlug = await getWorkspaceSlugOrId(session.user, workspaceIdParam) || workspaceIdParam;
  } catch (error) {
    console.error("Error verifying workspace access:", error);
    redirect("/welcome");
  }

  return (
    <DashboardClient
      workspaceId={workspaceId}
      workspaceSlug={workspaceSlug}
      userName={session.user.name || ""}
    />
  );
}
