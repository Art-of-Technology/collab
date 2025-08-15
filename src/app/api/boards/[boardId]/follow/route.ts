import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { boardId } = resolvedParams;

    // Check if board exists and user has access
    const board = await prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found or access denied" }, { status: 404 });
    }

    // Add user as board follower
    await prisma.boardFollower.upsert({
      where: {
        boardId_userId: {
          boardId,
          userId: currentUser.id
        }
      },
      update: {}, // No updates needed if already exists
      create: {
        boardId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully following board" });
  } catch (error) {
    console.error("Error following board:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { boardId } = resolvedParams;

    // Check if board exists and user has access
    const board = await prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found or access denied" }, { status: 404 });
    }

    // Remove user as board follower
    await prisma.boardFollower.deleteMany({
      where: {
        boardId,
        userId: currentUser.id
      }
    });

    return NextResponse.json({ message: "Successfully unfollowed board" });
  } catch (error) {
    console.error("Error unfollowing board:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { boardId } = resolvedParams;

    // Check if board exists and user has access
    const board = await prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        workspace: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        }
      }
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found or access denied" }, { status: 404 });
    }

    // Check if user is following the board
    const isFollowing = await prisma.boardFollower.findUnique({
      where: {
        boardId_userId: {
          boardId,
          userId: currentUser.id
        }
      }
    });

    // Get all followers
    const followers = await prisma.boardFollower.findMany({
      where: { boardId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true,
          }
        }
      }
    });

    return NextResponse.json({
      isFollowing: !!isFollowing,
      followers: followers.map(f => f.user),
      count: followers.length
    });
  } catch (error) {
    console.error("Error getting board follow status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}