import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateFeatureRequestSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  status: z.enum(["pending", "accepted", "rejected", "completed"]).optional(),
});

// GET /api/features/:id - Get a specific feature request
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const _params = await params;
    const { id } = _params;

    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        _count: {
          select: {
            votes: {
              where: { value: 1 },
            },
            comments: true,
          },
        },
      },
    });

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 });
    }

    // Calculate vote scores
    const upvotes = await prisma.featureVote.count({
      where: { featureRequestId: id, value: 1 },
    });
    
    const downvotes = await prisma.featureVote.count({
      where: { featureRequestId: id, value: -1 },
    });
    
    const voteScore = upvotes - downvotes;

    return NextResponse.json({
      ...featureRequest,
      voteScore,
      upvotes,
      downvotes,
    });
  } catch (error) {
    console.error("Error fetching feature request:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature request" },
      { status: 500 }
    );
  }
}

// PATCH /api/features/:id - Update a feature request
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { id } = _params;
    const body = await req.json();
    const validated = updateFeatureRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    const { title, description, status } = validated.data;

    // Check if the feature request exists
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 });
    }

    // Check if user is the author or admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const isAdmin = user?.role === "admin";
    const isAuthor = featureRequest.authorId === session.user.id;

    // Only the author can update title and description
    // Only admins can update status
    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent non-admins from updating status
    if (status && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can update status" },
        { status: 403 }
      );
    }

    // Prevent updating fields that the user doesn't have permission for
    const updateData: any = {};
    if ((title || description) && isAuthor) {
      if (title) updateData.title = title;
      if (description) updateData.description = description;
    }
    
    if (status && isAdmin) {
      updateData.status = status;
    }

    // If there's nothing to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update the feature request
    const updatedFeatureRequest = await prisma.featureRequest.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(updatedFeatureRequest);
  } catch (error) {
    console.error("Error updating feature request:", error);
    return NextResponse.json(
      { error: "Failed to update feature request" },
      { status: 500 }
    );
  }
}

// DELETE /api/features/:id - Delete a feature request
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const _params = await params;
    const { id } = _params;

    // Check if the feature request exists
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!featureRequest) {
      return NextResponse.json({ error: "Feature request not found" }, { status: 404 });
    }

    // Check if user is the author or admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    const isAdmin = user?.role === "ADMIN";
    const isAuthor = featureRequest.authorId === session.user.id;

    // Only the author or admins can delete
    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the feature request
    await prisma.featureRequest.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting feature request:", error);
    return NextResponse.json(
      { error: "Failed to delete feature request" },
      { status: 500 }
    );
  }
} 