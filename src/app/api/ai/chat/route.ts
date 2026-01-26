/**
 * AI Chat API Route
 *
 * Handles conversational AI interactions with real database access via tools.
 * Returns structured UI components for generative UI rendering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAIOrchestrator, getAgentRegistry } from '@/lib/ai';
import { WORKSPACE_TOOLS, executeWorkspaceTool } from '@/lib/ai/tools/workspace-tools';
import type { AIModelId, AIMessage } from '@/lib/ai';

interface ChatRequest {
  message: string;
  sessionId?: string;
  workspaceId: string;
  projectId?: string;
  issueId?: string;
  agentName?: string;
  model?: AIModelId;
  systemPrompt?: string;
  context?: {
    workspaceName?: string;
    projectName?: string;
    issueName?: string;
    currentView?: string;
  };
}

// UI Component types for generative UI
interface UIComponent {
  type: 'issue_list' | 'issue_card' | 'project_list' | 'stats' | 'text';
  data: unknown;
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: ChatRequest = await req.json();
    const {
      message,
      sessionId,
      workspaceId,
      projectId,
      issueId,
      agentName,
      model,
      context,
    } = body;

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Get orchestrator and agent registry
    const orchestrator = getAIOrchestrator();
    const agentRegistry = getAgentRegistry();

    // Determine which agent to use
    let agent = agentName
      ? agentRegistry.getAgentByName(agentName)
      : agentRegistry.getBestAgentForTask(message, workspaceId);

    if (!agent) {
      agent = agentRegistry.getAgentByName('Alex');
    }

    // Build enhanced system prompt with tool awareness
    const toolSystemPrompt = `${agent?.systemPrompt || ''}

IMPORTANT: You have access to tools that let you query REAL data from the user's workspace.
When the user asks about their tasks, issues, projects, or any workspace data, you MUST use the appropriate tool to fetch real data.
NEVER make up or hallucinate data. If you don't have the information, use a tool to get it.

Current context:
- Workspace: ${context?.workspaceName || 'Unknown'}
- User: ${currentUser.name || currentUser.email}
${projectId ? `- Current Project ID: ${projectId}` : ''}
${context?.projectName ? `- Current Project: ${context.projectName}` : ''}

IMPORTANT RESPONSE FORMAT:
When you successfully fetch data using tools, respond with a BRIEF summary or acknowledgment (1-2 sentences max).
Do NOT list out all the items in your text response - the UI will render them as interactive components.
For example:
- If listing tasks: "Here are your 10 most recent tasks:" (the tasks will be shown as interactive cards)
- If showing stats: "Here's your workspace overview:" (stats will be rendered visually)
Keep your text response short and let the UI components do the heavy lifting.`;

    // Create or get session context
    const effectiveSessionId = sessionId || `temp-${Date.now()}`;
    let aiContext = orchestrator.getContext(effectiveSessionId);

    if (!aiContext) {
      aiContext = orchestrator.createContext(
        effectiveSessionId,
        workspaceId,
        currentUser.id,
        {
          workspaceName: context?.workspaceName,
          projectName: context?.projectName,
          issueName: context?.issueName,
          userName: currentUser.name || undefined,
          currentView: context?.currentView,
        }
      );

      if (projectId) aiContext.projectId = projectId;
      if (issueId) aiContext.issueId = issueId;
    }

    // Build messages array
    const messages: AIMessage[] = [
      ...(aiContext.conversationHistory || []),
      { role: 'user', content: message }
    ];

    // Track tool results for UI components
    const toolResults: Array<{ toolName: string; result: unknown }> = [];

    // Perform completion with tools - may need multiple rounds for tool calls
    let response = await orchestrator.complete({
      messages,
      systemPrompt: toolSystemPrompt,
      model: model || 'gpt-4o',
      temperature: 0.7,
      tools: WORKSPACE_TOOLS,
      maxTokens: 2000,
    });

    // Handle tool calls - execute tools and get final response
    let iterations = 0;
    const maxIterations = 5;

    while (response.toolCalls && response.toolCalls.length > 0 && iterations < maxIterations) {
      iterations++;

      // Add assistant message with tool calls
      const assistantMsg: AIMessage = {
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      };
      messages.push(assistantMsg);

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        try {
          const result = await executeWorkspaceTool(
            toolCall.name,
            toolCall.arguments,
            {
              workspaceId,
              userId: currentUser.id,
              projectId,
            }
          );

          // Store tool result for UI
          toolResults.push({ toolName: toolCall.name, result });

          // Add tool result message
          messages.push({
            role: 'tool',
            content: JSON.stringify(result, null, 2),
            toolCallId: toolCall.id,
          });
        } catch (toolError) {
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              error: toolError instanceof Error ? toolError.message : 'Tool execution failed',
            }),
            toolCallId: toolCall.id,
          });
        }
      }

      // Continue the conversation with tool results
      response = await orchestrator.complete({
        messages,
        systemPrompt: toolSystemPrompt,
        model: model || 'gpt-4o',
        temperature: 0.7,
        tools: WORKSPACE_TOOLS,
        maxTokens: 2000,
      });
    }

    // Convert tool results to UI components
    const uiComponents: UIComponent[] = toolResults.map(({ toolName, result }) => {
      const data = result as Record<string, unknown>;

      switch (toolName) {
        case 'get_my_tasks':
          return {
            type: 'issue_list' as const,
            data: {
              issues: data.tasks || [],
              title: 'Your Tasks',
              count: data.count || 0,
            },
          };
        case 'search_issues':
          return {
            type: 'issue_list' as const,
            data: {
              issues: data.results || [],
              title: `Search Results for "${data.query}"`,
              count: data.count || 0,
            },
          };
        case 'get_project_issues':
          return {
            type: 'issue_list' as const,
            data: {
              issues: data.issues || [],
              title: 'Project Issues',
              count: data.count || 0,
            },
          };
        case 'get_recent_activity':
          return {
            type: 'issue_list' as const,
            data: {
              issues: data.recentIssues || [],
              title: 'Recent Activity',
              count: (data.recentIssues as unknown[])?.length || 0,
            },
          };
        case 'list_projects':
          return {
            type: 'project_list' as const,
            data: {
              projects: data.projects || [],
              count: data.count || 0,
            },
          };
        case 'get_workspace_stats':
          return {
            type: 'stats' as const,
            data: data,
          };
        case 'create_issue':
          return {
            type: 'issue_card' as const,
            data: data.issue || data,
          };
        default:
          return {
            type: 'text' as const,
            data: result,
          };
      }
    });

    // Update context
    aiContext.conversationHistory.push({ role: 'user', content: message });
    aiContext.conversationHistory.push({ role: 'assistant', content: response.content });

    if (aiContext.conversationHistory.length > 20) {
      aiContext.conversationHistory = aiContext.conversationHistory.slice(-20);
    }

    if (!sessionId) {
      orchestrator.clearContext(effectiveSessionId);
    }

    return NextResponse.json({
      message: response.content,
      ui: uiComponents.length > 0 ? uiComponents : undefined,
      sessionId: sessionId ? effectiveSessionId : undefined,
      agent: agent
        ? {
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar,
            role: agent.role,
          }
        : undefined,
      usage: response.usage,
      model: response.model,
    });
  } catch (error) {
    console.error('Error in AI chat:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * GET - List available agents for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    const agentRegistry = getAgentRegistry();
    const agents = workspaceId
      ? agentRegistry.getWorkspaceAgents(workspaceId)
      : agentRegistry.getDefaultAgents();

    return NextResponse.json({
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        role: agent.role,
        description: agent.description,
        capabilities: agent.capabilities,
      })),
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}
