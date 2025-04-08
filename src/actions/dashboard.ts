'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

/**
 * Get recent posts by type
 */
export async function getRecentPostsByType(params: {
  type: string; 
  workspaceId: string;
  limit?: number;
}) {
  const { type, workspaceId, limit = 5 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  return prisma.post.findMany({
    take: limit,
    where: {
      type,
      workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });
}

/**
 * Get user's posts
 */
export async function getUserPosts(params: {
  userId: string;
  workspaceId: string;
  limit?: number;
}) {
  const { userId, workspaceId, limit = 5 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  return prisma.post.findMany({
    take: limit,
    where: {
      authorId: userId,
      workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      tags: true,
      _count: {
        select: {
          comments: true,
          reactions: true,
        },
      },
    },
  });
}

/**
 * Get popular tags
 */
export async function getPopularTags(params: {
  workspaceId: string;
  limit?: number;
}) {
  const { workspaceId, limit = 10 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  return prisma.tag.findMany({
    take: limit,
    orderBy: {
      posts: {
        _count: "desc",
      },
    },
    where: {
      posts: {
        some: {
          workspaceId
        }
      }
    },
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });
}

/**
 * Get unanswered posts
 */
export async function getUnansweredPosts(params: {
  workspaceId: string;
  limit?: number;
}) {
  const { workspaceId, limit = 5 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  return prisma.post.findMany({
    take: limit,
    where: {
      comments: {
        none: {},
      },
      type: {
        in: ["QUESTION", "BLOCKER"],
      },
      workspaceId
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      _count: {
        select: {
          reactions: true,
        },
      },
    },
  });
}

/**
 * Get team metrics
 */
export async function getTeamMetrics(params: {
  workspaceId: string;
  days?: number;
}) {
  const { workspaceId, days = 7 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  return prisma.$transaction([
    prisma.post.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000), // Last N days
        },
        workspaceId
      },
    }),
    prisma.comment.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000), // Last N days
        },
        post: {
          workspaceId
        }
      },
    }),
    prisma.reaction.count({
      where: {
        post: {
          workspaceId
        }
      }
    }), // Count all reactions since there's no createdAt field
    prisma.post.count({
      where: {
        type: "BLOCKER",
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000), // Last N days
        },
        workspaceId
      },
    }),
  ]);
}

/**
 * Get recent activities
 */
export async function getRecentActivities(params: {
  workspaceId: string;
  limit?: number;
}) {
  const { workspaceId, limit = 5 } = params;
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Get recent comments
  const recentComments = await prisma.comment.findMany({
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    where: {
      post: {
        workspaceId
      }
    },
    include: {
      author: true,
      post: {
        include: {
          author: true,
        },
      },
    },
  });

  // Get recent likes
  const recentLikes = await prisma.reaction.findMany({
    take: limit,
    where: {
      type: "LIKE",
      post: {
        workspaceId
      }
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      post: {
        include: {
          author: true,
        },
      },
    },
  });

  // Filter out likes with null posts
  const validLikes = recentLikes.filter(like => like.post !== null);

  // Combine activities
  const activities = [
    ...recentComments.map(comment => ({
      type: "comment" as const,
      id: comment.id,
      createdAt: comment.createdAt,
      author: comment.author,
      message: comment.message,
      post: comment.post
    })),
    ...validLikes.map((like) => ({
      type: "like" as const,
      id: like.id,
      createdAt: like.createdAt,
      author: like.author,
      post: like.post,
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return activities;
} 