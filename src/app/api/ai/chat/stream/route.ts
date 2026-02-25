import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getDefaultAgent } from '@/lib/ai/agents/registry';
import { getMcpToken, getMcpServerUrl, invalidateMcpToken } from '@/lib/ai/mcp-token';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-20250514';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ChatRequestBody {
  message: string;
  context: {
    workspace: { id: string; name: string; slug?: string };
    user?: { id: string; name: string; email: string };
    currentPage?: { type: string; id?: string; name?: string };
  };
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
  webSearchEnabled?: boolean;
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ChatRequestBody = await req.json();
    const { message, context, history, conversationId, webSearchEnabled } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!context?.workspace?.id) {
      return NextResponse.json({ error: 'Workspace context is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Workspace not found' }, { status: 403 });
    }

    // Load agent definition
    const agent = await getDefaultAgent(prisma);

    // Get MCP token for this user+workspace
    let mcpToken: string;
    try {
      mcpToken = await getMcpToken(prisma, currentUser.id, workspace.id);
    } catch (error) {
      console.error('MCP token provisioning failed:', error);
      return NextResponse.json(
        { error: 'Failed to provision MCP access. Is the MCP app configured?' },
        { status: 500 }
      );
    }

    // Token refresh callback — invalidates cached/DB tokens and provisions fresh one
    const refreshMcpToken = async (): Promise<string> => {
      await invalidateMcpToken(prisma, currentUser.id, workspace.id);
      return getMcpToken(prisma, currentUser.id, workspace.id);
    };

    // Save user message to conversation
    let convoId = conversationId;
    try {
      if (!convoId) {
        const agentRecord = await prisma.aIAgent
          .findUnique({ where: { slug: agent.slug }, select: { id: true } })
          .catch(() => null);

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
          role: 'user',
          content: message,
        },
      });
    } catch {
      // DB tables may not exist yet — continue without persistence
    }

    // Build conversation messages for Anthropic
    const messages = buildAnthropicMessages(message, history);

    // Build system prompt with context
    const systemPrompt = buildSystemPrompt(agent.systemPrompt, {
      userName: currentUser.name || currentUser.email || 'User',
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug || '',
      currentPage: context.currentPage,
    });

    // Build tools array
    const tools: any[] = [
      {
        type: 'mcp_toolset',
        mcp_server_name: 'collab',
        default_config: {
          defer_loading: true,
        },
      },
    ];

    // Add web search if enabled
    if (webSearchEnabled) {
      tools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      });
    }

    // Build MCP servers array (mutable — retry logic may update the token)
    const mcpServers = [
      {
        type: 'url' as const,
        url: `${getMcpServerUrl()}/api/mcp`,
        name: 'collab',
        authorization_token: mcpToken,
      },
    ];

    console.log(`[stream] MCP server: ${mcpServers[0].url}, token: ${mcpToken.slice(0, 20)}...`);

    // Create the streaming response
    const stream = createAnthropicStream(
      systemPrompt,
      messages,
      tools,
      mcpServers,
      convoId,
      agent,
      refreshMcpToken
    );

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Error in streaming chat API:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

/**
 * Build Anthropic-format messages from history + new message.
 */
function buildAnthropicMessages(
  newMessage: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history?.length) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: newMessage });
  return messages;
}

/**
 * Build the system prompt with workspace context.
 */
function buildSystemPrompt(
  basePrompt: string,
  ctx: {
    userName: string;
    workspaceName: string;
    workspaceSlug: string;
    currentPage?: { type: string; id?: string; name?: string };
  }
): string {
  let prompt = basePrompt;

  prompt += `\n\n**Current Session Context:**
- User: ${ctx.userName}
- Workspace: ${ctx.workspaceName} (slug: ${ctx.workspaceSlug})`;

  if (ctx.currentPage) {
    prompt += `\n- Current Page: ${ctx.currentPage.type}`;
    if (ctx.currentPage.name) prompt += ` — ${ctx.currentPage.name}`;
    if (ctx.currentPage.id) prompt += ` (id: ${ctx.currentPage.id})`;
  }

  return prompt;
}

