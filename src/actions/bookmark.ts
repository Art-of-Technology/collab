'use server';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';

/**
 * Get all bookmarks for the current user
 */
export async function getUserBookmarks() {
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
  
  // Get bookmarks for the user
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId: user.id
    },
    include: {
      post: {
        include: {
          author: {
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
              avatarAccessory: true,
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  return bookmarks;
}

/**
 * Check if a post is bookmarked by the current user
 */
export async function isPostBookmarked(postId: string) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return false; // Not authenticated, so not bookmarked
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
    return false;
  }
  
  // Check if the post is bookmarked
  const bookmark = await prisma.bookmark.findFirst({
    where: {
      userId: user.id,
      postId
    }
  });
  
  return !!bookmark;
}

/**
 * Add a bookmark
 */
export async function addBookmark(postId: string) {
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
  
  // Check if the post exists
  const post = await prisma.post.findUnique({
    where: {
      id: postId
    }
  });
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  // Check if already bookmarked
  const existingBookmark = await prisma.bookmark.findFirst({
    where: {
      userId: user.id,
      postId
    }
  });
  
  if (existingBookmark) {
    return existingBookmark; // Already bookmarked
  }
  
  // Create the bookmark
  const bookmark = await prisma.bookmark.create({
    data: {
      user: {
        connect: {
          id: user.id
        }
      },
      post: {
        connect: {
          id: postId
        }
      }
    },
    include: {
      post: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      }
    }
  });
  
  return bookmark;
}

/**
 * Remove a bookmark
 */
export async function removeBookmark(postId: string) {
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
  
  // Find the bookmark
  const bookmark = await prisma.bookmark.findFirst({
    where: {
      userId: user.id,
      postId
    }
  });
  
  if (!bookmark) {
    throw new Error('Bookmark not found');
  }
  
  // Delete the bookmark
  await prisma.bookmark.delete({
    where: {
      id: bookmark.id
    }
  });
  
  return { success: true };
} 