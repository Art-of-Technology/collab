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
      type: type as any,
      workspaceId
    },
    orderBy: [
      { isPinned: "desc" }, // Pinned posts first
      { createdAt: "desc" }, // Then by creation date
    ],
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
    orderBy: [
      { isPinned: "desc" }, // Pinned posts first
      { createdAt: "desc" }, // Then by creation date
    ],
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
    orderBy: [
      { isPinned: "desc" }, // Pinned posts first
      { createdAt: "desc" }, // Then by creation date
    ],
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
  
  // Get recent comments (from posts, epics, stories, and milestones)
  const recentComments = await prisma.comment.findMany({
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    where: {
      OR: [
        {
          post: {
            workspaceId
          }
        },
        {
          epic: {
            workspaceId
          }
        },
        {
          story: {
            workspaceId
          }
        },
        {
          milestone: {
            workspaceId
          }
        }
      ]
    },
    include: {
      author: true,
      post: {
        include: {
          author: true,
        },
      },
      epic: {
        select: {
          id: true,
          title: true,
          issueKey: true,
        }
      },
      story: {
        select: {
          id: true,
          title: true,
          issueKey: true,
        }
      },
      milestone: {
        select: {
          id: true,
          title: true,
          issueKey: true,
        }
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
      post: comment.post,
      epic: comment.epic,
      story: comment.story,
      milestone: comment.milestone,
      // Determine the target type and title for display
      targetType: comment.post ? 'post' : comment.epic ? 'epic' : comment.story ? 'story' : comment.milestone ? 'milestone' : 'unknown',
      targetTitle: comment.post?.message?.substring(0, 50) || comment.epic?.title || comment.story?.title || comment.milestone?.title || 'Unknown',
      targetKey: comment.epic?.issueKey || comment.story?.issueKey || comment.milestone?.issueKey || null,
    })),
    ...validLikes.map((like) => ({
      type: "like" as const,
      id: like.id,
      createdAt: like.createdAt,
      author: like.author,
      post: like.post,
      targetType: 'post',
      targetTitle: like.post?.message?.substring(0, 50) || 'Unknown',
      targetKey: null,
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return activities;
} 