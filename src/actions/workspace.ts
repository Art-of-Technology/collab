'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { getAuthSession } from '@/lib/auth';

/**
 * Get all workspaces for the current user
 */
export async function getUserWorkspaces() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
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
  
  // Get workspaces the user owns
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: {
      ownerId: user.id
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true
            }
          }
        }
      }
    }
  });
  
  // Get workspaces the user is a member of (but doesn't own)
  const memberWorkspaces = await prisma.workspace.findMany({
    where: {
      members: {
        some: {
          userId: user.id
        }
      },
      NOT: {
        ownerId: user.id
      }
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true
            }
          }
        }
      }
    }
  });
  
  // Combine and return all workspaces
  return {
    owned: ownedWorkspaces,
    member: memberWorkspaces,
    all: [...ownedWorkspaces, ...memberWorkspaces]
  };
}

/**
 * Get a workspace by ID
 */
export async function getWorkspaceById(workspaceId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
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
  
    // Try to find by slug first, then by ID for backward compatibility
  let workspace = await prisma.workspace.findUnique({
    where: {
      slug: workspaceId
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true
            }
          }
        }
      }
    }
  });

  // If not found by slug, try by ID for backward compatibility
  if (!workspace) {
    workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true
              }
            }
          }
        }
      }
    });
  }

  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if the user has access to this workspace
  const isOwner = workspace.ownerId === user.id;
  const isMember = workspace.members.some((member: WorkspaceMember) => member.userId === user.id);
  
  if (!isOwner && !isMember) {
    throw new Error('You do not have access to this workspace');
  }
  
  return {
    ...workspace,
    isOwner,
    isMember
  };
}

/**
 * Create a new workspace
 */
export async function createWorkspace(data: {
  name: string;
  description?: string;
  slug?: string;
  logoUrl?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { name, description, slug, logoUrl } = data;
  
  // Validate input
  if (!name || !name.trim()) {
    throw new Error('Workspace name is required');
  }
  
  // Generate a slug if not provided
  const workspaceSlug = slug?.trim() || name.trim().toLowerCase().replace(/\s+/g, '-');
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if a workspace with the same slug already exists
  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceSlug
    }
  });
  
  if (existingWorkspace) {
    throw new Error('A workspace with this name or slug already exists');
  }
  
  // Create the workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      slug: workspaceSlug,
      logoUrl: logoUrl || null,
      owner: {
        connect: {
          id: user.id
        }
      }
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true
        }
      }
    }
  });
  
  return workspace;
}

/**
 * Update a workspace
 */
export async function updateWorkspace(workspaceId: string, data: {
  name?: string;
  description?: string;
  slug?: string;
  logoUrl?: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { name, description, slug, logoUrl } = data;
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get the workspace
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if user is the owner
  if (workspace.ownerId !== user.id) {
    throw new Error('Only the workspace owner can update it');
  }
  
  // If slug is changing, check that the new slug is available
  if (slug && slug !== workspace.slug) {
    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        slug,
        NOT: {
          id: workspaceId
        }
      }
    });
    
    if (existingWorkspace) {
      throw new Error('A workspace with this slug already exists');
    }
  }
  
  // Update the workspace
  const updatedWorkspace = await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      name: name || undefined,
      description: description || undefined,
      slug: slug || undefined,
      logoUrl: logoUrl || undefined
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true
        }
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true
            }
          }
        }
      }
    }
  });
  
  return updatedWorkspace;
}

/**
 * Delete a workspace
 */
export async function deleteWorkspace(workspaceId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get the workspace
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if user is the owner
  if (workspace.ownerId !== user.id) {
    throw new Error('Only the workspace owner can delete it');
  }
  
  // Delete the workspace
  await prisma.workspace.delete({
    where: {
      id: workspaceId
    }
  });
  
  return { success: true };
}

/**
 * Add a member to a workspace
 */
export async function addWorkspaceMember(data: {
  workspaceId: string;
  email: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { workspaceId, email } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // Get the workspace
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    },
    include: {
      members: true
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if user is the owner
  if (workspace.ownerId !== currentUser.id) {
    throw new Error('Only the workspace owner can add members');
  }
  
  // Get the user to add
  const userToAdd = await prisma.user.findUnique({
    where: {
      email
    }
  });
  
  if (!userToAdd) {
    throw new Error('User not found');
  }
  
  // Check if the user is already a member
  const isAlreadyMember = workspace.members.some((member: { userId: string }) => member.userId === userToAdd.id);
  
  if (isAlreadyMember) {
    throw new Error('User is already a member of this workspace');
  }
  
  // Check if the user is the owner
  if (workspace.ownerId === userToAdd.id) {
    throw new Error('User is already the owner of this workspace');
  }
  
  // Add the user as a member
  const workspaceMember = await prisma.workspaceMember.create({
    data: {
      workspace: {
        connect: {
          id: workspaceId
        }
      },
      user: {
        connect: {
          id: userToAdd.id
        }
      }
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true
        }
      }
    }
  });
  
  return workspaceMember;
}

/**
 * Remove a member from a workspace
 */
export async function removeWorkspaceMember(data: {
  workspaceId: string;
  userId: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { workspaceId, userId } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // Get the workspace
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if user is the owner or self-removing
  if (workspace.ownerId !== currentUser.id && currentUser.id !== userId) {
    throw new Error('Only the workspace owner can remove other members');
  }
  
  // Find the member to remove
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId,
      status: true
    }
  });
  
  if (!member) {
    throw new Error('Member not found');
  }
  
  // Remove the member
  await prisma.workspaceMember.delete({
    where: {
      id: member.id
    }
  });
  
  return { success: true };
}

