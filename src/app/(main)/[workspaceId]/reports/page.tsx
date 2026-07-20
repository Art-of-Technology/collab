import { Metadata } from "next";
import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import ReportsPageClient from "./ReportsPageClient";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Reports",
  description: "Workspace reports",
};

export default async function ReportsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }
  const wsId = await verifyWorkspaceAccess(session.user, true, workspaceId);

  // Fetch initial User Task Report via API for consistent shape
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
  const userReportRes = await fetch(`${origin}/api/workspaces/${workspaceId}/reports/user-tasks`, { 
    cache: "no-store",
    headers: {
      cookie: h.get("cookie") || ""
    }
  });
  const userReport = userReportRes.ok ? await userReportRes.json() : { users: [] };

  // Fetch projects for selector
  const projects = await prisma.project.findMany({
    where: { workspaceId: wsId },
    select: { id: true, name: true, slug: true, color: true },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">User Task and Project-level metrics</p>
      </div>
      <ReportsPageClient
        workspaceId={workspaceId}
        initialUserReport={userReport}
        projects={projects}
      />
    </div>
  );
}


