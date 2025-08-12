import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leave/balances?workspaceId=xxx&year=2024 - Get user's leave balances for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const year = url.searchParams.get("year");
    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify user has access to this workspace (owner or member)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: { userId: user.id },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const isOwner = workspace.ownerId === user.id;
    const isMember = workspace.members.length > 0;

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: "Access denied to workspace" },
        { status: 403 }
      );
    }

    const leaveBalances = await prisma.leaveBalance.findMany({
      where: {
        userId: user.id,
        year: currentYear,
        policy: {
          workspaceId: workspaceId,
        },
      },
      include: {
        policy: {
          select: {
            id: true,
            name: true,
            isPaid: true,
            trackIn: true,
            accrualType: true,
            maxBalance: true,
          },
        },
      },
      orderBy: {
        policy: {
          name: "asc",
        },
      },
    });

    // Transform the data to match the expected interface
    const transformedBalances = leaveBalances.map((balance) => ({
      policyId: balance.policyId,
      policyName: balance.policy.name,
      totalAccrued: balance.totalAccrued,
      totalUsed: balance.totalUsed,
      balance: balance.balance,
      rollover: balance.rollover,
      year: balance.year,
      trackUnit: balance.policy.trackIn,
      isPaid: balance.policy.isPaid,
      accrualType: balance.policy.accrualType,
      maxBalance: balance.policy.maxBalance,
    }));

    return NextResponse.json(transformedBalances);
  } catch (error) {
    console.error("Error fetching leave balances:", error);
    return NextResponse.json(
      { error: "Failed to fetch leave balances" },
      { status: 500 }
    );
  }
}
