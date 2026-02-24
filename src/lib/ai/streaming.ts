import { createAssistant, type AIContext, type AIMessage } from './assistant';

/**
 * Create a streaming SSE response from the AgentAssistant.
 * Used in Next.js Route Handlers for streaming chat.
 */
export async function createStreamingResponse(params: {
  message: string;
  context: AIContext;
  agentSlug?: string;
  conversationHistory?: AIMessage[];
  prisma?: any;
}): Promise<ReadableStream<Uint8Array>> {
  const { message, context, agentSlug, conversationHistory, prisma } = params;
  const encoder = new TextEncoder();

  const assistant = createAssistant();
  await assistant.loadAgent(agentSlug, prisma);

  // Set tool context for data queries
  if (prisma && context.workspace?.id) {
    assistant.setToolContext(
      prisma,
      context.workspace.id,
      context.workspace.slug,
      context.user?.id
    );
  }

  return new ReadableStream({
    async start(controller) {
      try {
        // Send agent info event
        const agent = assistant.getAgent();
        if (agent) {
          const agentEvent = `data: ${JSON.stringify({
            type: 'agent',
            agent: {
              slug: agent.slug,
              name: agent.name,
              color: agent.color,
              avatar: agent.avatar,
            },
          })}\n\n`;
          controller.enqueue(encoder.encode(agentEvent));
        }

        // Stream the response
        let fullContent = '';
        const stream = assistant.streamResponse(message, context, conversationHistory);

        for await (const chunk of stream) {
          fullContent += chunk;
          const event = `data: ${JSON.stringify({
            type: 'text',
            content: chunk,
          })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }

        // Parse the full content for actions/suggestions
        const parsed = parseStreamedContent(fullContent);

        // Send completion event with metadata
        const doneEvent = `data: ${JSON.stringify({
          type: 'done',
          fullContent: parsed.cleanContent,
          action: parsed.action,
          suggestions: parsed.suggestions,
        })}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        controller.close();
      } catch (error) {
        console.error('Streaming error:', error);
        const errorEvent = `data: ${JSON.stringify({
          type: 'error',
          message: 'An error occurred while generating the response.',
        })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });
}

/**
 * Extract a balanced JSON object starting at a given position.
 */
function extractJsonObject(str: string, startIndex: number): string | null {
  if (str[startIndex] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          return str.substring(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * Parse streamed content for actions and suggestions (post-stream).
 */
function parseStreamedContent(content: string): {
  cleanContent: string;
  action?: { type: string; params: Record<string, unknown>; status: string };
  suggestions?: Array<{ id: string; type: string; title: string; description: string }>;
} {
  let cleanContent = content;
  let action: { type: string; params: Record<string, unknown>; status: string } | undefined;
  const suggestions: Array<{ id: string; type: string; title: string; description: string }> = [];

  // Parse actions - find [ACTION: type="..." params={...}]
  const actionStartRegex = /\[ACTION:\s*type="([^"]+)"\s*params=/g;
  let match;

  while ((match = actionStartRegex.exec(content)) !== null) {
    try {
      const actionType = match[1];
      const paramsStartIndex = match.index + match[0].length;
      const jsonStr = extractJsonObject(content, paramsStartIndex);

      if (jsonStr) {
        const parsedParams = JSON.parse(jsonStr);
        action = {
          type: actionType,
          params: parsedParams,
          status: 'pending',
        };

        // Find the closing bracket of the action
        const actionEndIndex = paramsStartIndex + jsonStr.length;
        const remainingContent = content.substring(actionEndIndex);
        const closingBracketMatch = remainingContent.match(/^\s*\]/);

        if (closingBracketMatch) {
          const fullActionString = content.substring(match.index, actionEndIndex + closingBracketMatch[0].length);
          cleanContent = cleanContent.replace(fullActionString, '').trim();
        }
      }
    } catch (e) {
      console.error('Failed to parse action:', e);
      // Skip malformed actions
    }
  }

  // Parse suggestions
  const suggestionRegex = /\[SUGGESTION:\s*title="([^"]+)"\s*description="([^"]+)"(?:\s*action="([^"]+)")?\]/g;

  while ((match = suggestionRegex.exec(content)) !== null) {
    suggestions.push({
      id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'quick_action',
      title: match[1],
      description: match[2],
    });
    cleanContent = cleanContent.replace(match[0], '').trim();
  }

  return { cleanContent, action, suggestions };
}

/**
 * Create SSE headers for streaming responses.
 */
export function createSSEHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