/**
 * Check if a user has reached their workspace limit (3 for free plan)
 */
export async function checkWorkspaceLimit() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
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
  
  // Count user's owned workspaces
  const ownedWorkspacesCount = await prisma.workspace.count({
    where: { ownerId: user.id }
  });
  
  const maxWorkspaces = 15; // Free plan limit
  const canCreateWorkspace = ownedWorkspacesCount < maxWorkspaces;
  
  return {
    canCreateWorkspace,
    currentCount: ownedWorkspacesCount,
    maxCount: maxWorkspaces
  };
}

/**
 * Check if user has any workspaces
 */
export async function getUserWorkspacesById(userId: string, limit?: number) {
  if (!userId) {
    throw new Error('User ID is required');
  }
  
  const userWorkspaces = await prisma.workspace.findMany({
    where: {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } }
      ]
    },
    take: limit || undefined,
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true,
        }
      },
    }
  });
  
  return userWorkspaces;
}

/**
 * Get pending workspace invitations for user
 */
export async function getPendingInvitations(email: string) {
  if (!email) {
    throw new Error('Email is required');
  }
  
  const pendingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: email,
      status: "pending",
      expiresAt: {
        gte: new Date()
      }
    },
    include: {
      workspace: true,
      invitedBy: {
        select: {
          name: true,
          email: true,
          image: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  
  return pendingInvitations;
}

/**
 * Get a workspace by ID with full details for the workspace detail page
 */
export async function getDetailedWorkspaceById(workspaceId: string) {
  const session = await getAuthSession();
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Try to find by slug first, then by ID for backward compatibility
  let workspace = await prisma.workspace.findUnique({
    where: {
      slug: workspaceId
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true
        }
      },
      members: {
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
              useCustomAvatar: true,
              avatarSkinTone: true,
              avatarEyes: true,
              avatarBrows: true,
              avatarMouth: true,
              avatarNose: true,
              avatarHair: true,
              avatarEyewear: true,
              avatarAccessory: true
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      },
      invitations: {
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            }
          }
        }
      }
    }
  });

  // If not found by slug, try by ID for backward compatibility
  if (!workspace) {
    workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            useCustomAvatar: true,
            avatarSkinTone: true,
            avatarEyes: true,
            avatarBrows: true,
            avatarMouth: true,
            avatarNose: true,
            avatarHair: true,
            avatarEyewear: true,
            avatarAccessory: true
          }
        },
        members: {
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                useCustomAvatar: true,
                avatarSkinTone: true,
                avatarEyes: true,
                avatarBrows: true,
                avatarMouth: true,
                avatarNose: true,
                avatarHair: true,
                avatarEyewear: true,
                avatarAccessory: true
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        invitations: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          include: {
            invitedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              }
            }
          }
        }
      }
    });
  }
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if the user has access to this workspace
  const isOwner = workspace.ownerId === session.user.id;
  const isMember = workspace.members.some((member: { user: { id: string } }) => member.user.id === session.user.id);
  const isAdmin = session.user.role === 'admin';
  
  if (!isOwner && !isMember && !isAdmin) {
    throw new Error('You do not have access to this workspace');
  }
  
  return {
    ...workspace,
    isOwner,
    isMember,
    canManage: isOwner || isAdmin
  };
}

/**
 * Get members of a workspace
 */
export async function getWorkspaceMembers(workspaceId: string) {
  if (!workspaceId) {
    throw new Error('Workspace ID is required');
  }
  
  // Get workspace with members
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true
        }
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              role: true,
              useCustomAvatar: true,
              avatarSkinTone: true,
              avatarEyes: true,
              avatarBrows: true,
              avatarMouth: true,
              avatarNose: true,
              avatarHair: true,
              avatarEyewear: true,
              avatarAccessory: true
            }
          }
        }
      }
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Format members (including owner) for consistent structure
  const formattedMembers = workspace.members.map((member: { id: string; user: { id: string; name: string; image: string; role: string; }; role: string; }) => ({
    id: member.id,
    userId: member.user.id,
    role: member.role,
    user: member.user
  }));
  
  return { 
    workspace,
    members: formattedMembers
  };
} 

/**
 * Update workspace member status (activate/deactivate)
 */
export async function updateWorkspaceMemberStatus(data: {
  workspaceId: string;
  memberId: string;
  status: boolean;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { workspaceId, memberId, status } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // Get the workspace and check permissions
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: workspaceId
    },
    include: {
      owner: {
        select: {
          id: true
        }
      }
    }
  });
  
  if (!workspace) {
    throw new Error('Workspace not found');
  }
  
  // Check if user is the owner or has admin permissions
  const isOwner = workspace.ownerId === currentUser.id;
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId: currentUser.id,
      role: 'ADMIN',
      status: true
    }
  });
  
  if (!isOwner && !isAdmin) {
    throw new Error('Only workspace owners and admins can update member status');
  }
  
  // Find the member to update
  const member = await prisma.workspaceMember.findFirst({
    where: {
      id: memberId,
      workspaceId,
      status: true
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
  
  if (!member) {
    throw new Error('Member not found');
  }
  
  // Prevent deactivating the workspace owner
  if (member.userId === workspace.ownerId) {
    throw new Error('Cannot deactivate the workspace owner');
  }
  
  // Update the member status
  const updatedMember = await prisma.workspaceMember.update({
    where: {
      id: memberId
    },
    data: {
      status
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
  
  return updatedMember;
} 