'use server';

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Get all feature requests with pagination, filtering and sorting
export async function getFeatureRequests({ 
  page = 1, 
  limit = 10, 
  status = 'all', 
  orderBy = 'most_votes' 
}: { 
  page?: number; 
  limit?: number; 
  status?: string; 
  orderBy?: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    // Build orderBy clause for sorting
    let orderByClause: any = {};
    switch (orderBy) {
      case 'latest':
        orderByClause = { createdAt: 'desc' };
        break;
      case 'oldest':
        orderByClause = { createdAt: 'asc' };
        break;
      case 'most_votes':
        // We'll sort after fetching since it requires aggregation
        orderByClause = { createdAt: 'desc' }; // Default sort
        break;
      case 'least_votes':
        // We'll sort after fetching since it requires aggregation
        orderByClause = { createdAt: 'desc' }; // Default sort
        break;
      default:
        orderByClause = { createdAt: 'desc' };
    }

    // Count total matching records for pagination
    const totalCount = await prisma.featureRequest.count({ where });
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch feature requests
    const features = await prisma.featureRequest.findMany({
      where,
      orderBy: orderByClause,
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
        votes: {
          where: {
            userId: session.user.id,
          },
          select: {
            value: true,
          },
        },
        _count: {
          select: {
            votes: {
              where: {
                value: 1,
              },
            },
            comments: true,
          },
        },
      },
    });

    // Process features to include vote scores
    const featuresWithScores = await Promise.all(
      features.map(async (feature) => {
        const downvotesCount = await prisma.featureVote.count({
          where: {
            featureRequestId: feature.id,
            value: -1,
          },
        });

        return {
          ...feature,
          createdAt: feature.createdAt.toISOString(),
          updatedAt: feature.updatedAt.toISOString(),
          voteScore: feature._count.votes - downvotesCount,
          upvotes: feature._count.votes,
          downvotes: downvotesCount,
          userVote: feature.votes.length > 0 ? feature.votes[0].value : null,
        };
      })
    );

    // Sort by votes if needed
    const sortedFeatures = [...featuresWithScores];
    if (orderBy === 'most_votes') {
      sortedFeatures.sort((a, b) => b.voteScore - a.voteScore);
    } else if (orderBy === 'least_votes') {
      sortedFeatures.sort((a, b) => a.voteScore - b.voteScore);
    }

    return {
      featureRequests: sortedFeatures,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount,
      }
    };
  } catch (error) {
    console.error("Error fetching feature requests:", error);
    throw new Error("Failed to fetch feature requests");
  }
}

// Get a single feature request by ID
export async function getFeatureRequestById(id: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

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
        votes: {
          where: {
            userId: session.user.id,
          },
          select: {
            value: true,
          },
        },
        _count: {
          select: {
            votes: {
              where: {
                value: 1,
              },
            },
            comments: true,
          },
        },
      },
    });

    if (!featureRequest) {
      return null;
    }

    // Count downvotes separately
    const downvotesCount = await prisma.featureVote.count({
      where: {
        featureRequestId: id,
        value: -1,
      },
    });

    // Get user's vote if any
    const userVote = featureRequest.votes.length > 0 ? featureRequest.votes[0].value : null;

    // Get comments
    const comments = await prisma.featureRequestComment.findMany({
      where: { featureRequestId: id },
      orderBy: { createdAt: "desc" },
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

    // Format comments
    const formattedComments = comments.map(comment => ({
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    }));

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    // Format the feature request data
    const formattedFeatureRequest = {
      ...featureRequest,
      createdAt: featureRequest.createdAt.toISOString(),
      updatedAt: featureRequest.updatedAt.toISOString(),
      voteScore: featureRequest._count.votes - downvotesCount,
      upvotes: featureRequest._count.votes,
      downvotes: downvotesCount,
      userVote,
      isAdmin: user?.role === "admin",
      comments: formattedComments
    };

    return formattedFeatureRequest;
  } catch (error) {
    console.error("Error fetching feature request:", error);
    throw new Error("Failed to fetch feature request");
  }
}

// Create a new feature request
export async function createFeatureRequest(formData: FormData) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    if (!title || !description) {
      throw new Error("Title and description are required");
    }

    const featureRequest = await prisma.featureRequest.create({
      data: {
        title,
        description,
        status: "PENDING",
        author: {
          connect: { id: session.user.id }
        }
      },
    });

    revalidatePath("/features");
    return featureRequest;
  } catch (error) {
    console.error("Error creating feature request:", error);
    throw new Error("Failed to create feature request");
  }
}

// Vote on a feature request
export async function voteOnFeature({
  featureRequestId,
  value,
}: {
  featureRequestId: string;
  value: 1 | -1;
}) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    // Check if the user has already voted on this feature
    const existingVote = await prisma.featureVote.findFirst({
      where: {
        featureRequestId,
        userId: session.user.id,
      },
    });

    if (existingVote) {
      // If the vote value is the same, remove the vote (toggle)
      if (existingVote.value === value) {
        await prisma.featureVote.delete({
          where: {
            id: existingVote.id,
          },
        });
      } else {
        // Otherwise, update the vote value
        await prisma.featureVote.update({
          where: {
            id: existingVote.id,
          },
          data: {
            value,
          },
        });
      }
    } else {
      // Create a new vote
      await prisma.featureVote.create({
        data: {
          featureRequestId,
          userId: session.user.id,
          value,
        },
      });
    }

    revalidatePath(`/features/${featureRequestId}`);
    revalidatePath("/features");
    return { success: true };
  } catch (error) {
    console.error("Error voting on feature:", error);
    throw new Error("Failed to vote on feature");
  }
}

// Add a comment to a feature request
export async function addFeatureComment({
  featureRequestId,
  content,
}: {
  featureRequestId: string;
  content: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    // Check if the feature request exists
    const featureRequest = await prisma.featureRequest.findUnique({
      where: { id: featureRequestId },
    });

    if (!featureRequest) {
      throw new Error("Feature request not found");
    }

    // Create the comment using the correct schema
    const comment = await prisma.featureRequestComment.create({
      data: {
        content,
        author: {
          connect: { id: session.user.id }
        },
        featureRequest: {
          connect: { id: featureRequestId }
        }
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

    revalidatePath(`/features/${featureRequestId}`);
    return {
      ...comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("Error adding comment:", error);
    throw new Error("Failed to add comment");
  }
}

// Update feature request status (admin only)
export async function updateFeatureStatus({
  featureRequestId,
  status,
}: {
  featureRequestId: string;
  status: "PENDING" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "DECLINED";
}) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== "admin") {
      throw new Error("Unauthorized: Only admins can update feature status");
    }

    await prisma.featureRequest.update({
      where: { id: featureRequestId },
      data: { status },
    });

    revalidatePath(`/features/${featureRequestId}`);
    revalidatePath("/features");
    return { success: true };
  } catch (error) {
    console.error("Error updating feature status:", error);
    throw new Error("Failed to update feature status");
  }
} 