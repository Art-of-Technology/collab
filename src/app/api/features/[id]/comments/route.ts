import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const commentSchema = z.object({
  content: z.string().min(1).max(500),
});

// GET /api/features/:id/comments - Get comments for a feature request
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    // Check if feature request exists
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
    });

    if (!featureRequest) {
      return NextResponse.json(
        { error: "Feature request not found" },
        { status: 404 }
      );
    }

    // Get comments with pagination
    const comments = await prisma.featureRequestComment.findMany({
      where: { featureRequestId: id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    const totalComments = await prisma.featureRequestComment.count({
      where: { featureRequestId: id },
    });

    return NextResponse.json({
      comments,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
      },
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/features/:id/comments - Create a comment on a feature request
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const validated = commentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid comment content" },
        { status: 400 }
      );
    }

    const { content } = validated.data;

    // Check if feature request exists
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
    });

    if (!featureRequest) {
      return NextResponse.json(
        { error: "Feature request not found" },
        { status: 404 }
      );
    }

    // Create the comment
    const comment = await prisma.featureRequestComment.create({
      data: {
        content,
        featureRequestId: id,
        userId: session.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
} 