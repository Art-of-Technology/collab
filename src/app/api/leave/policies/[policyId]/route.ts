import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { z } from "zod";

// Validation schema for updating leave policies
const updateLeavePolicySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),
  group: z.string().nullable().optional(),
  isPaid: z.boolean().optional(),
  trackIn: z.enum(["HOURS", "DAYS"]).optional(),
  isHidden: z.boolean().optional(),
  exportMode: z
    .enum(["DO_NOT_EXPORT", "EXPORT_WITH_PAY_CONDITION", "EXPORT_WITH_CODE"])
    .optional(),
  exportCode: z.string().nullable().optional(),
  accrualType: z
    .enum(["DOES_NOT_ACCRUE", "HOURLY", "FIXED", "REGULAR_WORKING_HOURS"])
    .optional(),
  deductsLeave: z.boolean().optional(),
  maxBalance: z.number().positive().nullable().optional(),
  rolloverType: z
    .enum(["ENTIRE_BALANCE", "PARTIAL_BALANCE", "NONE"])
    .nullable()
    .optional(),
  rolloverAmount: z.number().positive().nullable().optional(),
  rolloverDate: z
    .string()
    .transform((val) => (val ? new Date(val) : null))
    .nullable()
    .optional(),
  allowOutsideLeaveYearRequest: z.boolean().optional(),
  useAverageWorkingHours: z.boolean().optional(),
});

/**
 * GET /api/leave/policies/[policyId] - Get a specific leave policy
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { policyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const policy = await prisma.leavePolicy.findUnique({
      where: { id: params.policyId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: user.id },
            },
          },
        },
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

    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // Check workspace access
    const isOwner = policy.workspace.ownerId === user.id;
    const isMember = policy.workspace.members.length > 0;

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { error: "Access denied to workspace" },
        { status: 403 }
      );
    }

    // Remove workspace from response
    const { workspace, ...policyData } = policy;

    return NextResponse.json(policyData);
  } catch (error) {
    console.error("Error fetching leave policy:", error);
    return NextResponse.json(
      { error: "Failed to fetch leave policy" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/leave/policies/[policyId] - Update a leave policy
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { policyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = updateLeavePolicySchema.safeParse(body);

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

    // Check if policy exists and get its workspace
    const existingPolicy = await prisma.leavePolicy.findUnique({
      where: { id: params.policyId },
      select: { workspaceId: true },
    });

    if (!existingPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // Check if user has MANAGE_LEAVE permission
    const canManageLeave = await checkUserPermission(
      user.id,
      existingPolicy.workspaceId,
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

    // Update the policy
    const updatedPolicy = await prisma.leavePolicy.update({
      where: { id: params.policyId },
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

    return NextResponse.json(updatedPolicy);
  } catch (error) {
    console.error("Error updating leave policy:", error);
    return NextResponse.json(
      { error: "Failed to update leave policy" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/leave/policies/[policyId] - Delete a leave policy
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { policyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if policy exists and get its workspace and usage
    const existingPolicy = await prisma.leavePolicy.findUnique({
      where: { id: params.policyId },
      include: {
        _count: {
          select: {
            leaveRequests: {
              where: {
                status: { in: ["PENDING", "APPROVED"] },
              },
            },
            leaveBalances: true,
          },
        },
      },
    });

    if (!existingPolicy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    // Check if user has MANAGE_LEAVE permission
    const canManageLeave = await checkUserPermission(
      user.id,
      existingPolicy.workspaceId,
      Permission.MANAGE_LEAVE
    );

    if (!canManageLeave.hasPermission) {
      return NextResponse.json(
        { error: "Insufficient permissions to manage leave policies" },
        { status: 403 }
      );
    }

    // Check if policy is being used in any pending or approved leave requests
    if (existingPolicy._count.leaveRequests > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete policy that is used in pending or approved leave requests",
          details:
            "Please handle all related leave requests before deleting this policy.",
        },
        { status: 400 }
      );
    }

    // Check if policy has associated leave balances
    if (existingPolicy._count.leaveBalances > 0) {
      return NextResponse.json(
        {
          error: "Cannot delete policy that has associated leave balances",
          details:
            "Please clear all leave balances for this policy before deletion.",
        },
        { status: 400 }
      );
    }

    // Delete the policy
    await prisma.leavePolicy.delete({
      where: { id: params.policyId },
    });

    return NextResponse.json({ message: "Policy deleted successfully" });
  } catch (error) {
    console.error("Error deleting leave policy:", error);
    return NextResponse.json(
      { error: "Failed to delete leave policy" },
      { status: 500 }
    );
  }
}
