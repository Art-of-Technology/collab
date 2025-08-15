import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { z } from "zod";

// Validation schema for creating/updating leave policies
const leavePolicySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters"),
  group: z.string().nullable(),
  isPaid: z.boolean(),
  trackIn: z.enum(["HOURS", "DAYS"]),
  isHidden: z.boolean().default(false),
  exportMode: z.enum([
    "DO_NOT_EXPORT",
    "EXPORT_WITH_PAY_CONDITION",
    "EXPORT_WITH_CODE",
  ]),
  exportCode: z.string().nullable(),
  accrualType: z.enum([
    "DOES_NOT_ACCRUE",
    "HOURLY",
    "FIXED",
    "REGULAR_WORKING_HOURS",
  ]),
  deductsLeave: z.boolean().default(true),
  maxBalance: z.number().positive().nullable(),
  rolloverType: z
    .enum(["ENTIRE_BALANCE", "PARTIAL_BALANCE", "NONE"])
    .nullable(),
  rolloverAmount: z.number().positive().nullable(),
  rolloverDate: z
    .string()
    .transform((val) => (val ? new Date(val) : null))
    .nullable(),
  allowOutsideLeaveYearRequest: z.boolean().default(false),
  useAverageWorkingHours: z.boolean().default(false),
  workspaceId: z.string(),
});

/**
 * GET /api/leave/policies?workspaceId=xxx&includeHidden=true - Get leave policies for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const includeHidden = url.searchParams.get("includeHidden") === "true";

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

    // Check if user has MANAGE_LEAVE permission for full policy details
    const canManageLeave = await checkUserPermission(
      user.id,
      workspaceId,
      Permission.MANAGE_LEAVE
    );

    const policies = await prisma.leavePolicy.findMany({
      where: {
        workspaceId: workspaceId,
        ...(includeHidden ? {} : { isHidden: false }),
      },
      select: canManageLeave.hasPermission
        ? {
            id: true,
            name: true,
            group: true,
            isPaid: true,
            trackIn: true,
            isHidden: true,
            exportMode: true,
            exportCode: true,
            accrualType: true,
            deductsLeave: true,
            maxBalance: true,
            rolloverType: true,
            rolloverAmount: true,
            rolloverDate: true,
            allowOutsideLeaveYearRequest: true,
            useAverageWorkingHours: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                leaveRequests: {
                  where: {
                    status: { in: ["PENDING", "APPROVED"] },
                  },
                },
              },
            },
          }
        : {
            id: true,
            name: true,
            group: true,
            isPaid: true,
            trackIn: true,
          },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error("Error fetching leave policies:", error);
    return NextResponse.json(
      { error: "Failed to fetch leave policies" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leave/policies - Create a new leave policy
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = leavePolicySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Invalid policy data",
          details: validated.error.format(),
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has MANAGE_LEAVE permission
    const canManageLeave = await checkUserPermission(
      user.id,
      validated.data.workspaceId,
      Permission.MANAGE_LEAVE
    );

    if (!canManageLeave.hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions to manage leave policies" },
        { status: 403 }
      );
    }

    // Validate export code is provided when export mode is EXPORT_WITH_CODE
    if (
      validated.data.exportMode === "EXPORT_WITH_CODE" &&
      !validated.data.exportCode
    ) {
      return NextResponse.json(
        {
          error: "Export code is required when export mode is EXPORT_WITH_CODE",
        },
        { status: 400 }
      );
    }

    // Validate rollover amount is provided when rollover type is PARTIAL_BALANCE
    if (
      validated.data.rolloverType === "PARTIAL_BALANCE" &&
      !validated.data.rolloverAmount
    ) {
      return NextResponse.json(
        {
          error:
            "Rollover amount is required when rollover type is PARTIAL_BALANCE",
        },
        { status: 400 }
      );
    }

    // Create the policy
    const policy = await prisma.leavePolicy.create({
      data: validated.data,
      include: {
        _count: {
          select: {
            leaveRequests: {
              where: {
                status: { in: ["PENDING", "APPROVED"] },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error("Error creating leave policy:", error);
    return NextResponse.json(
      { error: "Failed to create leave policy" },
      { status: 500 }
    );
  }
}
