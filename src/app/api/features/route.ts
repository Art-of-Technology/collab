import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Validation schemas
const featureRequestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  html: z.string().optional(),
});

const getFeatureRequestsParamsSchema = z.object({
  status: z.string().nullable().optional(),
  orderBy: z.enum(["latest", "oldest", "most_votes", "least_votes"]).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

// GET handler for fetching feature requests
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const orderBy = url.searchParams.get("orderBy");
    const pageParam = url.searchParams.get("page");
    const limitParam = url.searchParams.get("limit");

    const validated = getFeatureRequestsParamsSchema.safeParse({
      status,
      orderBy,
      page: pageParam ? parseInt(pageParam) : 1,
      limit: limitParam ? parseInt(limitParam) : 10,
    });

    if (!validated.success) {
      console.error("Validation error:", validated.error);
      return NextResponse.json({ 
        error: "Invalid parameters", 
        details: validated.error.format() 
      }, { status: 400 });
    }

    const { status: validatedStatus, orderBy: validatedOrderBy, page = 1, limit = 10 } = validated.data;
    
    // Build the filter
    const where = validatedStatus && validatedStatus !== "all"
      ? { status: validatedStatus }
      : {};

    // Build the sort order for database queries
    let orderByClause: any = { createdAt: "desc" };
    if (validatedOrderBy === "oldest") {
      orderByClause = { createdAt: "asc" };
    }
    
    // For vote-based sorting, we need to fetch all matching records first
    // then sort them by votes, and then apply pagination
    if (validatedOrderBy === "most_votes" || validatedOrderBy === "least_votes") {
      // Count total matching records for pagination info
      const totalCount = await prisma.featureRequest.count({ where });
      
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
      
      // Calculate vote score for each request
      const formattedFeatureRequests = await Promise.all(
        allFeatureRequests.map(async (request: any) => {
          // Get upvotes and downvotes
          const upvotes = await prisma.featureVote.count({
            where: { featureRequestId: request.id, value: 1 },
          });
          
          const downvotes = await prisma.featureVote.count({
            where: { featureRequestId: request.id, value: -1 },
          });
          
          const voteScore = upvotes - downvotes;
          
          return {
            ...request,
            voteScore,
            upvotes,
            downvotes,
          };
        })
      );
      
      // Sort by votes
      if (validatedOrderBy === "most_votes") {
        formattedFeatureRequests.sort((a: any, b: any) => {
          // First sort by vote score
          if (b.voteScore !== a.voteScore) {
            return b.voteScore - a.voteScore;
          }
          // If vote scores are the same, sort by date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      } else {
        formattedFeatureRequests.sort((a: any, b: any) => {
          // First sort by vote score
          if (a.voteScore !== b.voteScore) {
            return a.voteScore - b.voteScore;
          }
          // If vote scores are the same, sort by date (newest first)
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      }
      
      // Apply pagination after sorting
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
    } 
    // For date-based sorting, we can use the database's built-in pagination
    else {
      const skip = (page - 1) * limit;
      const totalCount = await prisma.featureRequest.count({ where });
      
      const featureRequests = await prisma.featureRequest.findMany({
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
      
      // Calculate vote score and format response
      const formattedFeatureRequests = await Promise.all(
        featureRequests.map(async (request: any) => {
          // Get upvotes and downvotes
          const upvotes = await prisma.featureVote.count({
            where: { featureRequestId: request.id, value: 1 },
          });
          
          const downvotes = await prisma.featureVote.count({
            where: { featureRequestId: request.id, value: -1 },
          });
          
          const voteScore = upvotes - downvotes;
          
          return {
            ...request,
            voteScore,
            upvotes,
            downvotes,
          };
        })
      );
      
      return NextResponse.json({
        featureRequests: formattedFeatureRequests,
        pagination: {
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
        },
      });
    }
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

    const { title, description, html } = validated.data;

    const featureRequest = await prisma.featureRequest.create({
      data: {
        title,
        description,
        html: html || null,
        authorId: session.user.id,
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

    return NextResponse.json(featureRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating feature request:", error);
    return NextResponse.json(
      { error: "Error creating feature request", details: String(error) },
      { status: 500 }
    );
  }
} 