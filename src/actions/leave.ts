"use server";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveWorkspaceSlug } from "@/lib/slug-resolvers";
import {
  approveLeaveRequestWithBalance,
  rejectLeaveRequestWithBalance,
} from "@/lib/leave-service";
import { checkUserPermission, Permission } from "@/lib/permissions";
import { NotificationService } from "@/lib/notification-service";
import { emitLeaveCreated } from "@/lib/event-bus";

/**
 * Get leave policies for a workspace
 */
export async function getLeavePolicies(workspaceId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
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
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === user.id;
  const isMember = workspace.members.length > 0;

  if (!isOwner && !isMember) {
    throw new Error("Access denied to workspace");
  }

  const policies = await prisma.leavePolicy.findMany({
    where: {
      workspaceId: workspaceId,
      isHidden: false,
    },
    select: {
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

  return policies;
}

/**
 * Create a new leave request
 */
export async function createLeaveRequest(data: {
  policyId: string;
  startDate: Date;
  endDate: Date;
  duration: "FULL_DAY" | "HALF_DAY";
  notes: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Verify the policy exists and get its workspace
  const policy = await prisma.leavePolicy.findUnique({
    where: {
      id: data.policyId,
    },
    include: {
      workspace: true,
    },
  });

  if (!policy) {
    throw new Error("Leave policy not found");
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
    throw new Error("Workspace not found");
  }

  const isOwner = policyWorkspace.ownerId === user.id;
  const isMember = policyWorkspace.members.length > 0;

  if (!isOwner && !isMember) {
    throw new Error("Access denied to workspace");
  }

  // Create the leave request
  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      policyId: data.policyId,
      startDate: data.startDate,
      endDate: data.endDate,
      duration: data.duration,
      notes: data.notes,
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

  // Send notifications
  try {
    await NotificationService.notifyLeaveSubmission({
      id: leaveRequest.id,
      userId: leaveRequest.userId,
      policyId: leaveRequest.policyId,
      startDate: leaveRequest.startDate,
      endDate: leaveRequest.endDate,
      duration: leaveRequest.duration,
      notes: leaveRequest.notes,
      status: leaveRequest.status,
      user: leaveRequest.user,
      policy: {
        name: leaveRequest.policy.name,
        workspaceId: leaveRequest.policy.workspaceId,
      },
    });
  } catch (notificationError) {
    // Log but don't fail the request creation
    console.error(
      "Failed to send leave request notifications:",
      notificationError
    );
  }

  return leaveRequest;
}

/**
 * Get user's leave requests for a workspace
 */
export async function getUserLeaveRequests(workspaceId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
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
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === user.id;
  const isMember = workspace.members.length > 0;

  if (!isOwner && !isMember) {
    throw new Error("Access denied to workspace");
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

  return leaveRequests;
}

/**
 * Get all leave requests for a workspace (for managers)
 */
export async function getWorkspaceLeaveRequests(workspaceSlugOrId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Resolve workspace slug to ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    throw new Error("Workspace not found");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if user has permission to manage leave
  const managePermission = await checkUserPermission(
    user.id,
    workspaceId,
    Permission.MANAGE_LEAVE
  );

  if (!managePermission.hasPermission) {
    throw new Error("Insufficient permissions to manage leave requests");
  }

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      policy: {
        workspaceId: workspaceId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      policy: {
        select: {
          name: true,
          isPaid: true,
          trackIn: true,
        },
      },
    },
    orderBy: [
      {
        status: "asc", // Show pending first
      },
      {
        createdAt: "desc",
      },
    ],
  });

  // Transform the data to match our component interface
  return leaveRequests.map((request) => ({
    ...request,
    user: {
      ...request.user,
      avatar: request.user.image,
    },
  }));
}

/**
 * Approve a leave request (managers only) - with automatic balance update
 */
export async function approveLeaveRequest(requestId: string, notes?: string) {
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
  
  const result = await approveLeaveRequestWithBalance(requestId, notes);

  // Send notifications
  try {
    if (result.notificationData) {
      await NotificationService.notifyLeaveStatusChange(
        result.notificationData,
        "APPROVED",
        user.id
      );
    }
  } catch (notificationError) {
    // Log but don't fail the request
    console.error(
      "Failed to send leave request approval notifications:",
      notificationError
    );
  }

    // Emit webhook event for leave creation
    try {
      const policyWorkspace = await prisma.workspace.findUnique({
        where: { id: result.policy.workspaceId },
        select: { name: true, slug: true },
      });
    
      if (!policyWorkspace) {
        throw new Error("Workspace not found");
      }
      
      await emitLeaveCreated(
        {
          id: result.id,
          userId: result.userId,
          workspaceId: result.policy.workspaceId,
          startDate: result.startDate.toISOString(),
          endDate: result.endDate.toISOString(),
          isAllDay: result.duration === "FULL_DAY",
          startTime:
            result.duration === "HALF_DAY" ? "09:00:00" : undefined,
          endTime:
            result.duration === "HALF_DAY" ? "17:00:00" : undefined,
          status: result.status.toLowerCase(),
          type: result.policy.name,
          reason: result.notes,
          notes: result.notes,
          timezone: "Europe/London", // Default timezone - could be made configurable
          updatedAt: result.updatedAt.toISOString(),
        },
        {
          userId: user.id,
          workspaceId: result.policy.workspaceId,
          workspaceName: policyWorkspace.name,
          workspaceSlug: policyWorkspace.slug,
          source: "server-action",
        },
        { async: true }
      );
    } catch (webhookError) {
      // Log but don't fail the request creation
      console.error("Failed to emit leave created webhook:", webhookError);
    }

  // Remove notification data from response
  const { notificationData, ...updatedRequest } = result;
  return updatedRequest;
}

/**
 * Reject a leave request (managers only)
 */
export async function rejectLeaveRequest(requestId: string, notes?: string) {
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

  const result = await rejectLeaveRequestWithBalance(requestId, notes);

  // Send notifications
  try {
    if (result.notificationData) {
      await NotificationService.notifyLeaveStatusChange(
        result.notificationData,
        "REJECTED",
        user.id
      );
    }
  } catch (notificationError) {
    // Log but don't fail the request
    console.error(
      "Failed to send leave request rejection notifications:",
      notificationError
    );
  }

  // Remove notification data from response
  const { notificationData, ...updatedRequest } = result;
  return updatedRequest;
}

/**
 * Get paginated leave requests for a workspace (for managers)
 */
export async function getPaginatedWorkspaceLeaveRequests(
  workspaceSlugOrId: string,
  options: {
    take?: number;
    skip?: number;
    status?: "PENDING" | "APPROVED" | "REJECTED";
  } = {}
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Set default pagination values
  const { take = 10, skip = 0, status } = options;

  // Resolve workspace slug to ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    throw new Error("Workspace not found");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if user has permission to manage leave
  const managePermission = await checkUserPermission(
    user.id,
    workspaceId,
    Permission.MANAGE_LEAVE
  );

  if (!managePermission.hasPermission) {
    throw new Error("Insufficient permissions to manage leave requests");
  }

  // Build where clause
  const whereClause: any = {
    policy: {
      workspaceId: workspaceId,
    },
  };

  // Add status filter if provided
  if (status) {
    whereClause.status = status;
  }

  // Get total count for pagination metadata
  const totalCount = await prisma.leaveRequest.count({
    where: whereClause,
  });

  // Get paginated results
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      policy: {
        select: {
          name: true,
          isPaid: true,
          trackIn: true,
        },
      },
    },
    orderBy: [
      {
        status: "asc", // Show pending first
      },
      {
        createdAt: "desc",
      },
    ],
    take,
    skip,
  });

  // Transform the data to match our component interface
  const transformedRequests = leaveRequests.map((request) => ({
    ...request,
    user: {
      ...request.user,
      avatar: request.user.image,
    },
  }));

  return {
    data: transformedRequests,
    pagination: {
      total: totalCount,
      take,
      skip,
      hasMore: skip + take < totalCount,
      totalPages: Math.ceil(totalCount / take),
      currentPage: Math.floor(skip / take) + 1,
    },
  };
}

