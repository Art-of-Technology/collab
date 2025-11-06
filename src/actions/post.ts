'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { extractMentionUserIds } from '@/utils/mentions';
import { NotificationService, NotificationType } from '@/lib/notification-service';


/**
 * Iteratively strips all HTML tags from a string, to ensure complete removal
 */
function stripHtmlTags(input: string): string {
  let previous: string;
  do {
    previous = input;
    input = input.replace(/<[^>]*>?/g, '');
  } while (input !== previous);
  return input;
}

type PostType = 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION' | 'RESOLVED';
type PostPriority = 'normal' | 'high' | 'critical';

/**
 * Get posts with filters
 */
export async function getPosts({
  type,
  tag,
  authorId,
  workspaceId,
  limit = 20,
  cursor,
  includeProfileData = false
}: {
  type?: PostType;
  tag?: string;
  authorId?: string;
  workspaceId?: string;
  limit?: number;
  cursor?: string;
  includeProfileData?: boolean;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }
  
  // Build the query
  const query: any = {};
  
  // Filter by type if provided
  if (type && ["UPDATE", "BLOCKER", "IDEA", "QUESTION", "RESOLVED"].includes(type)) {
    query.type = type;
  }
  
  // Filter by author if provided
  if (authorId) {
    query.authorId = authorId;
  }

  // Filter by workspace - resolve slug to ID if needed
  let resolvedWorkspaceId: string | undefined = undefined;
  if (workspaceId) {
    const workspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { id: workspaceId },
          { slug: workspaceId }
        ]
      },
      select: { id: true }
    });
    
    if (workspace) {
      resolvedWorkspaceId = workspace.id;
      query.workspaceId = workspace.id;
    } else {
      const emptyResult: any = {
        posts: [],
        hasMore: false,
        nextCursor: null
      };
      
      // If includeProfileData is requested, still fetch user and stats
      if (includeProfileData && authorId) {
        const user = await prisma.user.findUnique({
          where: { id: authorId }
        });

        if (user) {
          const whereCondition = { authorId: user.id };

          const [postCount, commentCount, reactionsReceived] = await Promise.all([
            prisma.post.count({ where: whereCondition }),
            prisma.comment.count({ where: { authorId: user.id } }),
            prisma.reaction.count({ where: { post: whereCondition } }),
          ]);

          emptyResult.user = { ...user };
          emptyResult.stats = { postCount, commentCount, reactionsReceived };
        }
      }
      
      return emptyResult;
    }
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
      // Return empty result in correct format
      const emptyResult: any = {
        posts: [],
        hasMore: false,
        nextCursor: null
      };
      
      // If includeProfileData is requested, still fetch user and stats
      if (includeProfileData && authorId) {
        const user = await prisma.user.findUnique({
          where: { id: authorId }
        });

        if (user) {
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

          const whereCondition = {
            authorId: user.id,
          };

          const [postCount, commentCount, reactionsReceived] = await Promise.all([
            prisma.post.count({ where: whereCondition }),
            prisma.comment.count({
              where: {
                authorId: user.id,
              },
            }),
            prisma.reaction.count({
              where: {
                post: whereCondition,
              },
            }),
          ]);

          emptyResult.user = {
            ...user,
            name: member?.displayName ?? user.name,
            team: member?.team ?? user.team,
            currentFocus: member?.currentFocus ?? user.currentFocus,
            expertise: member?.expertise ?? user.expertise,
            role: member?.role ?? user.role,
            workspaceMemberId: member?.id ?? null,
          };

          emptyResult.stats = {
            postCount,
            commentCount,
            reactionsReceived
          };
        }
      }
      
      return emptyResult;
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
  
  // Add cursor-based pagination
  const cursorCondition = cursor ? {
    id: {
      lt: cursor
    }
  } : {};

  // Get the posts
  const posts = await prisma.post.findMany({
    where: {
      ...query,
      ...tagFilter,
      ...cursorCondition,
    },
    orderBy: [
      { isPinned: "desc" }, // Pinned posts first
      { createdAt: "desc" }, // Then by creation date
      { id: "desc" }, // Then by ID for consistent ordering
    ],
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
      followers: {
        select: {
          userId: true,
        }
      }
    },
    take: limit + 1, // Take one extra to check if there are more
  });

  // Check if there are more posts
  const hasMore = posts.length > limit;
  const actualPosts = hasMore ? posts.slice(0, limit) : posts;
  
  const postsWithFollowers = actualPosts.map(post => ({
    ...post,
    isFollowing: post.followers.some(follower => follower.userId === session.user.id),
  }));

  const result: any = {
    posts: postsWithFollowers,
    hasMore,
    nextCursor: actualPosts.length > 0 ? actualPosts[actualPosts.length - 1].id : null
  };

  if (includeProfileData && authorId) {
    const user = await prisma.user.findUnique({
      where: { id: authorId }
    });

    if (user) {
      const member = resolvedWorkspaceId
        ? await prisma.workspaceMember.findUnique({
            where: {
              userId_workspaceId: { userId: user.id, workspaceId: resolvedWorkspaceId },
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

      const whereCondition = resolvedWorkspaceId
        ? {
            authorId: user.id,
            workspaceId: resolvedWorkspaceId,
          }
        : {
            authorId: user.id,
          };

      const [postCount, commentCount, reactionsReceived] = await Promise.all([
        prisma.post.count({ where: whereCondition }),
        prisma.comment.count({
          where: {
            authorId: user.id,
            ...(resolvedWorkspaceId && {
              post: {
                workspaceId: resolvedWorkspaceId,
              },
            }),
          },
        }),
        prisma.reaction.count({
          where: {
            post: whereCondition,
          },
        }),
      ]);

      result.user = {
        ...user,
        name: member?.displayName ?? user.name,
        team: member?.team ?? user.team,
        currentFocus: member?.currentFocus ?? user.currentFocus,
        expertise: member?.expertise ?? user.expertise,
        role: member?.role ?? user.role,
        workspaceMemberId: member?.id ?? null,
      };

      result.stats = {
        postCount,
        commentCount,
        reactionsReceived
      };
    }
  }

  return result;
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
  
  if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION", "RESOLVED"].includes(type)) {
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
  
  // Create the post and record the action
  const post = await prisma.$transaction(async (tx) => {
    // Create the post
    const newPost = await tx.post.create({
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

    // Record the creation action using normal Prisma client
    await tx.postAction.create({
      data: {
        postId: newPost.id,
        userId: user.id,
        actionType: 'CREATED',
        newValue: JSON.stringify({ 
          message: newPost.message, 
          type: newPost.type, 
          priority: newPost.priority,
          workspaceId: workspaceId 
        }),
        metadata: { 
          postId: newPost.id,
          workspaceId: workspaceId,
          createdAt: newPost.createdAt 
        },
      },
    });

    return newPost;
  });
  
  // Process mentions and auto-follow mentioned users
  const mentionedUserIds = extractMentionUserIds(html || message);


  // Auto-follow mentioned users to the post
  await NotificationService.autoFollowPost(post.id, [...mentionedUserIds, user.id]);

  if (mentionedUserIds.length > 0) {
    try {
      const notificationContent = `@[${user.name}](${user.id}) mentioned you in a post: ${stripHtmlTags(message)}`;
      await NotificationService.notifyUsers(
        mentionedUserIds.filter((id) => id !== user.id),
        'post_mention',
        notificationContent,
        user.id,
        { postId: post.id }
      );

      if (post.type === 'BLOCKER') {
        await NotificationService.notifyPostFollowers({
          postId: post.id,
          senderId: user.id,
          type: NotificationType.POST_BLOCKER_CREATED,
          content: `${user.name} created a blocker post`,
          excludeUserIds: [],
        });
      }
    } catch (error) {
      console.error("Failed to create mention notifications or auto-follow:", error);
    }
  }
  
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
  
  if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION", "RESOLVED"].includes(type)) {
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
  
  // Update the post and track changes
  const updatedPost = await prisma.$transaction(async (tx) => {
    // First, disconnect all existing tags
    await tx.post.update({
      where: { id: postId },
      data: {
        tags: {
          set: [] // Remove all tag connections
        }
      }
    });
    
    // Detect what changed
    const changes = [];
    const oldValues: any = {};
    const newValues: any = {};
    
    if (existingPost.message.trim() !== message.trim()) {
      changes.push('EDITED');
      oldValues.message = existingPost.message;
      newValues.message = message.trim();
    }
    
    if (existingPost.type !== type) {
      changes.push('TYPE_CHANGED');
      oldValues.type = existingPost.type;
      newValues.type = type;
    }
    
    if (existingPost.priority !== priority) {
      changes.push('PRIORITY_CHANGED');
      oldValues.priority = existingPost.priority;
      newValues.priority = priority;
    }

    // Update the post
    const post = await tx.post.update({
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

    // Record actions for each change using normal Prisma client
    for (const change of changes) {
      await tx.postAction.create({
        data: {
          postId: postId,
          userId: user.id,
          actionType: change as any, // Cast to handle enum
          oldValue: JSON.stringify(oldValues),
          newValue: JSON.stringify(newValues),
          metadata: { 
            changeType: change,
            updatedAt: new Date(),
            postId: postId 
          },
        },
      });
    }

    return post;
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
  
  // Record deletion action and delete the post
  await prisma.$transaction(async (tx) => {
    // Record the deletion action before deleting using normal Prisma client
    await tx.postAction.create({
      data: {
        postId: postId,
        userId: user.id,
        actionType: 'DELETED',
        oldValue: JSON.stringify({ 
          message: existingPost.message, 
          type: existingPost.type, 
          priority: existingPost.priority,
          workspaceId: existingPost.workspaceId 
        }),
        metadata: { 
          deletedAt: new Date(),
          deletedBy: user.id,
          postId: postId 
        },
      },
    });

    // Delete the post - Prisma cascade will handle related records
    await tx.post.delete({
      where: { id: postId },
    });
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
    orderBy: [
      { isPinned: "desc" }, // Pinned posts first
      { createdAt: "desc" }, // Then by creation date
    ],
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

/**
 * Convert a blocker post to resolved status
 * Only post author, workspace owner, or admin can resolve
 */
export async function resolveBlockerPost(postId: string) {
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
  
  // Get the post with workspace information
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      workspace: {
        select: {
          id: true,
          ownerId: true,
          members: {
            where: { userId: user.id },
            select: { role: true }
          }
        }
      }
    }
  });

  if (!post) {
    throw new Error('Post not found');
  }
  
  // Check if the post is a blocker
  if (post.type !== 'BLOCKER') {
    throw new Error('Only blocker posts can be resolved');
  }
  
  // Check permissions using the permission system
  const { checkUserPermission, Permission } = await import('@/lib/permissions');
  
  if (!post.workspaceId) {
    throw new Error('Cannot resolve posts without a workspace');
  }
  
  const hasResolvePermission = await checkUserPermission(
    user.id,
    post.workspaceId,
    Permission.RESOLVE_BLOCKER
  );
  
  // Allow if user has permission or is the post author
  const canResolve = hasResolvePermission.hasPermission || post.authorId === user.id;
  
  if (!canResolve) {
    throw new Error('You do not have permission to resolve this blocker');
  }
  
  // Update the post to resolved and record the action
  const now = new Date();
  
  const updatedPost = await prisma.$transaction(async (tx) => {
    // Update the post using normal Prisma client
    const post = await tx.post.update({
      where: { id: postId },
      data: {
        type: 'RESOLVED',
        resolvedAt: now,
        resolvedById: user.id,
      },
      include: {
        author: true,
        workspace: true,
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

    // Record the action using normal Prisma client
    await tx.postAction.create({
      data: {
        postId: postId,
        userId: user.id,
        actionType: 'RESOLVED',
        oldValue: JSON.stringify({ type: 'BLOCKER' }),
        newValue: JSON.stringify({ type: 'RESOLVED', resolvedAt: now }),
        metadata: {
          resolvedAt: now,
          resolvedById: user.id,
        },
      },
    });

    return post;
  });
  
  // Notify post followers about the resolution
  try {
    await NotificationService.notifyPostFollowers({
      postId: postId,
      senderId: user.id,
      type: NotificationType.POST_RESOLVED,
      content: `resolved the blocker post`,
      excludeUserIds: [],
    });
  } catch (error) {
    console.error("Failed to notify post followers:", error);
    // Don't fail the post resolution if notifications fail
  }
  
  return updatedPost;
}

/**
 * Get post action history
 */
export async function getPostActions(postId: string) {
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
  
  // Verify user has access to the post
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      workspace: {
        select: {
          id: true,
          ownerId: true,
          members: {
            where: { userId: user.id },
            select: { id: true }
          }
        }
      }
    }
  });

  if (!post) {
    throw new Error('Post not found');
  }
  
  // Check if user has access to the workspace
  if (!post.workspaceId) {
    // If no workspace, only author can view
    if (post.authorId !== user.id) {
      throw new Error('You do not have access to this post');
    }
  } else {
    // Check if user is a member of the workspace
    const isWorkspaceMember = post.workspace?.members && post.workspace.members.length > 0;
    const isWorkspaceOwner = post.workspace?.ownerId === user.id;
    const isAuthor = post.authorId === user.id;
    
    if (!isAuthor && !isWorkspaceOwner && !isWorkspaceMember) {
      throw new Error('You do not have access to this post');
    }
  }
  
  // Get action history using normal Prisma client
  const actions = await prisma.postAction.findMany({
    where: {
      postId: postId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
  
  // Transform to match expected format
  return actions.map(action => ({
    ...action,
    user_id: action.user.id,
    user_name: action.user.name,
    user_image: action.user.image,
  }));
} 