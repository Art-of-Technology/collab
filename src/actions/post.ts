'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

type PostType = 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION';
type PostPriority = 'normal' | 'high' | 'critical';

/**
 * Get posts with filters
 */
export async function getPosts({
  type,
  tag,
  authorId,
  workspaceId,
  limit = 20
}: {
  type?: PostType;
  tag?: string;
  authorId?: string;
  workspaceId?: string;
  limit?: number;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Build the query
  const query: any = {};
  
  // Filter by type if provided
  if (type && ["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
    query.type = type;
  }
  
  // Filter by author if provided
  if (authorId) {
    query.authorId = authorId;
  }

  // Filter by workspace
  if (workspaceId) {
    query.workspaceId = workspaceId;
  } else {
    // Get workspaces the user has access to
    const accessibleWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      select: { id: true }
    });
    
    if (accessibleWorkspaces.length === 0) {
      return [];
    }
    
    // Include workspaceId IN filter
    query.workspaceId = {
      in: accessibleWorkspaces.map(w => w.id)
    };
  }
  
  // Filter by tag if provided
  const tagFilter = tag 
    ? {
        tags: {
          some: {
            name: tag,
          },
        },
      } 
    : {};
  
  // Get the posts
  const posts = await prisma.post.findMany({
    where: {
      ...query,
      ...tagFilter,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          role: true,
          team: true,
          useCustomAvatar: true,
          avatarSkinTone: true,
          avatarEyes: true,
          avatarBrows: true,
          avatarMouth: true,
          avatarNose: true,
          avatarHair: true,
          avatarEyewear: true,
          avatarAccessory: true,
        },
      },
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
        },
      },
      tags: true,
      comments: {
        select: {
          id: true,
        },
      },
      reactions: {
        select: {
          id: true,
          type: true,
          authorId: true,
        },
      },
    },
    take: limit,
  });

  return posts;
}

/**
 * Get a single post by ID with full details
 */
export async function getPostById(postId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    include: {
      author: true,
      tags: true,
      workspace: {
        select: {
          id: true,
          name: true,
          members: {
            where: {
              userId: user.id
            },
            select: {
              id: true
            }
          },
          ownerId: true
        }
      },
      comments: {
        include: {
          author: true,
          reactions: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    throw new Error('Post not found');
  }
  
  // Check if user has access to the workspace this post belongs to
  const isWorkspaceOwner = post.workspace?.ownerId === user.id;
  const isMember = post.workspace?.members && post.workspace.members.length > 0;
  const hasAccess = isWorkspaceOwner || isMember;
  
  if (!hasAccess) {
    throw new Error('You do not have access to this post');
  }

  return post;
}

/**
 * Create a new post
 */
export async function createPost(data: {
  message: string;
  html?: string;
  type: PostType;
  tags?: string[];
  priority: PostPriority;
  workspaceId: string;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { message, html, type, tags, priority, workspaceId } = data;
  
  // Validation
  if (!message || !message.trim()) {
    throw new Error('Message is required');
  }
  
  if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
    throw new Error('Invalid post type');
  }
  
  if (!["normal", "high", "critical"].includes(priority)) {
    throw new Error('Invalid priority');
  }

  if (!workspaceId) {
    throw new Error('Workspace is required');
  }
  
  // Verify user has access to the workspace
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
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
  
  // Create the post
  const post = await prisma.post.create({
    data: {
      message: message.trim(),
      html: html || null,
      type,
      priority,
      author: {
        connect: {
          id: user.id,
        },
      },
      workspace: {
        connect: {
          id: workspaceId,
        },
      },
    },
    include: {
      author: true,
      workspace: true,
    },
  });
  
  // Process tags if provided
  if (tags && tags.length > 0) {
    for (const tagName of tags) {
      // Try to find the tag first
      let tag = await prisma.tag.findFirst({
        where: {
          name: tagName,
          workspaceId,
        },
      });
      
      // If tag doesn't exist, create it
      if (!tag) {
        tag = await prisma.tag.create({
          data: {
            name: tagName,
            workspace: {
              connect: {
                id: workspaceId,
              },
            },
          },
        });
      }
      
      // Connect the tag to the post
      await prisma.post.update({
        where: { id: post.id },
        data: {
          tags: {
            connect: {
              id: tag.id,
            },
          },
        },
      });
    }
  }
  
  return post;
}

/**
 * Update an existing post
 */
export async function updatePost(postId: string, data: {
  message: string;
  type: PostType;
  tags?: string[];
  priority: PostPriority;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  const { message, type, tags, priority } = data;
  
  // Validation
  if (!message || !message.trim()) {
    throw new Error('Message is required');
  }
  
  if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
    throw new Error('Invalid post type');
  }
  
  if (!["normal", "high", "critical"].includes(priority)) {
    throw new Error('Invalid priority');
  }
  
  // Verify the post exists
  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!existingPost) {
    throw new Error('Post not found');
  }
  
  // Verify the user is the author of the post
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (existingPost.authorId !== user.id) {
    throw new Error('Unauthorized to edit this post');
  }
  
  // Process tags - disconnect all existing tags and connect new ones
  const tagsArray = Array.isArray(tags) ? tags : [];
  const workspaceId = existingPost.workspaceId as string;
  
  // First, disconnect all existing tags
  await prisma.post.update({
    where: { id: postId },
    data: {
      tags: {
        set: [] // Remove all tag connections
      }
    }
  });
  
  // Update the post
  const updatedPost = await prisma.post.update({
    where: { id: postId },
    data: {
      message: message.trim(),
      type,
      priority,
    },
    include: {
      author: true,
      workspace: true,
      tags: true,
    },
  });
  
  // Process new tags
  if (tagsArray.length > 0) {
    for (const tagName of tagsArray) {
      // Try to find the tag first
      let tag = await prisma.tag.findFirst({
        where: {
          name: tagName,
          workspaceId,
        },
      });
      
      // If tag doesn't exist, create it
      if (!tag) {
        tag = await prisma.tag.create({
          data: {
            name: tagName,
            workspace: {
              connect: {
                id: workspaceId,
              },
            },
          },
        });
      }
      
      // Connect the tag to the post
      await prisma.post.update({
        where: { id: updatedPost.id },
        data: {
          tags: {
            connect: {
              id: tag.id,
            },
          },
        },
      });
    }
  }
  
  return updatedPost;
}

/**
 * Delete a post
 */
export async function deletePost(postId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Verify the post exists
  const existingPost = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!existingPost) {
    throw new Error('Post not found');
  }
  
  // Verify the user is the author of the post
  const user = await prisma.user.findUnique({
    where: {
      email: session.user.email
    }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (existingPost.authorId !== user.id) {
    throw new Error('Unauthorized to delete this post');
  }
  
  // Delete the post - Prisma cascade will handle related records
  await prisma.post.delete({
    where: { id: postId },
  });
  
  return true;
}

/**
 * Get posts created by a specific user in a workspace
 */
export async function getUserPosts(userId: string, workspaceId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Verify the user has access to this workspace
  const isWorkspaceMember = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      OR: [
        { ownerId: session.user.id },
        { members: { some: { userId: session.user.id } } }
      ]
    }
  });
  
  if (!isWorkspaceMember) {
    throw new Error('Workspace not found or access denied');
  }
  
  // Get user's posts
  const userPosts = await prisma.post.findMany({
    where: {
      authorId: userId,
      workspaceId: workspaceId
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
  
  return userPosts;
} 