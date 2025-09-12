import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    // Check if project exists and user has access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Add user as project follower
    await prisma.projectFollower.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: currentUser.id
        }
      },
      update: {},
      create: {
        projectId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully following project" });
  } catch (error) {
    console.error("Error following project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    // Check if project exists and user has access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Remove user as project follower
    await prisma.projectFollower.deleteMany({
      where: {
        projectId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully unfollowed project" });
  } catch (error) {
    console.error("Error unfollowing project:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { projectId } = resolvedParams;

    // Check if project exists and user has access
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 404 });
    }

    // Return lightweight follow status and count only
    const [followRecord, count] = await Promise.all([
      prisma.projectFollower.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: currentUser.id
          }
        }
      }),
      prisma.projectFollower.count({ where: { projectId } })
    ]);

    return NextResponse.json({
      isFollowing: !!followRecord,
      count
    });
  } catch (error) {
    console.error("Error getting project follow status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


