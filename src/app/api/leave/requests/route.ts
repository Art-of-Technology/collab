import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validation schema for creating a leave request
const createLeaveRequestSchema = z.object({
  policyId: z.string().min(1, "Policy ID is required"),
  startDate: z
    .string()
    .refine((str) => !isNaN(Date.parse(str)), {
      message: "startDate must be a valid ISO date string",
    })
    .transform((str) => new Date(str)),
  endDate: z
    .string()
    .refine((str) => !isNaN(Date.parse(str)), {
      message: "endDate must be a valid ISO date string",
    })
    .transform((str) => new Date(str)),
  duration: z.enum(["FULL_DAY", "HALF_DAY"]),
  notes: z
    .string()
    .min(1, "Notes are required")
    .max(500, "Notes cannot exceed 500 characters"),
});

/**
 * GET /api/leave/requests?workspaceId=xxx - Get user's leave requests for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");

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

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        policy: {
          workspaceId: workspaceId,
        },
      },
      include: {
        policy: {
          select: {
            name: true,
            isPaid: true,
            trackIn: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch leave requests" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leave/requests - Create a new leave request
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = createLeaveRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validated.error.format(),
        },
        { status: 400 }
      );
    }

    const { policyId, startDate, endDate, duration, notes } = validated.data;

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the policy exists and get its workspace
    const policy = await prisma.leavePolicy.findUnique({
      where: {
        id: policyId,
      },
      include: {
        workspace: true,
      },
    });

    if (!policy) {
      return NextResponse.json(
        { error: "Leave policy not found" },
        { status: 404 }
      );
    }

    // Verify user has access to the policy's workspace (owner or member)
    const policyWorkspace = await prisma.workspace.findUnique({
      where: { id: policy.workspaceId },
      include: {
        members: {
          where: { userId: user.id },
        },
      },
    });

    if (!policyWorkspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const isOwner = policyWorkspace.ownerId === user.id;
    const isMember = policyWorkspace.members.length > 0;

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: "Access denied to workspace" },
        { status: 403 }
      );
    }

    // Create the leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        policyId,
        startDate,
        endDate,
        duration,
        notes,
      },
      include: {
        policy: {
          select: {
            name: true,
            isPaid: true,
            trackIn: true,
          },
        },
      },
    });

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating leave request:", error);
    return NextResponse.json(
      { error: "Failed to create leave request" },
      { status: 500 }
    );
  }
}
