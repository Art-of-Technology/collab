import { getCurrentUser } from "@/lib/session";
import { verifyWorkspaceAccess } from "@/lib/workspace-helpers";
import { prisma } from "@/lib/prisma";
import TimelinePageClient from "./TimelinePageClient";

export const dynamic = "force-dynamic";

interface TimelinePageProps {
  params: { workspaceId: string };
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { workspaceId } = await params;
  const user = await getCurrentUser();

  // Verify workspace access and redirect if needed
  await verifyWorkspaceAccess(user);

  // Get workspace slug
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  });

  // Handle slug-based URLs
  let actualWorkspaceId = workspaceId;
  let workspaceSlug = workspace?.slug || workspaceId;

  if (!workspace) {
    // workspaceId might be a slug
    const workspaceBySlug = await prisma.workspace.findUnique({
      where: { slug: workspaceId },
      select: { id: true, slug: true },
    });
    if (workspaceBySlug) {
      actualWorkspaceId = workspaceBySlug.id;
      workspaceSlug = workspaceBySlug.slug;
    }
  }

  return (
    <TimelinePageClient
      workspaceId={actualWorkspaceId}
      workspaceSlug={workspaceSlug}
    />
  );
}
