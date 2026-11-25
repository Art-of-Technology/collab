'use server';

import { assertNoRetainedIssues } from '@/lib/issue-trash';

import { assertLegacyWorkspaceDeleteAllowed } from '@/lib/forge/legacy-write-guard';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/request-session';
import { getCurrentUser } from '@/lib/session';
import { checkUserPermission, Permission, WorkspaceRole } from '@/lib/permissions';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { generateWorkspaceSlug } from '@/lib/utils';
import { getWorkspaceAuthority, levelOfRole, may, mayActOn, rolesMayGrant } from '@/lib/workspace-authority';

async function resolveWorkspaceReadId(slugOrId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: slugOrId }, select: { id: true },
  }) ?? await prisma.workspace.findUnique({
    where: { id: slugOrId }, select: { id: true },
  });
  if (!workspace) throw new Error('Workspace not found');
  return workspace.id;
}

/**
 * Get all workspaces for the current user
 */
export async function getUserWorkspaces() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
          userId: user.id,
          status: true
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      id: true
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const resolvedId = await resolveWorkspaceReadId(workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: resolvedId, AND: [postWorkspaceAccessWhere(user.id)] },
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

  if (!workspace) {
    throw new Error('You do not have access to this workspace');
  }
  
  // Check if the user has access to this workspace
  const isOwner = workspace.ownerId === user.id;
  const isMember = workspace.members.some((member) => member.userId === user.id && member.status === true);
  
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { name, description, slug, logoUrl } = data;
  
  // Validate input
  if (!name || !name.trim()) {
    throw new Error('Workspace name is required');
  }
  
  // Generate a slug if not provided
  const baseSlug = generateWorkspaceSlug(slug?.trim() ? slug.trim() : name.trim());
  
  // Ensure slug is not empty after sanitization
  if (!baseSlug) {
    throw new Error('Workspace name must contain at least one alphanumeric character');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Ensure slug is unique by appending numbers if necessary
  let workspaceSlug = baseSlug;
  let counter = 1;
  while (true) {
    const existingWorkspace = await prisma.workspace.findFirst({
      where: {
        slug: workspaceSlug
      }
    });
    
    if (!existingWorkspace) {
      break;
    }
    
    workspaceSlug = `${baseSlug}-${counter}`;
    counter++;
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
      },
      members: {
        create: {
          userId: user.id,
          role: 'OWNER'
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { name, description, slug, logoUrl } = data;
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
  
  if (!may(await getWorkspaceAuthority(user.id, workspaceId), 'workspace.settings')) {
    throw new Error('Only Owners can change the workspace settings');
  }
  
  // If slug is changing, check that the new slug is available
  if (slug && slug !== workspace.slug) {
    // /docs and everything under it is the public documentation, so a workspace there could not be opened.
    if (slug === 'docs') throw new Error('This slug is reserved for the documentation');
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
  
  if (!may(await getWorkspaceAuthority(user.id, workspaceId), 'workspace.delete')) {
    throw new Error('Only the primary owner can delete the workspace');
  }
  
  await assertLegacyWorkspaceDeleteAllowed(workspaceId);
  await assertNoRetainedIssues({ OR: [{ workspaceId }, { project: { workspaceId } }] });

  // Delete the workspace
  await prisma.workspace.delete({
    where: {
      id: workspaceId
    }
  });
  
  return { success: true };
}

/**
 * Remove a member from a workspace
 */
export async function removeWorkspaceMember(data: {
  workspaceId: string;
  userId: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { workspaceId, userId } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
  
  // Anyone but the primary owner may leave; removing someone else follows the rank rule
  const leaving = currentUser.id === userId;
  if (leaving && workspace.ownerId === userId) {
    throw new Error('The primary owner cannot leave the workspace');
  }
  const actor = leaving ? null : await getWorkspaceAuthority(currentUser.id, workspaceId);
  if (!leaving && !may(actor, 'members.manage')) {
    throw new Error('Only Owners and Admins can remove other members');
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

  const target = { userId, level: userId === workspace.ownerId ? 'PRIMARY_OWNER' as const : levelOfRole(member.role) };
  if (!leaving && !mayActOn(actor, target, { holdsChangeRoles: false })) {
    throw new Error('You can only remove members below your own level');
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
  
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.id !== userId) throw new Error('Unauthorized');

  const userWorkspaces = await prisma.workspace.findMany({
    where: postWorkspaceAccessWhere(currentUser.id),
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

  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.email !== email) {
    throw new Error('Unauthorized');
  }
  
  const pendingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: currentUser.email,
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
  const currentUser = await getCurrentUser();
  
  if (!currentUser) {
    throw new Error('Unauthorized');
  }
  
  const resolvedId = await resolveWorkspaceReadId(workspaceId);
  const isAdmin = currentUser.role === 'SYSTEM_ADMIN';
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: resolvedId,
      ...(isAdmin ? {} : { AND: [postWorkspaceAccessWhere(currentUser.id)] }),
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

  if (!workspace) {
    throw new Error('You do not have access to this workspace');
  }
  
  // Check if the user has access to this workspace
  const isOwner = workspace.ownerId === currentUser.id;
  const isMember = workspace.members.some((member) => member.user.id === currentUser.id && member.status === true);
  
  if (!isOwner && !isMember && !isAdmin) {
    throw new Error('You do not have access to this workspace');
  }

  // Pending invitations carry the token of the invitation link: only a viewer who may invite receives them.
  const [{ hasPermission: canInvite }, { hasPermission: holdsChangeRoles }, viewer, customRoles] = await Promise.all([
    checkUserPermission(currentUser.id, workspace.id, Permission.INVITE_MEMBERS),
    checkUserPermission(currentUser.id, workspace.id, Permission.CHANGE_MEMBER_ROLES),
    getWorkspaceAuthority(currentUser.id, workspace.id),
    prisma.customRole.findMany({ where: { workspaceId: workspace.id }, select: { name: true } }),
  ]);
  const rank = { holdsChangeRoles };

  return {
    ...workspace,
    // The Members screen renders these as they are: it compares no role and no owner itself.
    members: workspace.members.map((member) => {
      // An account with no email is an agent token's service account, which the Agent tokens page manages.
      const agent = !member.user.email;
      const level = member.user.id === workspace.ownerId ? 'PRIMARY_OWNER' as const : levelOfRole(member.role);
      return { ...member, level, agent, mayAct: !agent && mayActOn(viewer, { userId: member.user.id, level }, rank) };
    }),
    viewerLevel: viewer?.level ?? null,
    rolesViewerMayGrant: rolesMayGrant(viewer, [...Object.values(WorkspaceRole), ...customRoles.map((role) => role.name)], rank),
    invitations: canInvite ? workspace.invitations : [],
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
  
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('Unauthorized');

  // Get workspace with members
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId, AND: [postWorkspaceAccessWhere(currentUser.id)] },
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
  const formattedMembers = workspace.members.map((member) => ({
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
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  
  const { workspaceId, memberId, status } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      id: session.user.id
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
  
  // Check if user is an Owner or an Admin of the workspace
  const actor = await getWorkspaceAuthority(currentUser.id, workspaceId);
  if (!may(actor, 'members.manage')) {
    throw new Error('Only workspace owners and admins can update member status');
  }
  
  // Find the member to update
  const member = await prisma.workspaceMember.findFirst({
    where: {
      id: memberId,
      workspaceId
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
  
  // The rank rule, which also keeps the workspace owner's membership on
  const target = { userId: member.userId, level: member.userId === workspace.ownerId ? 'PRIMARY_OWNER' as const : levelOfRole(member.role) };
  if (!mayActOn(actor, target, { holdsChangeRoles: false })) {
    throw new Error('You can only switch on or off members below your own level');
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