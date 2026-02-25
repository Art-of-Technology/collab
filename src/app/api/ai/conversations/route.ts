import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// GET: List conversations for the current user in a workspace
export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const conversations = await prisma.aIConversation.findMany({
      where: {
        userId: currentUser.id,
        workspaceId,
        isArchived: false,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        agent: {
          select: {
            slug: true,
            name: true,
            color: true,
            avatar: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        agent: c.agent,
        lastMessage: c.messages[0] || null,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

// POST: Create a new conversation
export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspaceId, agentSlug, title } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Find agent
    let agentId: string | null = null;
    if (agentSlug) {
      const agent = await prisma.aIAgent.findUnique({
        where: { slug: agentSlug },
        select: { id: true },
      });
      agentId = agent?.id || null;
    }

    const conversation = await prisma.aIConversation.create({
      data: {
        userId: currentUser.id,
        workspaceId,
        agentId,
        title: title || "New conversation",
      },
      include: {
        agent: {
          select: {
            slug: true,
            name: true,
            color: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      agent: conversation.agent,
      createdAt: conversation.createdAt,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
