'use server';

import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Get all feature requests with pagination, filtering and sorting
export async function getFeatureRequests({
  page = 1,
  limit = 10,
  status = 'all',
  orderBy = 'most_votes',
  projectId,
  workspaceId
}: {
  page?: number;
  limit?: number;
  status?: string;
  orderBy?: string;
  projectId?: string;
  workspaceId?: string;
}) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    // Build where clause for filtering
    const where: any = {};
    if (status && status !== 'all') {
      // Handle mixed case status values in legacy data
      where.status = {
        in: [status.toLowerCase(), status.toUpperCase(), status]
      };
    }
    
    // Filter by project if provided
    if (projectId) {
      where.projectId = projectId;
    }
    
    // Filter by workspace if provided (for workspace-level view)
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    // First, fetch ALL matching feature requests
    const allFeatures = await prisma.featureRequest.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
          },
        },
        votes: {
          select: {
            userId: true,
            value: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });

    // Process features to include vote scores
    const featuresWithScores = allFeatures.map((feature) => {
      const upvotes = feature.votes.filter(vote => vote.value === 1).length;
      const downvotes = feature.votes.filter(vote => vote.value === -1).length;
      const voteScore = upvotes - downvotes;

      // Get user's vote if any
      const userVote = feature.votes.find(vote => vote.userId === session.user.id)?.value || null;

      // Create a clean object without the votes array
      const { ...rest } = feature;

      return {
        ...rest,
        createdAt: feature.createdAt.toISOString(),
        updatedAt: feature.updatedAt.toISOString(),
        voteScore,
        upvotes,
        downvotes,
        userVote,
      };
    });

    // Count total for pagination
    const totalCount = featuresWithScores.length;
    const totalPages = Math.ceil(totalCount / limit);

    // Sort ALL features by the requested criteria, but always put completed items at the end
    const sortedFeatures = [...featuresWithScores];

    // Helper function to check if a feature is completed
    const isCompleted = (feature: any) => {
      return feature.status === 'COMPLETED' || feature.status === 'completed';
    };

    switch (orderBy) {
      case 'latest':
        sortedFeatures.sort((a, b) => {
          // First, sort by completion status (non-completed first)
          const aCompleted = isCompleted(a);
          const bCompleted = isCompleted(b);

          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed items go to the end
          }

          // Then sort by date
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
      case 'oldest':
        sortedFeatures.sort((a, b) => {
          // First, sort by completion status (non-completed first)
          const aCompleted = isCompleted(a);
          const bCompleted = isCompleted(b);

          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed items go to the end
          }

          // Then sort by date
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        break;
      case 'most_votes':
        sortedFeatures.sort((a, b) => {
          // First, sort by completion status (non-completed first)
          const aCompleted = isCompleted(a);
          const bCompleted = isCompleted(b);

          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed items go to the end
          }

          // Then sort by vote score
          if (b.voteScore !== a.voteScore) {
            return b.voteScore - a.voteScore;
          }
          // If vote scores are the same, sort by date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
      case 'least_votes':
        sortedFeatures.sort((a, b) => {
          // First, sort by completion status (non-completed first)
          const aCompleted = isCompleted(a);
          const bCompleted = isCompleted(b);

          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed items go to the end
          }

          // Then sort by vote score
          if (a.voteScore !== b.voteScore) {
            return a.voteScore - b.voteScore;
          }
          // If vote scores are the same, sort by date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
      default:
        // Default to latest
        sortedFeatures.sort((a, b) => {
          // First, sort by completion status (non-completed first)
          const aCompleted = isCompleted(a);
          const bCompleted = isCompleted(b);

          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1; // Completed items go to the end
          }

          // Then sort by date
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    // AFTER sorting, apply pagination
    const skip = (page - 1) * limit;
    const paginatedFeatures = sortedFeatures.slice(skip, skip + limit);

    return {
      featureRequests: paginatedFeatures,
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
export async function getFeatureRequestById(id: string, workspaceId?: string) {
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
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            color: true,
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

    // Check user permissions
    let isAdmin = false;
    if (workspaceId) {
      const { checkUserPermission } = await import('@/lib/permissions');
      const hasPermission = await checkUserPermission(
        session.user.id,
        workspaceId,
        'EDIT_FEATURE_REQUEST' as any
      );
      isAdmin = hasPermission.hasPermission;
    } else {
      // Fallback to system admin check if no workspace context
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      isAdmin = user?.role === 'SYSTEM_ADMIN';
    }

    // Format the feature request data
    const formattedFeatureRequest = {
      ...featureRequest,
      createdAt: featureRequest.createdAt.toISOString(),
      updatedAt: featureRequest.updatedAt.toISOString(),
      voteScore: featureRequest._count.votes - downvotesCount,
      upvotes: featureRequest._count.votes,
      downvotes: downvotesCount,
      userVote,
      isAdmin,
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
    // Get markdown HTML version if available
    const html = formData.get("html") as string || description;
    const projectId = formData.get("projectId") as string | null;
    const workspaceId = formData.get("workspaceId") as string | null;

    if (!title || !description) {
      throw new Error("Title and description are required");
    }

    // Build the data object
    const data: any = {
      title,
      description,
      html, // Store HTML version for markdown rendering
      status: "PENDING",
      author: {
        connect: { id: session.user.id }
      }
    };

    // Connect to project if provided
    if (projectId) {
      data.project = { connect: { id: projectId } };
    }

    // Connect to workspace if provided
    if (workspaceId) {
      data.workspace = { connect: { id: workspaceId } };
    }

    const featureRequest = await prisma.featureRequest.create({
      data,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Revalidate paths
    if (projectId) {
      revalidatePath(`/features`);
    }
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

    // Check if user is admin or has permission
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (user?.role !== 'SYSTEM_ADMIN') {
      throw new Error("Unauthorized: Only system admins can update feature status");
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