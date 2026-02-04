import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AIContext, AIMessage, AIAction, AISuggestion } from '@/lib/ai';

// System prompt for the AI Assistant
const ASSISTANT_SYSTEM_PROMPT = `You are an AI assistant integrated into Collab, a project management platform for software development teams. You help users manage issues, projects, and views efficiently.

**Your Capabilities:**
- Create, update, and search issues (tasks, bugs, stories, epics)
- Navigate users to relevant pages
- Summarize project status and team activity
- Provide insights and recommendations
- Answer questions about the platform and project management best practices

**Response Guidelines:**
1. Be concise and actionable - users are busy
2. Reference specific issues by their keys when relevant (e.g., MA-123)
3. Provide context-aware suggestions based on the user's current page
4. Use professional but friendly tone
5. When creating issues, ask for missing required information
6. Format responses with markdown when helpful (bullet points, bold for emphasis)

**When performing actions, use this JSON format at the END of your response:**
\`\`\`action
{"type": "action_type", "params": {...}}
\`\`\`

Available action types:
- create_issue: {"type": "create_issue", "params": {"title": "...", "description": "...", "projectId": "...", "priority": "low|medium|high|urgent"}}
- update_issue: {"type": "update_issue", "params": {"issueId": "...", "status": "...", "priority": "..."}}
- search: {"type": "search", "params": {"query": "...", "status": "...", "priority": "..."}}
- navigate: {"type": "navigate", "params": {"path": "dashboard|issues|projects|views", "issueKey": "...", "projectSlug": "..."}}

Only include an action block when the user explicitly wants to perform an action. For questions and information, just respond normally.`;

// Initialize AI clients
function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// Build context string from AIContext
function buildContextString(context: AIContext, additionalData?: any): string {
  const parts: string[] = ['**Current Context:**'];

  parts.push(`- User: ${context.user.name} (${context.user.email})`);
  parts.push(`- Workspace: ${context.workspace.name}`);

  if (context.currentPage) {
    parts.push(`- Current Page: ${context.currentPage.type}${context.currentPage.name ? ` - ${context.currentPage.name}` : ''}`);
  }

  if (context.selection?.issues?.length) {
    parts.push(`- Selected Issues: ${context.selection.issues.join(', ')}`);
  }

  if (additionalData?.recentIssues?.length) {
    const recent = additionalData.recentIssues.slice(0, 5);
    parts.push(`- Recent Issues: ${recent.map((i: any) => `${i.issueKey}: ${i.title}`).join('; ')}`);
  }

  if (additionalData?.projects?.length) {
    parts.push(`- Available Projects: ${additionalData.projects.map((p: any) => p.name).join(', ')}`);
  }

  return parts.join('\n');
}

// Parse action from response
function parseAction(content: string): { cleanContent: string; action?: AIAction } {
  let cleanContent = content;
  let action: AIAction | undefined;

  // Look for action block
  const actionMatch = content.match(/```action\s*\n?([\s\S]*?)\n?```/);
  if (actionMatch) {
    try {
      const actionData = JSON.parse(actionMatch[1].trim());
      action = {
        type: actionData.type,
        params: actionData.params || {},
        status: 'pending',
      };
      cleanContent = content.replace(actionMatch[0], '').trim();
    } catch (e) {
      console.error('Failed to parse action:', e);
    }
  }

  return { cleanContent, action };
}

// Generate response using Anthropic
async function generateAnthropicResponse(
  messages: Array<{ role: string; content: string }>,
  contextString: string
): Promise<{ content: string; action?: AIAction }> {
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic client not available');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: ASSISTANT_SYSTEM_PROMPT,
    messages: messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'user' && messages.indexOf(m) === messages.length - 1
        ? `${contextString}\n\n${m.content}`
        : m.content,
    })),
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseAction(content);
}

