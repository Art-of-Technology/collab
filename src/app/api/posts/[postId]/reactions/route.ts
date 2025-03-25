import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Reaction } from "@prisma/client";

export async function POST(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const postId = (await params)?.postId;
    const { type } = await req.json();

    // Only allow specific reaction types
    if (!["LIKE", "BOOKMARK"].includes(type)) {
      return new NextResponse("Invalid reaction type", { status: 400 });
    }

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return new NextResponse("Post not found", { status: 404 });
    }

    // Check if the user already has this reaction
    const existingReaction = await prisma.reaction.findFirst({
      where: {
        postId,
        authorId: user.id,
        type,
      },
    });

    // If reaction exists, remove it (toggle off)
    if (existingReaction) {
      await prisma.reaction.delete({
        where: { id: existingReaction.id },
      });

      return NextResponse.json({
        status: "removed",
        message: `${type.toLowerCase()} removed`
      });
    }

    // Otherwise, create the reaction (toggle on)
    await prisma.reaction.create({
      data: {
        type,
        postId,
        authorId: user.id,
      },
    });

    return NextResponse.json({
      status: "added",
      message: `${type.toLowerCase()} added`
    });

  } catch (error) {
    console.error("Reaction error:", error);
    return new NextResponse("Internal error", { status: 500 });
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

    const postId = (await params)?.postId;

    const reactions = await prisma.reaction.findMany({
      where: {
        postId,
      },
      include: {
        author: true,
      },
    });

    // Check if the current user has reacted to this post
    const hasReacted = reactions.some((reaction: Reaction) => reaction.authorId === currentUser.id);

    return NextResponse.json({
      reactions,
      hasReacted,
    });
  } catch (error) {
    console.error("[REACTIONS_GET]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
} 