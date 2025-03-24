import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const { postId } = params;
    
    // Verify the post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });
    
    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }
    
    // Check if the user has already bookmarked this post
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        postId,
        userId: currentUser.id,
      },
    });
    
    // If there's an existing bookmark, remove it (toggle functionality)
    if (existingBookmark) {
      await prisma.bookmark.delete({
        where: {
          id: existingBookmark.id,
        },
      });
      
      return NextResponse.json({ status: "removed" });
    }
    
    // Otherwise, create a new bookmark
    await prisma.bookmark.create({
      data: {
        postId,
        userId: currentUser.id,
      },
    });
    
    return NextResponse.json({ status: "added" });
  } catch (error) {
    console.error("[BOOKMARKS_POST]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const { postId } = params;
    
    // Check if the current user has bookmarked this post
    const bookmark = await prisma.bookmark.findFirst({
      where: {
        postId,
        userId: currentUser.id,
      },
    });
    
    return NextResponse.json({
      isBookmarked: !!bookmark,
    });
  } catch (error) {
    console.error("[BOOKMARKS_GET]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
} 