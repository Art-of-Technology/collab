import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const body = await req.json();
    const { message, html, type, tags, priority } = body;
    
    // Validation
    if (!message || !message.trim()) {
      return new NextResponse("Message is required", { status: 400 });
    }
    
    if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
      return new NextResponse("Invalid post type", { status: 400 });
    }
    
    if (!["normal", "high", "critical"].includes(priority)) {
      return new NextResponse("Invalid priority", { status: 400 });
    }
    
    // Create post with tags
    const post = await prisma.post.create({
      data: {
        message,
        html: html || null, // Store HTML content if provided
        type,
        priority,
        author: {
          connect: { id: user.id }
        },
        tags: {
          connectOrCreate: tags.map((tag: string) => ({
            where: { name: tag },
            create: { name: tag }
          }))
        }
      },
      include: {
        author: true,
        tags: true
      }
    });
    
    return NextResponse.json(post);
    
  } catch (error) {
    console.error("Post creation error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Define interface for query parameters
interface PostQueryFilters {
  type?: string;
  authorId?: string;
  tags?: {
    some: {
      name: string;
    }
  };
}

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const tag = searchParams.get("tag");
    const authorId = searchParams.get("authorId");
    const limit = Number(searchParams.get("limit") || "20");
    
    // Build the query
    const query: PostQueryFilters = {};
    
    // Filter by type if provided
    if (type && ["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
      query.type = type;
    }
    
    // Filter by author if provided
    if (authorId) {
      query.authorId = authorId;
    }
    
    // Filter by tag if provided
    const tagFilter = tag 
      ? {
          tags: {
            some: {
              name: tag,
            },
          },
        } 
      : {};
    
    // Get the posts
    const posts = await prisma.post.findMany({
      where: {
        ...query,
        ...tagFilter,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
            team: true,
          },
        },
        tags: true,
        comments: {
          select: {
            id: true,
          },
        },
        reactions: {
          select: {
            id: true,
            type: true,
            authorId: true,
          },
        },
      },
      take: limit,
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Get posts error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
} 