import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Disconnect GitHub account from user
 * POST /api/github/oauth/disconnect
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Clear GitHub credentials from user account
    await prisma.user.update({
      where: { id: actor.id },
      data: {
        githubId: null,
        githubUsername: null,
        githubAccessToken: null,
      },
    });

    console.log(`GitHub account disconnected for user: ${actor.id}`);

    return NextResponse.json({
      success: true,
      message: "GitHub account disconnected successfully",
    }, { headers: { "Cache-Control": "no-store" } });

  } catch {
    console.error('Error disconnecting GitHub account');
    return NextResponse.json(
      { error: "Failed to disconnect GitHub account" },
      { status: 500 }
    );
  }
}
