import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { ActivityService } from "@/lib/activity-service";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = params;

    // Check if user is a member of this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        status: true,
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const teamActivity = await ActivityService.getTeamActivity(workspaceId);

    return NextResponse.json({
      success: true,
      teamActivity,
    });
  } catch (error) {
    console.error("Error getting team activity:", error);
    return NextResponse.json(
      { error: "Failed to get team activity" },
      { status: 500 }
    );
  }
} 