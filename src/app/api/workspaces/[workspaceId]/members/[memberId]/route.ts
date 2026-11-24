import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from "@/lib/session";
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { MemberMutationError, switchMemberStatus } from '@/lib/workspace-membership';

// PATCH /api/workspaces/[workspaceId]/members/[memberId] - Update member status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  const _params = await params;
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, memberId } = _params;
    const body = await request.json();
    const { status } = body;

    if (typeof status !== 'boolean') {
      return NextResponse.json({ error: "Status must be a boolean" }, { status: 400 });
    }

    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const updatedMember = await switchMemberStatus(user.id, workspaceId, memberId, status, true);
    return NextResponse.json(updatedMember);
  } catch (error) {
    if (error instanceof MemberMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Error updating member status:", error);
    return NextResponse.json(
      { error: "Failed to update member status" },
      { status: 500 }
    );
  }
}