/**
 * Create a ReadableStream that connects to Anthropic's streaming API
 * with MCP connector and forwards events to the client.
 */
function createAnthropicStream(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tools: any[],
  mcpServers: Array<{ type: string; url: string; name: string; authorization_token: string }>,
  conversationId: string | undefined,
  agent: { slug: string; name: string; color: string; avatar?: string },
  refreshMcpToken?: () => Promise<string>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  function sendEvent(controller: ReadableStreamDefaultController, data: Record<string, unknown>) {
    const event = `data: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(event));
  }

  return new ReadableStream({
    async start(controller) {
      try {
        // Send agent info first
        sendEvent(controller, {
          type: 'agent',
          agent: { slug: agent.slug, name: agent.name, color: agent.color },
        });

        // Call Anthropic with MCP connector + streaming
        let fullTextContent = '';
        let allMessages = [...messages];
        let continueLoop = true;
        let mcpRetried = false;

        // Loop to handle pause_turn (Anthropic may pause) and MCP token retry
        while (continueLoop) {
          continueLoop = false;

          const requestBody: Record<string, unknown> = {
            model: ANTHROPIC_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: allMessages,
            stream: true,
            tools,
            mcp_servers: mcpServers,
          };

          const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'mcp-client-2025-11-20',
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic API error:', response.status, errorText);

            // Retry ONCE on MCP-related errors (stale/invalid token)
            const isMcpError = /mcp|permission|insufficient/i.test(errorText);
            if (isMcpError && refreshMcpToken && !mcpRetried) {
              mcpRetried = true;
              console.log('[stream] MCP auth error detected — refreshing token and retrying...');
              try {
                const freshToken = await refreshMcpToken();
                mcpServers[0].authorization_token = freshToken;
                console.log(`[stream] Retrying with fresh token: ${freshToken.slice(0, 20)}...`);
                continueLoop = true;
                continue;
              } catch (refreshError) {
                console.error('[stream] Token refresh failed:', refreshError);
              }
            }

            // Send error to client
            let detail = `AI service error (${response.status}).`;
            try {
              const parsed = JSON.parse(errorText);
              detail = `AI error: ${parsed?.error?.message || errorText.slice(0, 200)}`;
            } catch { /* not JSON */ }
            sendEvent(controller, { type: 'error', message: detail });
            break;
          }

          if (!response.body) {
            sendEvent(controller, { type: 'error', message: 'No response stream.' });
            break;
          }

          // Parse the SSE stream from Anthropic
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentContentBlocks: Map<number, any> = new Map();
          let stopReason: string | null = null;
          let assistantContentBlocks: any[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]' || !jsonStr) continue;

              let event: any;
              try {
                event = JSON.parse(jsonStr);
              } catch {
                continue;
              }

              switch (event.type) {
                case 'message_start': {
                  // Message started — nothing to forward yet
                  break;
                }

                case 'content_block_start': {
                  const block = event.content_block;
                  const index = event.index;
                  currentContentBlocks.set(index, { ...block, index });

                  if (block.type === 'text') {
                    // Text block starting — will get deltas
                  } else if (block.type === 'server_tool_use') {
                    // Web search query
                    sendEvent(controller, {
                      type: 'tool_start',
                      toolType: 'web_search',
                      toolName: block.name || 'web_search',
                      toolUseId: block.id,
                    });
                  } else if (block.type === 'mcp_tool_use') {
                    // MCP tool call
                    sendEvent(controller, {
                      type: 'tool_start',
                      toolType: 'mcp',
                      toolName: block.name,
                      serverName: block.server_name,
                      toolUseId: block.id,
                    });
                  } else if (block.type === 'web_search_tool_result') {
                    // Web search results
                    const results = block.content || [];
                    sendEvent(controller, {
                      type: 'web_search_results',
                      toolUseId: block.tool_use_id,
                      results: results
                        .filter((r: any) => r.type === 'web_search_result')
                        .map((r: any) => ({
                          url: r.url,
                          title: r.title,
                          pageAge: r.page_age,
                        })),
                    });
                  } else if (block.type === 'mcp_tool_result') {
                    // MCP tool result
                    const resultContent = block.content || [];
                    const textContent = resultContent
                      .filter((c: any) => c.type === 'text')
                      .map((c: any) => c.text)
                      .join('\n');

                    sendEvent(controller, {
                      type: 'tool_result',
                      toolUseId: block.tool_use_id,
                      isError: block.is_error || false,
                      content: textContent,
                    });
                  }
                  break;
                }

                case 'content_block_delta': {
                  const delta = event.delta;
                  if (delta.type === 'text_delta' && delta.text) {
                    fullTextContent += delta.text;
                    sendEvent(controller, {
                      type: 'text',
                      content: delta.text,
                    });
                  } else if (delta.type === 'input_json_delta') {
                    // Tool input being streamed — we already sent tool_start
                    // The full input will be in the content block
                    const block = currentContentBlocks.get(event.index);
                    if (block) {
                      block._inputJson = (block._inputJson || '') + (delta.partial_json || '');
                    }
                  }
                  break;
                }

                case 'content_block_stop': {
                  const block = currentContentBlocks.get(event.index);
                  if (block) {
                    // Store for potential pause_turn re-submission
                    assistantContentBlocks.push(block);

                    // If this was a tool use, send the complete input
                    if (
                      (block.type === 'mcp_tool_use' || block.type === 'server_tool_use') &&
                      block._inputJson
                    ) {
                      try {
                        const input = JSON.parse(block._inputJson);
                        sendEvent(controller, {
                          type: 'tool_input',
                          toolUseId: block.id,
                          input,
                        });
                      } catch {
                        // Skip malformed input
                      }
                    }
                  }
                  break;
                }

                case 'message_delta': {
                  if (event.delta?.stop_reason) {
                    stopReason = event.delta.stop_reason;
                  }
                  break;
                }

                case 'message_stop': {
                  // Message complete
                  break;
                }

                case 'error': {
                  console.error('Anthropic stream error:', event.error);
                  sendEvent(controller, {
                    type: 'error',
                    message: event.error?.message || 'Stream error from AI service.',
                  });
                  break;
                }
              }
            }
          }

          // Handle pause_turn — re-submit to continue the turn
          if (stopReason === 'pause_turn') {
            continueLoop = true;
            // Build the assistant message content from collected blocks
            const assistantContent = assistantContentBlocks.map((block) => {
              // Strip our internal tracking fields
              const { _inputJson, ...cleanBlock } = block;
              return cleanBlock;
            });
            allMessages = [
              ...allMessages,
              { role: 'assistant', content: assistantContent } as any,
            ];
            // Reset for next iteration
            assistantContentBlocks = [];
          }
        }

        // Send conversation ID
        sendEvent(controller, {
          type: 'conversation',
          conversationId,
        });

        // Send completion event
        sendEvent(controller, {
          type: 'done',
          fullContent: fullTextContent,
        });

        // Persist assistant message
        if (conversationId && fullTextContent) {
          try {
            const agentRecord = await prisma.aIAgent
              .findUnique({ where: { slug: agent.slug }, select: { id: true } })
              .catch(() => null);

            await prisma.aIMessage.create({
              data: {
                conversationId,
                agentId: agentRecord?.id || null,
                role: 'assistant',
                content: fullTextContent,
              },
            });
          } catch {
            // Continue without persistence
          }
        }

        controller.close();
      } catch (error) {
        console.error('Stream processing error:', error);
        sendEvent(controller, {
          type: 'error',
          message: 'An error occurred while processing the response.',
        });
        controller.close();
      }
    },
  });
}