/**
 * Get leave request summary counts for a workspace (for managers)
 */
export async function getWorkspaceLeaveRequestsSummary(
  workspaceSlugOrId: string
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Resolve workspace slug to ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    throw new Error("Workspace not found");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if user has permission to manage leave
  const managePermission = await checkUserPermission(
    user.id,
    workspaceId,
    Permission.MANAGE_LEAVE
  );

  if (!managePermission.hasPermission) {
    throw new Error("Insufficient permissions to manage leave requests");
  }

  // Get counts for each status
  const [
    pendingCount,
    approvedCount,
    rejectedCount,
    canceledCount,
    totalCount,
  ] = await Promise.all([
    prisma.leaveRequest.count({
      where: {
        policy: { workspaceId: workspaceId },
        status: "PENDING",
      },
    }),
    prisma.leaveRequest.count({
      where: {
        policy: { workspaceId: workspaceId },
        status: "APPROVED",
      },
    }),
    prisma.leaveRequest.count({
      where: {
        policy: { workspaceId: workspaceId },
        status: "REJECTED",
      },
    }),
    prisma.leaveRequest.count({
      where: {
        policy: { workspaceId: workspaceId },
        status: "CANCELED",
      },
    }),
    prisma.leaveRequest.count({
      where: {
        policy: { workspaceId: workspaceId },
      },
    }),
  ]);

  return {
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
    canceled: canceledCount,
    total: totalCount,
  };
}

/**
 * Get paginated leave policies for a workspace
 */
export async function getPaginatedLeavePolicies(
  workspaceSlugOrId: string,
  options: {
    take?: number;
    skip?: number;
    searchTerm?: string;
    group?: string;
  } = {}
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }

  // Set default pagination values
  const { take = 10, skip = 0, searchTerm, group } = options;

  // Resolve workspace slug to ID
  const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
  if (!workspaceId) {
    throw new Error("Workspace not found");
  }

  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
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
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === user.id;
  const isMember = workspace.members.length > 0;

  if (!isOwner && !isMember) {
    throw new Error("Access denied to workspace");
  }

  // Build where clause
  const whereClause: any = {
    workspaceId: workspaceId,
    isHidden: false,
  };

  // Add search filter if provided
  if (searchTerm) {
    whereClause.name = {
      contains: searchTerm,
      mode: "insensitive",
    };
  }

  // Add group filter if provided
  if (group) {
    whereClause.group = group;
  }

  // Get total count for pagination metadata
  const totalCount = await prisma.leavePolicy.count({
    where: whereClause,
  });

  // Get paginated results
  const policies = await prisma.leavePolicy.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      group: true,
      isPaid: true,
      trackIn: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      name: "asc",
    },
    take,
    skip,
  });

  return {
    data: policies,
    pagination: {
      total: totalCount,
      take,
      skip,
      hasMore: skip + take < totalCount,
      totalPages: Math.ceil(totalCount / take),
      currentPage: Math.floor(skip / take) + 1,
    },
  };
}
