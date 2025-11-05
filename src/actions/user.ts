'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

/**
 * Get the current user profile
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return null;
  }
  
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      team: true,
      currentFocus: true,
      expertise: true,
      slackId: true,
      createdAt: true,
      updatedAt: true,
      useCustomAvatar: true,
      avatarSkinTone: true,
      avatarEyes: true,
      avatarBrows: true,
      avatarMouth: true,
      avatarNose: true,
      avatarHair: true,
      avatarEyewear: true,
      avatarAccessory: true,
    }
  });
  
  return user;
}

/**
 * Get a user by ID
 */
export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      team: true,
      currentFocus: true,
      expertise: true,
      createdAt: true,
      useCustomAvatar: true,
      avatarSkinTone: true,
      avatarEyes: true,
      avatarBrows: true,
      avatarMouth: true,
      avatarNose: true,
      avatarHair: true,
      avatarEyewear: true,
      avatarAccessory: true,
    }
  });
  
  return user;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  data: {
    name?: string;
    team?: string;
    currentFocus?: string;
    expertise?: string[];
    slackId?: string;
  },
  workspaceId?: string
) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { name, team, currentFocus, expertise, slackId } = data;
  
  // Validate the input
  if (name && typeof name !== "string") {
    throw new Error('Invalid name');
  }
  
  if (team && typeof team !== "string") {
    throw new Error('Invalid team');
  }
  
  if (currentFocus && typeof currentFocus !== "string") {
    throw new Error('Invalid currentFocus');
  }
  
  if (expertise && !Array.isArray(expertise)) {
    throw new Error('Invalid expertise');
  }
  
  if (slackId && typeof slackId !== "string") {
    throw new Error('Invalid slackId');
  }
  
  // Get current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // If a workspace is provided, update WorkspaceMember (workspace-scoped profile)
  if (workspaceId) {
    const updatedMember = await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: currentUser.id,
          workspaceId,
        },
      },
      update: {
        displayName: name || null,
        team: team || null,
        currentFocus: currentFocus || null,
        expertise: expertise || [],
        slackId: slackId || null,
      },
      create: {
        userId: currentUser.id,
        workspaceId,
        displayName: name || null,
        team: team || null,
        currentFocus: currentFocus || null,
        expertise: expertise || [],
        slackId: slackId || null,
      },
    });
    return updatedMember;
  }

  // Otherwise, update global user (legacy/global scope)
  const updatedUser = await prisma.user.update({
    where: {
      id: currentUser.id,
    },
    data: {
      name: name || null,
      team: team || null,
      currentFocus: currentFocus || null,
      expertise: expertise || [],
      slackId: slackId || null,
    },
  });

  return updatedUser;
}

/**
 * Update user's avatar
 */
export async function updateUserAvatar(data: {
  avatarSkinTone?: number;
  avatarEyes?: number;
  avatarBrows?: number;
  avatarMouth?: number;
  avatarNose?: number;
  avatarHair?: number;
  avatarEyewear?: number;
  avatarAccessory?: number;
  useCustomAvatar?: boolean;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { 
    avatarSkinTone, 
    avatarEyes, 
    avatarBrows, 
    avatarMouth, 
    avatarNose, 
    avatarHair, 
    avatarEyewear, 
    avatarAccessory, 
    useCustomAvatar 
  } = data;
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // Update the user's avatar settings
  const updatedUser = await prisma.user.update({
    where: {
      id: currentUser.id
    },
    data: {
      avatarSkinTone: avatarSkinTone !== undefined ? avatarSkinTone : currentUser.avatarSkinTone,
      avatarEyes: avatarEyes !== undefined ? avatarEyes : currentUser.avatarEyes,
      avatarBrows: avatarBrows !== undefined ? avatarBrows : currentUser.avatarBrows,
      avatarMouth: avatarMouth !== undefined ? avatarMouth : currentUser.avatarMouth,
      avatarNose: avatarNose !== undefined ? avatarNose : currentUser.avatarNose,
      avatarHair: avatarHair !== undefined ? avatarHair : currentUser.avatarHair,
      avatarEyewear: avatarEyewear !== undefined ? avatarEyewear : currentUser.avatarEyewear,
      avatarAccessory: avatarAccessory !== undefined ? avatarAccessory : currentUser.avatarAccessory,
      useCustomAvatar: useCustomAvatar !== undefined ? useCustomAvatar : currentUser.useCustomAvatar
    }
  });
  
  return updatedUser;
}

/**
 * Get current user's profile with stats
 */
export async function getCurrentUserProfile(workspaceId?: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the user
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // If workspace-scoped, load membership for persona
  const member = workspaceId
    ? await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId: user.id, workspaceId },
        },
        select: {
          id: true,
          role: true,
          displayName: true,
          team: true,
          currentFocus: true,
          expertise: true,
          slackId: true,
        },
      })
    : null;

  // Get user's posts
  const userPosts = await prisma.post.findMany({
    where: {
      authorId: user.id
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      author: true,
      tags: true,
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: true,
    },
  });
  
  // Get stats
  const postCount = userPosts.length;
  const commentCount = await prisma.comment.count({
    where: {
      authorId: user.id
    }
  });
  const reactionsReceived = await prisma.reaction.count({
    where: {
      post: {
        authorId: user.id
      }
    }
  });
  
  return {
    user: {
      ...user,
      // Override with workspace-scoped profile where available
      name: member?.displayName ?? user.name,
      team: member?.team ?? user.team,
      currentFocus: member?.currentFocus ?? user.currentFocus,
      expertise: member?.expertise ?? user.expertise,
      role: member?.role ?? user.role,
      workspaceMemberId: member?.id ?? null,
    },
    posts: userPosts,
    stats: {
      postCount,
      commentCount,
      reactionsReceived
    }
  };
}

/**
 * Get another user's profile with stats
 */
export async function getUserProfile(userId: string, workspaceId?: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get the current user
  const currentUser = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!currentUser) {
    throw new Error('User not found');
  }
  
  // Get the target user
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // If this is the current user's profile, throw error to redirect
  if (userId === currentUser.id) {
    throw new Error('self_profile');
  }
  
  // Load workspace membership if in a workspace context
  const member = workspaceId
    ? await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: { userId, workspaceId },
        },
        select: {
          id: true,
          role: true,
          displayName: true,
          team: true,
          currentFocus: true,
          expertise: true,
          slackId: true,
        },
      })
    : null;

  // Get user's posts
  const userPosts = await prisma.post.findMany({
    where: {
      authorId: user.id
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      author: true,
      tags: true,
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: true,
    },
  });
  
  // Get stats
  const postCount =  userPosts.length;
  const commentCount = await prisma.comment.count({
    where: {
      authorId: user.id
    }
  });
  const reactionsReceived = await prisma.reaction.count({
    where: {
      post: {
        authorId: user.id
      }
    }
  });
  
  // Check if there's a conversation between the users already
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      AND: [
        {
          participants: {
            some: {
              id: currentUser.id
            }
          }
        },
        {
          participants: {
            some: {
              id: user.id
            }
          }
        }
      ]
    }
  });
  
  return {
    user: {
      ...user,
      name: member?.displayName ?? user.name,
      team: member?.team ?? user.team,
      currentFocus: member?.currentFocus ?? user.currentFocus,
      expertise: member?.expertise ?? user.expertise,
      role: member?.role ?? user.role,
      workspaceMemberId: member?.id ?? null,
    },
    posts: userPosts,
    stats: {
      postCount,
      commentCount,
      reactionsReceived
    },
    currentUser,
    existingConversation
  };
} 