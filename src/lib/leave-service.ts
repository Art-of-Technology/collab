"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import { differenceInDays } from "date-fns";
import { checkUserPermission, Permission } from "@/lib/permissions";

export interface LeaveRequestActionData {
  requestId: string;
  action: "APPROVED" | "REJECTED";
  notes?: string;
  actionById: string; // User who performed the action
}

export interface LeaveBalanceUpdate {
  userId: string;
  policyId: string;
  year: number;
  daysUsed: number;
  requestId: string;
}

/**
 * Calculate the number of leave days used based on request dates and duration
 */
function calculateDaysUsed(
  startDate: Date,
  endDate: Date,
  duration: "FULL_DAY" | "HALF_DAY"
): number {
  const daysDiff = differenceInDays(endDate, startDate) + 1;
  return duration === "HALF_DAY" ? daysDiff * 0.5 : daysDiff;
}

/**
 * Update user's leave balance when a request is approved
 */
async function updateLeaveBalance(data: LeaveBalanceUpdate): Promise<void> {
  const currentYear = data.year;

  // Find or create the leave balance record for this user/policy/year
  const existingBalance = await prisma.leaveBalance.findFirst({
    where: {
      userId: data.userId,
      policyId: data.policyId,
      year: currentYear,
    },
  });

  if (existingBalance) {
    // Update existing balance
    await prisma.leaveBalance.update({
      where: { id: existingBalance.id },
      data: {
        totalUsed: {
          increment: data.daysUsed,
        },
        balance: {
          decrement: data.daysUsed,
        },
        updatedAt: new Date(),
      },
    });
  } else {
    // Create new balance record (this might happen if no balance was initialized)
    await prisma.leaveBalance.create({
      data: {
        userId: data.userId,
        policyId: data.policyId,
        year: currentYear,
        totalAccrued: 0, // This should be set by a separate accrual process
        totalUsed: data.daysUsed,
        balance: -data.daysUsed, // Negative balance indicates deficit
        rollover: 0,
        lastAccruedAt: null,
      },
    });
  }

  console.log(
    `✅ Updated leave balance for user ${data.userId}: -${data.daysUsed} days`
  );
}

/**
 * Process leave request approval or rejection with automatic balance updates
 * This is the centralized function that should be used for all leave request actions
 */
export async function processLeaveRequestAction(data: LeaveRequestActionData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Start a database transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // Get the leave request with all related data
    const leaveRequest = await tx.leaveRequest.findUnique({
      where: { id: data.requestId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        policy: {
          select: {
            id: true,
            name: true,
            trackIn: true,
            workspaceId: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      throw new Error("Leave request not found");
    }

    if (leaveRequest.status !== "PENDING") {
      throw new Error(
        `Leave request is already ${leaveRequest.status.toLowerCase()}`
      );
    }

    // Verify the acting user has permission to manage leave requests
    const permissionCheck = await checkUserPermission(
      data.actionById,
      leaveRequest.policy.workspaceId,
      Permission.MANAGE_LEAVE
    );

    if (!permissionCheck.hasPermission) {
      throw new Error("Insufficient permissions to manage leave requests");
    }

    // Update the leave request status
    const updatedRequest = await tx.leaveRequest.update({
      where: { id: data.requestId },
      data: {
        status: data.action,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        policy: {
          select: { name: true, isPaid: true, trackIn: true },
        },
      },
    });

    // If approved, update the user's leave balance
    if (data.action === "APPROVED") {
      const daysUsed = calculateDaysUsed(
        new Date(leaveRequest.startDate),
        new Date(leaveRequest.endDate),
        leaveRequest.duration
      );

      const currentYear = new Date(leaveRequest.startDate).getFullYear();

      await updateLeaveBalance({
        userId: leaveRequest.user.id,
        policyId: leaveRequest.policy.id,
        year: currentYear,
        daysUsed,
        requestId: data.requestId,
      });

      console.log(
        `✅ Approved leave request ${data.requestId} for ${leaveRequest.user.name} (${daysUsed} days)`
      );
    } else {
      console.log(
        `❌ Rejected leave request ${data.requestId} for ${leaveRequest.user.name}`
      );
    }

    // TODO: Add audit trail table to track who approved/rejected requests
    // TODO: Send notification to employee about approval/rejection
    // TODO: Create calendar event if approved
    // TODO: Send email notification

    return {
      ...updatedRequest,
      user: {
        ...updatedRequest.user,
        avatar: updatedRequest.user.image,
      },
    };
  });
}

/**
 * Approve a leave request
 */
export async function approveLeaveRequestWithBalance(
  requestId: string,
  notes?: string
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return processLeaveRequestAction({
    requestId,
    action: "APPROVED",
    notes,
    actionById: user.id,
  });
}

/**
 * Reject a leave request
 */
export async function rejectLeaveRequestWithBalance(
  requestId: string,
  notes?: string
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return processLeaveRequestAction({
    requestId,
    action: "REJECTED",
    notes,
    actionById: user.id,
  });
}
