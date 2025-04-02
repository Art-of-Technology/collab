import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const voteSchema = z.object({
  value: z.number().min(-1).max(1).int(),
});

// POST /api/features/:id/vote - Vote on a feature request
export async function POST(
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
    const validated = voteSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid vote value. Must be -1, 0, or 1" },
        { status: 400 }
      );
    }

    const { value } = validated.data;

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

    // Check if user has already voted
    const existingVote = await prisma.featureVote.findUnique({
      where: {
        userId_featureRequestId: {
          userId: session.user.id,
          featureRequestId: id,
        },
      },
    });

    if (existingVote) {
      if (value === 0) {
        // Remove vote
        await prisma.featureVote.delete({
          where: {
            userId_featureRequestId: {
              userId: session.user.id,
              featureRequestId: id,
            },
          },
        });
      } else {
        // Update vote
        await prisma.featureVote.update({
          where: {
            userId_featureRequestId: {
              userId: session.user.id,
              featureRequestId: id,
            },
          },
          data: { value },
        });
      }
    } else if (value !== 0) {
      // Create new vote
      await prisma.featureVote.create({
        data: {
          value,
          userId: session.user.id,
          featureRequestId: id,
        },
      });
    }

    // Calculate updated vote counts
    const upvotes = await prisma.featureVote.count({
      where: { featureRequestId: id, value: 1 },
    });
    
    const downvotes = await prisma.featureVote.count({
      where: { featureRequestId: id, value: -1 },
    });
    
    const voteScore = upvotes - downvotes;

    // Get updated user vote
    const vote = value === 0 ? null : await prisma.featureVote.findUnique({
      where: {
        userId_featureRequestId: {
          userId: session.user.id,
          featureRequestId: id,
        },
      },
    });

    return NextResponse.json({
      voteScore,
      upvotes,
      downvotes,
      vote,
    });
  } catch (error) {
    console.error("Error voting on feature request:", error);
    return NextResponse.json(
      { error: "Failed to vote on feature request" },
      { status: 500 }
    );
  }
} 