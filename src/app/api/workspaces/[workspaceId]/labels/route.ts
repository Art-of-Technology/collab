import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

// GET /api/workspaces/[workspaceId]/labels - List labels for a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId } = await params;

    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Verify access
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const labels = await prisma.taskLabel.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    });

    return NextResponse.json({ labels });
  } catch (error) {
    console.error("[WORKSPACE_LABELS_GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

