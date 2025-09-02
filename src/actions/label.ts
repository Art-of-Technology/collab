'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getWorkspaceId } from '@/lib/workspace-helpers';

/**
 * Get all labels for the current workspace
 */
export async function getWorkspaceLabels() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  try {
    // Get a valid workspace ID
    const workspaceId = await getWorkspaceId({id: user.id});
    
    // Get all labels for the current workspace
    const labels = await prisma.taskLabel.findMany({
      where: {
        workspaceId: workspaceId
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    return {
      labels,
      workspaceId
    };
  } catch (error) {
    console.error('Error fetching labels:', error);
    throw error;
  }
}

/**
 * Create a new label
 */
export async function createLabel(data: {
  name: string;
  color?: string;
  workspaceId?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  try {
    const { name, color = "#6366F1" } = data;
    
    if (!name || !name.trim()) {
      throw new Error('Label name is required');
    }
    
    // Get a valid workspace ID
    const workspaceId = data.workspaceId || await getWorkspaceId({id: user.id});
    
    // Verify the user has access to this workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });
    
    if (!workspace) {
      throw new Error('Workspace not found or access denied');
    }
    
    // Check if label with this name already exists in the workspace
    const existingLabel = await prisma.taskLabel.findFirst({
      where: {
        name: name.trim(),
        workspaceId: workspaceId
      }
    });
    
    if (existingLabel) {
      throw new Error('A label with this name already exists in this workspace');
    }
    
    // Create the label
    const label = await prisma.taskLabel.create({
      data: {
        name: name.trim(),
        color,
        workspaceId
      }
    });
    
    return label;
  } catch (error) {
    console.error('Error creating label:', error);
    throw error;
  }
}

/**
 * Update a label
 */
export async function updateLabel(labelId: string, data: {
  name?: string;
  color?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  try {
    // Get the label and verify access
    const label = await prisma.taskLabel.findUnique({
      where: { id: labelId },
      include: {
        workspace: true
      }
    });
    
    if (!label) {
      throw new Error('Label not found');
    }
    
    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: label.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });
    
    if (!hasAccess) {
      throw new Error('You do not have access to this label');
    }
    
    // If name is being updated, check for duplicates
    if (data.name && data.name.trim() !== label.name) {
      const existingLabel = await prisma.taskLabel.findFirst({
        where: {
          name: data.name.trim(),
          workspaceId: label.workspaceId,
          id: { not: labelId }
        }
      });
      
      if (existingLabel) {
        throw new Error('A label with this name already exists in this workspace');
      }
    }
    
    // Update the label
    const updatedLabel = await prisma.taskLabel.update({
      where: { id: labelId },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.color && { color: data.color })
      }
    });
    
    return updatedLabel;
  } catch (error) {
    console.error('Error updating label:', error);
    throw error;
  }
}

/**
 * Delete a label
 */
export async function deleteLabel(labelId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  try {
    // Get the label and verify access
    const label = await prisma.taskLabel.findUnique({
      where: { id: labelId },
      include: {
        workspace: true
      }
    });
    
    if (!label) {
      throw new Error('Label not found');
    }
    
    // Verify the user has access to this workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: label.workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });
    
    if (!hasAccess) {
      throw new Error('You do not have access to this label');
    }
    
    // Delete the label (this will automatically disconnect it from all tasks, milestones, epics, and stories)
    await prisma.taskLabel.delete({
      where: { id: labelId }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting label:', error);
    throw error;
  }
} 