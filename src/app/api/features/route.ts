import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Validation schemas
const featureRequestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  html: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
});

const getFeatureRequestsParamsSchema = z.object({
  status: z.string().nullable().optional(),
  orderBy: z.enum(["latest", "oldest", "most_votes", "least_votes"]).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  projectId: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
});

// GET handler for fetching feature requests
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const orderBy = url.searchParams.get("orderBy");
    const pageParam = url.searchParams.get("page");
    const limitParam = url.searchParams.get("limit");
    const projectId = url.searchParams.get("projectId");
    const workspaceId = url.searchParams.get("workspaceId");

    const validated = getFeatureRequestsParamsSchema.safeParse({
      status,
      orderBy,
      page: pageParam ? parseInt(pageParam) : 1,
      limit: limitParam ? parseInt(limitParam) : 10,
      projectId,
      workspaceId,
    });

    if (!validated.success) {
      console.error("Validation error:", validated.error);
      return NextResponse.json({ 
        error: "Invalid parameters", 
        details: validated.error.format() 
      }, { status: 400 });
    }

    const { 
      status: validatedStatus, 
      orderBy: validatedOrderBy, 
      page = 1, 
      limit = 10,
      projectId: validatedProjectId,
      workspaceId: validatedWorkspaceId 
    } = validated.data;
    
    // Build the filter
    const where: any = {};
    
    if (validatedStatus && validatedStatus !== "all") {
      where.status = validatedStatus;
    }
    
    // Filter by project if provided
    if (validatedProjectId) {
      where.projectId = validatedProjectId;
    }
    
    // Filter by workspace if provided
    if (validatedWorkspaceId) {
      where.workspaceId = validatedWorkspaceId;
    }

    // For ALL sorting options, we now fetch all matching records first,
    // then sort them properly, and then apply pagination
    
    // Fetch all feature requests that match the filter
    const allFeatureRequests = await prisma.featureRequest.findMany({
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
    
    // Calculate vote score for each request from included votes
    const formattedFeatureRequests = allFeatureRequests.map((request) => {
      let voteScore = 0;
      let upvotes = 0;
      let downvotes = 0;

      request.votes.forEach(vote => {
        if (vote.value === 1) {
          voteScore++;
          upvotes++;
        } else if (vote.value === -1) {
          voteScore--;
          downvotes++;
        }
      });

      const { ...rest } = request;

      return {
        ...rest,
        voteScore,
        upvotes,
        downvotes,
      };
    });
    
    // Get total count for pagination
    const totalCount = formattedFeatureRequests.length;
    // Sort the ENTIRE list based on the requested sort order
    if (validatedOrderBy === "most_votes") {
      formattedFeatureRequests.sort((a, b) => {
        if (b.voteScore !== a.voteScore) {
          return b.voteScore - a.voteScore;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } else if (validatedOrderBy === "least_votes") {
      formattedFeatureRequests.sort((a, b) => {
        if (a.voteScore !== b.voteScore) {
          return a.voteScore - b.voteScore;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } else if (validatedOrderBy === "oldest") {
      formattedFeatureRequests.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    } else {
      // Default: "latest"
      formattedFeatureRequests.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    
    // AFTER sorting the entire list, apply pagination
    const skip = (page - 1) * limit;
    const paginatedResults = formattedFeatureRequests.slice(skip, skip + limit);
    
    return NextResponse.json({
      featureRequests: paginatedResults,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching feature requests:", error);
    return NextResponse.json(
      { error: "Error fetching feature requests" },
      { status: 500 }
    );
  }
}

// POST handler for creating a new feature request
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    
    const validated = featureRequestSchema.safeParse(body);

    if (!validated.success) {
      console.error("Validation error:", validated.error);
      return NextResponse.json({ 
        error: "Invalid request body",
        details: validated.error.format()
      }, { status: 400 });
    }

    const { title, description, html, projectId, workspaceId } = validated.data;

    // Build the data object
    const data: any = {
      title,
      description,
      html: html || null,
      authorId: session.user.id,
    };

    // Add projectId if provided
    if (projectId) {
      data.projectId = projectId;
    }

    // Add workspaceId if provided
    if (workspaceId) {
      data.workspaceId = workspaceId;
    }

    const featureRequest = await prisma.featureRequest.create({
      data,
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
      },
    });

    return NextResponse.json(featureRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating feature request:", error);
    return NextResponse.json(
      { error: "Error creating feature request", details: String(error) },
      { status: 500 }
    );
  }
} 