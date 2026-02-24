import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createAssistant, buildAIContext, buildEnrichedContext } from "@/lib/ai";
import type { AIContext, AIMessage, AIAction, AISuggestion } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message, context, history, agentSlug, conversationId } = body as {
      message: string;
      context: AIContext;
      history?: AIMessage[];
      agentSlug?: string;
      conversationId?: string;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!context?.workspace?.id) {
      return NextResponse.json({ error: "Workspace context is required" }, { status: 400 });
    }

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: context.workspace.id,
        members: { some: { userId: currentUser.id } },
      },
      select: { id: true, name: true, slug: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found or access denied" }, { status: 403 });
    }

    // Create assistant with agent
    const assistant = createAssistant();
    const agent = await assistant.loadAgent(agentSlug, prisma);

    // Build enriched context for the specific agent
    const enrichedContext = await buildEnrichedContext(context, agent.slug, prisma);

    // Get or create conversation
    let convoId = conversationId;
    try {
      if (!convoId) {
        // Find agent DB record for relation
        const agentRecord = await prisma.aIAgent.findUnique({
          where: { slug: agent.slug },
          select: { id: true },
        });

        const conversation = await prisma.aIConversation.create({
          data: {
            userId: currentUser.id,
            workspaceId: workspace.id,
            agentId: agentRecord?.id || null,
            title: message.substring(0, 100),
          },
        });
        convoId = conversation.id;
      }

      // Save user message
      await prisma.aIMessage.create({
        data: {
          conversationId: convoId,
          userId: currentUser.id,
          role: "user",
          content: message,
        },
      });
    } catch {
      // DB tables may not exist yet - continue without persistence
    }

    // Generate response
    const response = await assistant.chat(message, enrichedContext, {
      agentSlug: agent.slug,
      conversationHistory: history,
      prisma,
    });

    // Save assistant response
    try {
      if (convoId) {
        const agentRecord = await prisma.aIAgent.findUnique({
          where: { slug: agent.slug },
          select: { id: true },
        });

        await prisma.aIMessage.create({
          data: {
            conversationId: convoId,
            agentId: agentRecord?.id || null,
            role: "assistant",
            content: response.content,
            metadata: response.metadata ? JSON.parse(JSON.stringify(response.metadata)) : null,
          },
        });
      }
    } catch {
      // Continue without persistence
    }

    // Process action if present
    let actionResult: any = null;
    if (response.metadata?.action) {
      actionResult = await processAction(response.metadata.action, context, currentUser.id);
    }

    return NextResponse.json({
      content: response.content,
      agentSlug: agent.slug,
      agentName: agent.name,
      agentColor: agent.color,
      conversationId: convoId,
      action: actionResult
        ? { ...response.metadata?.action, ...actionResult }
        : response.metadata?.action,
      suggestions: response.metadata?.suggestions || [],
    });
  } catch (error) {
    console.error("Error in AI chat API:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// Process action and return result
async function processAction(
  action: AIAction,
  context: AIContext,
  userId: string
): Promise<{ status: string; result?: any; navigateTo?: string }> {
  try {
    switch (action.type) {
      case "navigate": {
        const params = action.params as any;
        const workspaceBase = `/${context.workspace.slug || context.workspace.id}`;

        let navigateTo: string;
        if (params.issueKey) {
          navigateTo = `${workspaceBase}/issues/${params.issueKey}`;
        } else if (params.projectSlug) {
          navigateTo = `${workspaceBase}/projects/${params.projectSlug}`;
        } else if (params.path) {
          navigateTo = `${workspaceBase}/${params.path}`;
        } else {
          navigateTo = `${workspaceBase}/dashboard`;
        }

        return { status: "completed", navigateTo };
      }

      case "search": {
        const params = action.params as any;
        const where: any = { workspaceId: context.workspace.id };

        if (params.query) {
          where.OR = [
            { title: { contains: params.query, mode: "insensitive" } },
            { description: { contains: params.query, mode: "insensitive" } },
          ];
        }
        if (params.status) where.status = params.status;
        if (params.priority) where.priority = params.priority;

        const issues = await prisma.issue.findMany({
          where,
          take: 10,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            issueKey: true,
            status: true,
            priority: true,
          },
        });

        return { status: "completed", result: { issues, count: issues.length } };
      }

      case "create_issue": {
        const params = action.params as any;
        if (!params.title) {
          return { status: "failed", result: { error: "Title is required" } };
        }
        return {
          status: "pending",
          result: {
            message: "Issue creation prepared. Please confirm to create.",
            params,
          },
        };
      }

      default:
        return { status: "pending" };
    }
  } catch (error) {
    console.error("Error processing action:", error);
    return { status: "failed", result: { error: "Action failed" } };
  }
}
