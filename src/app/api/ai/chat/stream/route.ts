import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createStreamingResponse, createSSEHeaders, buildEnrichedContext } from "@/lib/ai";
import type { AIContext, AIMessage } from "@/lib/ai";

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

    // Verify workspace access
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

    // Build enriched context
    const enrichedContext = await buildEnrichedContext(
      context,
      agentSlug || "alex",
      prisma
    );

    // Save user message to conversation
    let convoId = conversationId;
    try {
      if (!convoId) {
        const agentRecord = agentSlug
          ? await prisma.aIAgent.findUnique({ where: { slug: agentSlug }, select: { id: true } })
          : null;

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

      await prisma.aIMessage.create({
        data: {
          conversationId: convoId,
          userId: currentUser.id,
          role: "user",
          content: message,
        },
      });
    } catch {
      // DB tables may not exist yet
    }

    // Create streaming response
    const stream = await createStreamingResponse({
      message,
      context: enrichedContext,
      agentSlug,
      conversationHistory: history,
      prisma,
    });

    // Wrap the stream to save the assistant response when done
    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            controller.enqueue(value);

            // Track content for persistence
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "text") {
                    fullContent += data.content;
                  }
                } catch {
                  // Skip malformed JSON
                }
              }
            }
          }

          // Send conversation ID event before closing
          const encoder = new TextEncoder();
          const convoEvent = `data: ${JSON.stringify({
            type: "conversation",
            conversationId: convoId,
          })}\n\n`;
          controller.enqueue(encoder.encode(convoEvent));

          // Save assistant message
          if (convoId && fullContent) {
            try {
              const agentRecord = agentSlug
                ? await prisma.aIAgent.findUnique({ where: { slug: agentSlug }, select: { id: true } })
                : null;

              await prisma.aIMessage.create({
                data: {
                  conversationId: convoId,
                  agentId: agentRecord?.id || null,
                  role: "assistant",
                  content: fullContent,
                },
              });
            } catch {
              // Continue without persistence
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(wrappedStream, {
      headers: createSSEHeaders(),
    });
  } catch (error) {
    console.error("Error in streaming chat API:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
