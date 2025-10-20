import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Disconnect GitHub account from user
 * POST /api/github/oauth/disconnect
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear GitHub credentials from user account
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
      },
    });

    console.log(`GitHub account disconnected for user: ${session.user.id}`);

    return NextResponse.json({
      success: true,
      message: "GitHub account disconnected successfully",
    });

  } catch (error) {
    console.error('Error disconnecting GitHub account:', error);
    return NextResponse.json(
      { error: "Failed to disconnect GitHub account" },
      { status: 500 }
    );
  }
}
