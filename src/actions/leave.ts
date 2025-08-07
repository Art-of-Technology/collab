"use server";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

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
        },
      },
    },
  });

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
