import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getDefaultAgent } from '@/lib/ai/agents/registry';
import { getMcpToken, invalidateMcpToken } from '@/lib/ai/mcp-token';
import { createMcpSession, McpClientSession, ClaudeTool } from '@/lib/ai/mcp-client';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';
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



    // Create the streaming response with client-side MCP handling
    const stream = createAnthropicStreamWithMcp(
      systemPrompt,
      messages,
      mcpToken,
      webSearchEnabled || false,
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
): Array<{ role: 'user' | 'assistant'; content: string | any[] }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string | any[] }> = [];

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
 * Create a ReadableStream that connects to Anthropic's API
 * with client-side MCP handling (tools are called directly by us).
 */
function createAnthropicStreamWithMcp(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string | any[] }>,
  mcpToken: string,
  webSearchEnabled: boolean,
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
      let mcpSession: McpClientSession | null = null;
      let mcpTools: ClaudeTool[] = [];
      let mcpFallback = false;

      try {
        // Send agent info first
        sendEvent(controller, {
          type: 'agent',
          agent: { slug: agent.slug, name: agent.name, color: agent.color },
        });

        // Initialize MCP session and get tools
        try {
          mcpSession = await createMcpSession(mcpToken);
          mcpTools = mcpSession.convertToolsToClaudeFormat();

        } catch (mcpError) {
          console.error('[stream] Failed to initialize MCP session:', mcpError);

          // Try refreshing token and retry once
          if (refreshMcpToken) {
            try {

              const freshToken = await refreshMcpToken();
              mcpSession = await createMcpSession(freshToken);
              mcpTools = mcpSession.convertToolsToClaudeFormat();

            } catch (retryError) {
              console.error('[stream] MCP retry failed:', retryError);
              mcpFallback = true;
            }
          } else {
            mcpFallback = true;
          }
        }

        if (mcpFallback) {
          sendEvent(controller, {
            type: 'text',
            content:
              '*Workspace tools are temporarily unavailable. I can still help with general questions.*\n\n',
          });
        }

        // Build tools array for Claude (native format)
        const tools: any[] = [...mcpTools];

        // Add web search if enabled
        if (webSearchEnabled) {
          tools.push({
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 5,
          });
        }

        // Call Anthropic with streaming
        let fullTextContent = '';
        let allMessages = [...messages];
        let continueLoop = true;

        // Loop to handle tool calls and continuation
        while (continueLoop) {
          continueLoop = false;

          const requestBody: Record<string, unknown> = {
            model: ANTHROPIC_MODEL,
            max_tokens: 8192,
            system: systemPrompt,
            messages: allMessages,
            stream: true,
            ...(tools.length > 0 ? { tools } : {}),
          };

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          };

          // Only add beta header if we have web search (server-side tool)
          if (webSearchEnabled) {
            headers['anthropic-beta'] = 'web-search-2025-03-05';
          }

          const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic API error:', response.status, errorText);

            let detail = `AI service error (${response.status}).`;
            try {
              const parsed = JSON.parse(errorText);
              detail = `AI error: ${parsed?.error?.message || errorText.slice(0, 200)}`;
            } catch {
              /* not JSON */
            }
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
          const currentContentBlocks: Map<number, any> = new Map();
          let stopReason: string | null = null;
          const assistantContentBlocks: any[] = [];
          const pendingToolCalls: Array<{ id: string; name: string; input: any }> = [];

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
                    // Web search query (server-side)
                    sendEvent(controller, {
                      type: 'tool_start',
                      toolType: 'web_search',
                      toolName: block.name || 'web_search',
                      toolUseId: block.id,
                    });
                  } else if (block.type === 'tool_use') {
                    // Native tool call — this is our MCP tool
                    sendEvent(controller, {
                      type: 'tool_start',
                      toolType: 'mcp',
                      toolName: block.name,
                      serverName: 'collab',
                      toolUseId: block.id,
                    });
                  } else if (block.type === 'web_search_tool_result') {
                    // Web search results (server-side)
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
                  }
                  break;
                }

                case 'content_block_delta': {
                  const delta = event.delta;
                  if (delta.type === 'text_delta' && delta.text) {
                    fullTextContent += delta.text;
                    // Also accumulate into block for assistant message continuations
                    const block = currentContentBlocks.get(event.index);
                    if (block) {
                      block.text = (block.text || '') + delta.text;
                    }
                    sendEvent(controller, {
                      type: 'text',
                      content: delta.text,
                    });
                  } else if (delta.type === 'input_json_delta') {
                    // Tool input being streamed
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
                    if (block.type === 'tool_use') {
                      // Parse accumulated input JSON, default to {} for no-arg tools
                      try {
                        block.input = block._inputJson
                          ? JSON.parse(block._inputJson)
                          : block.input || {};
                        sendEvent(controller, {
                          type: 'tool_input',
                          toolUseId: block.id,
                          input: block.input,
                        });

                        // Queue tool call for execution
                        pendingToolCalls.push({
                          id: block.id,
                          name: block.name,
                          input: block.input,
                        });
                      } catch {
                        // Malformed input JSON — still queue with empty input
                        pendingToolCalls.push({
                          id: block.id,
                          name: block.name,
                          input: {},
                        });
                      }
                    } else if (block.type === 'server_tool_use' && block._inputJson) {
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

                    // Store for potential continuation
                    const { _inputJson, ...cleanBlock } = block;
                    assistantContentBlocks.push(cleanBlock);
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

          // Handle tool calls — execute them and continue conversation

          if (stopReason === 'tool_use' && pendingToolCalls.length > 0 && mcpSession) {
            continueLoop = true;

            // Build assistant message — strip streaming metadata (index, _inputJson, etc.)
            const assistantContent = assistantContentBlocks.map((block) => {
              if (block.type === 'tool_use') {
                return {
                  type: 'tool_use' as const,
                  id: block.id,
                  name: block.name,
                  input: block.input || {},
                };
              }
              if (block.type === 'text') {
                return {
                  type: 'text' as const,
                  text: block.text || '',
                };
              }
              // server_tool_use, web_search_tool_result, etc.
              const { index, _inputJson, ...clean } = block;
              return clean;
            })
              // Anthropic rejects empty text blocks
              .filter((block: any) => !(block.type === 'text' && !block.text));

            // Execute tool calls
            const toolResults: any[] = [];

            for (const toolCall of pendingToolCalls) {


              try {
                const result = await mcpSession.callTool(toolCall.name, toolCall.input || {});

                // Extract text content from result
                const textContent = result.content
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text)
                  .join('\n');

                sendEvent(controller, {
                  type: 'tool_result',
                  toolUseId: toolCall.id,
                  isError: result.isError,
                  content: textContent,
                });

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolCall.id,
                  is_error: result.isError,
                  content: textContent,
                });
              } catch (toolError) {
                console.error(`[stream] Tool execution error for ${toolCall.name}:`, toolError);

                const errorMessage =
                  toolError instanceof Error ? toolError.message : 'Unknown error';

                sendEvent(controller, {
                  type: 'tool_result',
                  toolUseId: toolCall.id,
                  isError: true,
                  content: `Tool error: ${errorMessage}`,
                });

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolCall.id,
                  is_error: true,
                  content: `Tool error: ${errorMessage}`,
                });
              }
            }

            // Continue conversation with tool results
            allMessages = [
              ...allMessages,
              { role: 'assistant', content: assistantContent } as any,
              { role: 'user', content: toolResults } as any,
            ];
          } else if (stopReason === 'end_turn' || stopReason === 'max_tokens') {
            // Normal completion
            continueLoop = false;
          }
        }

        // Close MCP session
        if (mcpSession) {
          await mcpSession.close();
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

        // Clean up MCP session on error
        if (mcpSession) {
          try {
            await mcpSession.close();
          } catch {
            // Ignore cleanup errors
          }
        }

        sendEvent(controller, {
          type: 'error',
          message: 'An error occurred while processing the response.',
        });
        controller.close();
      }
    },
  });
}