// Generate response using OpenAI
async function generateOpenAIResponse(
  messages: Array<{ role: string; content: string }>,
  contextString: string
): Promise<{ content: string; action?: AIAction }> {
  const client = getOpenAIClient();
  if (!client) throw new Error('OpenAI client not available');

  const response = await client.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    max_tokens: 2048,
    temperature: 0.7,
    messages: [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user' && messages.indexOf(m) === messages.length - 1
          ? `${contextString}\n\n${m.content}`
          : m.content,
      })),
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  return parseAction(content);
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { message, context, history } = body as {
      message: string;
      context: AIContext;
      history?: AIMessage[];
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (!context?.workspace?.id) {
      return NextResponse.json(
        { error: "Workspace context is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: context.workspace.id,
        members: {
          some: { userId: currentUser.id }
        }
      },
      select: { id: true, name: true, slug: true }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found or access denied" },
        { status: 403 }
      );
    }

    // Fetch additional context data
    const [recentIssues, projects] = await Promise.all([
      prisma.issue.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          issueKey: true,
          status: true,
          priority: true,
        }
      }),
      prisma.project.findMany({
        where: { workspaceId: workspace.id },
        select: {
          id: true,
          name: true,
          slug: true,
        }
      })
    ]);

    // Build context string
    const contextString = buildContextString(context, { recentIssues, projects });

    // Build message history
    const messages = (history || [])
      .slice(-10)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    // Add current message
    messages.push({ role: 'user', content: message });

    // Try Anthropic first, fall back to OpenAI
    let response: { content: string; action?: AIAction };

    try {
      response = await generateAnthropicResponse(messages, contextString);
    } catch (anthropicError) {
      console.log('Anthropic unavailable, trying OpenAI:', anthropicError);
      try {
        response = await generateOpenAIResponse(messages, contextString);
      } catch (openaiError) {
        console.error('Both AI providers failed:', openaiError);
        return NextResponse.json(
          { error: "AI service temporarily unavailable" },
          { status: 503 }
        );
      }
    }

    // Process action if present
    let actionResult: any = null;
    if (response.action) {
      actionResult = await processAction(response.action, context, currentUser.id);
    }

    // Generate follow-up suggestions based on response
    const suggestions = generateSuggestions(response.content, context);

    return NextResponse.json({
      content: response.content,
      action: actionResult ? { ...response.action, ...actionResult } : response.action,
      suggestions,
    });
  } catch (error) {
    console.error('Error in AI chat API:', error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
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
      case 'navigate': {
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

        return { status: 'completed', navigateTo };
      }

      case 'search': {
        const params = action.params as any;
        const where: any = { workspaceId: context.workspace.id };

        if (params.query) {
          where.OR = [
            { title: { contains: params.query, mode: 'insensitive' } },
            { description: { contains: params.query, mode: 'insensitive' } },
          ];
        }
        if (params.status) where.status = params.status;
        if (params.priority) where.priority = params.priority;

        const issues = await prisma.issue.findMany({
          where,
          take: 10,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            issueKey: true,
            status: true,
            priority: true,
          }
        });

        return { status: 'completed', result: { issues, count: issues.length } };
      }

      case 'create_issue': {
        const params = action.params as any;
        if (!params.title) {
          return { status: 'failed', result: { error: 'Title is required' } };
        }

        // For now, just return the params - actual creation should go through proper API
        return {
          status: 'pending',
          result: {
            message: 'Issue creation prepared. Please confirm to create.',
            params
          }
        };
      }

      default:
        return { status: 'pending' };
    }
  } catch (error) {
    console.error('Error processing action:', error);
    return { status: 'failed', result: { error: 'Action failed' } };
  }
}

// Generate contextual suggestions
function generateSuggestions(content: string, context: AIContext): AISuggestion[] {
  const suggestions: AISuggestion[] = [];

  // Add suggestions based on content and context
  if (content.toLowerCase().includes('issue') || content.toLowerCase().includes('task')) {
    suggestions.push({
      id: `sug_${Date.now()}_1`,
      type: 'quick_action',
      title: 'Create new issue',
      description: 'Start creating a new issue',
    });
  }

  if (content.toLowerCase().includes('overdue') || content.toLowerCase().includes('attention')) {
    suggestions.push({
      id: `sug_${Date.now()}_2`,
      type: 'quick_action',
      title: 'View overdue items',
      description: 'See all overdue issues',
    });
  }

  return suggestions.slice(0, 3);
}
