import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { processLeaveRequestAction } from "@/lib/leave-service";
import { NotificationService } from "@/lib/notification-service";
import { emitLeaveUpdated, emitLeaveDeleted } from "@/lib/event-bus";
import { z } from "zod";

const updateLeaveRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
});

// Schema for editing leave request data (user edits)
const editLeaveRequestSchema = z.object({
  policyId: z.string().min(1, "Policy ID is required").optional(),
  startDate: z
    .string()
    .refine((str) => !isNaN(Date.parse(str)), {
      message: "startDate must be a valid ISO date string",
    })
    .transform((str) => new Date(str))
    .optional(),
  endDate: z
    .string()
    .refine((str) => !isNaN(Date.parse(str)), {
      message: "endDate must be a valid ISO date string",
    })
    .transform((str) => new Date(str))
    .optional(),
  duration: z.enum(["FULL_DAY", "HALF_DAY"]).optional(),
  notes: z
    .string()
    .min(1, "Notes are required")
    .max(500, "Notes cannot exceed 500 characters")
    .optional(),
});

/**
 * PATCH /api/leave/requests/[requestId] - Update leave request status (approve/reject)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await params;
    const body = await req.json();
    const validated = updateLeaveRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validated.error.format(),
        },
        { status: 400 }
      );
    }

    const { status, notes } = validated.data;

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Use the centralized service to handle approval/rejection with balance updates
    // This includes all permission checks, validation, and balance updates
    const result = await processLeaveRequestAction({
      requestId,
      action: status,
      notes,
      actionById: user.id,
    });

    // Send notifications
    try {
      if (result.notificationData) {
        await NotificationService.notifyLeaveStatusChange(
          result.notificationData,
          status,
          user.id
        );
      }
    } catch (notificationError) {
      // Log but don't fail the request
      console.error(
        "Failed to send leave request status notifications:",
        notificationError
      );
    }

    // Emit webhook event for leave status update
    try {
      // Fetch workspace data for webhook context
      const workspace = await prisma.workspace.findUnique({
        where: { id: result.policy?.workspaceId },
        select: { name: true, slug: true },
      });

      await emitLeaveUpdated(
        {
          id: result.id,
          userId: result.userId,
          workspaceId: result.policy?.workspaceId || "",
          startDate: result.startDate.toISOString(),
          endDate: result.endDate.toISOString(),
          isAllDay: result.duration === "FULL_DAY",
          startTime: result.duration === "HALF_DAY" ? "09:00:00" : undefined,
          endTime: result.duration === "HALF_DAY" ? "17:00:00" : undefined,
          status: result.status.toLowerCase(),
          type: result.policy?.name || "Leave",
          reason: result.notes,
          notes: result.notes,
          timezone: "Europe/London",
          updatedAt: result.updatedAt.toISOString(),
        },
        { status: status.toLowerCase() }, // changes object
        {
          userId: user.id,
          workspaceId: result.policy?.workspaceId || "",
          workspaceName: workspace?.name || "Unknown",
          workspaceSlug: workspace?.slug || "unknown",
          source: "api",
        },
        { async: true }
      );
    } catch (webhookError) {
      console.error("Failed to emit leave updated webhook:", webhookError);
    }

    // Remove notification data from response
    const { notificationData, ...updatedRequest } = result;
    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error updating leave request:", error);
    return NextResponse.json(
      { error: "Failed to update leave request" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/leave/requests/[requestId] - Edit leave request (user edits their own pending request)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await params;
    const body = await req.json();
    const validated = editLeaveRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: validated.error.format(),
        },
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

    // Get the existing leave request
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        policy: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    // Check if user owns this request
    if (existingRequest.userId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if request is editable (PENDING status and start date >= today)
    if (existingRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending requests can be edited" },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(existingRequest.startDate);
    startDate.setHours(0, 0, 0, 0);

    if (startDate < today) {
      return NextResponse.json(
        { error: "Cannot edit requests that have already started" },
        { status: 400 }
      );
    }

    // Verify user has access to the workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: existingRequest.policy.workspaceId },
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

    // If policy is being changed, verify the new policy exists and belongs to the workspace
    if (
      validated.data.policyId &&
      validated.data.policyId !== existingRequest.policyId
    ) {
      const newPolicy = await prisma.leavePolicy.findUnique({
        where: { id: validated.data.policyId },
      });

      if (
        !newPolicy ||
        newPolicy.workspaceId !== existingRequest.policy.workspaceId
      ) {
        return NextResponse.json(
          { error: "Invalid policy for this workspace" },
          { status: 400 }
        );
      }
    }

    // Update the leave request
    const updateData: any = {};
    if (validated.data.policyId) updateData.policyId = validated.data.policyId;
    if (validated.data.startDate)
      updateData.startDate = validated.data.startDate;
    if (validated.data.endDate) updateData.endDate = validated.data.endDate;
    if (validated.data.duration) updateData.duration = validated.data.duration;
    if (validated.data.notes !== undefined)
      updateData.notes = validated.data.notes;

    const updatedRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: updateData,
      include: {
        policy: {
          select: {
            name: true,
            isPaid: true,
            trackIn: true,
            workspaceId: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Send edit notifications
    try {
      const notificationData = {
        id: updatedRequest.id,
        userId: updatedRequest.userId,
        policyId: updatedRequest.policyId,
        startDate: updatedRequest.startDate,
        endDate: updatedRequest.endDate,
        duration: updatedRequest.duration,
        notes: updatedRequest.notes,
        status: updatedRequest.status,
        user: updatedRequest.user,
        policy: {
          name: updatedRequest.policy.name,
          workspaceId: updatedRequest.policy.workspaceId,
        },
      };

      await NotificationService.notifyLeaveEdit(notificationData, user.id);
    } catch (notificationError) {
      // Log but don't fail the request
      console.error(
        "Failed to send leave request edit notifications:",
        notificationError
      );
    }

    // Emit webhook event for leave edit
    try {
      await emitLeaveUpdated(
        {
          id: updatedRequest.id,
          userId: updatedRequest.userId,
          workspaceId: updatedRequest.policy.workspaceId,
          startDate: updatedRequest.startDate.toISOString(),
          endDate: updatedRequest.endDate.toISOString(),
          isAllDay: updatedRequest.duration === "FULL_DAY",
          startTime:
            updatedRequest.duration === "HALF_DAY" ? "09:00:00" : undefined,
          endTime:
            updatedRequest.duration === "HALF_DAY" ? "17:00:00" : undefined,
          status: updatedRequest.status.toLowerCase(),
          type: updatedRequest.policy.name,
          reason: updatedRequest.notes,
          notes: updatedRequest.notes,
          timezone: "Europe/London",
          updatedAt: updatedRequest.updatedAt.toISOString(),
        },
        updateData, // changes object
        {
          userId: user.id,
          workspaceId: updatedRequest.policy.workspaceId,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          source: "api",
        },
        { async: true }
      );
    } catch (webhookError) {
      console.error("Failed to emit leave updated webhook:", webhookError);
    }

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error editing leave request:", error);
    return NextResponse.json(
      { error: "Failed to edit leave request" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/leave/requests/[requestId] - Cancel leave request (user cancels their own pending request)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId } = await params;

    // Get the current user
    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the existing leave request
    const existingRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        policy: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 }
      );
    }

    // Check if user owns this request
    if (existingRequest.userId !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if request is cancellable (PENDING status and start date >= today)
    if (existingRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending requests can be cancelled" },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(existingRequest.startDate);
    startDate.setHours(0, 0, 0, 0);

    if (startDate < today) {
      return NextResponse.json(
        { error: "Cannot cancel requests that have already started" },
        { status: 400 }
      );
    }

    // Update the request status to CANCELED
    const cancelledRequest = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: "CANCELED",
        updatedAt: new Date(),
      },
      include: {
        policy: {
          select: {
            name: true,
            isPaid: true,
            trackIn: true,
            workspaceId: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Send cancellation notifications
    try {
      const notificationData = {
        id: cancelledRequest.id,
        userId: cancelledRequest.userId,
        policyId: cancelledRequest.policyId,
        startDate: cancelledRequest.startDate,
        endDate: cancelledRequest.endDate,
        duration: cancelledRequest.duration,
        notes: cancelledRequest.notes,
        status: cancelledRequest.status,
        user: cancelledRequest.user,
        policy: {
          name: cancelledRequest.policy.name,
          workspaceId: cancelledRequest.policy.workspaceId,
        },
      };

      await NotificationService.notifyLeaveStatusChange(
        notificationData,
        "CANCELLED",
        user.id
      );
    } catch (notificationError) {
      // Log but don't fail the request
      console.error(
        "Failed to send leave request cancellation notifications:",
        notificationError
      );
    }

    // Emit webhook event for leave cancellation/deletion
    try {
      await emitLeaveDeleted(
        {
          id: cancelledRequest.id,
          userId: cancelledRequest.userId,
          workspaceId: cancelledRequest.policy.workspaceId,
          startDate: cancelledRequest.startDate.toISOString(),
          endDate: cancelledRequest.endDate.toISOString(),
          isAllDay: cancelledRequest.duration === "FULL_DAY",
          startTime:
            cancelledRequest.duration === "HALF_DAY" ? "09:00:00" : undefined,
          endTime:
            cancelledRequest.duration === "HALF_DAY" ? "17:00:00" : undefined,
          status: cancelledRequest.status.toLowerCase(),
          type: cancelledRequest.policy.name,
          reason: cancelledRequest.notes,
          notes: cancelledRequest.notes,
          timezone: "Europe/London",
          updatedAt: cancelledRequest.updatedAt.toISOString(),
        },
        {
          userId: user.id,
          workspaceId: cancelledRequest.policy.workspaceId,
          workspaceName: existingRequest.policy.workspace.name,
          workspaceSlug: existingRequest.policy.workspace.slug,
          source: "api",
        },
        { async: true }
      );
    } catch (webhookError) {
      console.error("Failed to emit leave deleted webhook:", webhookError);
    }

    // TODO: Release any pre-deducted leave balance (if applicable)
    // This would need to be implemented based on your leave balance logic

    return NextResponse.json(cancelledRequest);
  } catch (error) {
    console.error("Error cancelling leave request:", error);
    return NextResponse.json(
      { error: "Failed to cancel leave request" },
      { status: 500 }
    );
  }
}
