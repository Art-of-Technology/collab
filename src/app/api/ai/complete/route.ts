/**
 * AI Complete API Route
 *
 * Provides stateless AI completions for various use cases:
 * - Text improvement
 * - Summarization
 * - Classification
 * - Content generation
 * - Data extraction
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAIOrchestrator } from '@/lib/ai';
import type { AIModelId } from '@/lib/ai';

type CompletionType =
  | 'improve'
  | 'summarize'
  | 'classify'
  | 'generate'
  | 'extract'
  | 'custom';

interface CompletionRequest {
  type: CompletionType;
  input: string;
  options?: {
    // Common options
    model?: AIModelId;
    temperature?: number;
    maxTokens?: number;

    // For improve
    targetLanguage?: string;

    // For summarize
    maxLength?: number;
    style?: 'brief' | 'detailed' | 'bullet_points';

    // For classify
    categories?: string[];
    classificationContext?: string;

    // For generate
    contentType?: string;
    tone?: string;

    // For extract
    schema?: {
      description: string;
      properties: Record<string, { type: string; description: string }>;
    };

    // For custom
    systemPrompt?: string;
    responseFormat?: 'text' | 'json';
  };
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: CompletionRequest = await req.json();
    const { type, input, options = {} } = body;

    // Validate required fields
    if (!type || !input) {
      return NextResponse.json(
        { error: 'Type and input are required' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();
    let result: unknown;

    switch (type) {
      case 'improve': {
        const systemPrompt = `You are a professional text improvement assistant.

RULES:
1. Improve grammar, spelling, and sentence structure
2. Enhance readability and flow while preserving meaning
3. Preserve existing formatting (Markdown, lists, etc.)
4. ${options.targetLanguage ? `Translate to ${options.targetLanguage} if needed` : 'Maintain the original language'}
5. Return ONLY the improved text, no explanations

Be thorough but preserve the original voice and intent.`;

        result = await orchestrator.quickComplete(input, {
          systemPrompt,
          model: options.model || 'claude-haiku-3.5',
          temperature: 0.3,
        });
        break;
      }

      case 'summarize': {
        result = await orchestrator.summarize(input, {
          maxLength: options.maxLength,
          style: options.style,
          model: options.model,
        });
        break;
      }

      case 'classify': {
        if (!options.categories || options.categories.length < 2) {
          return NextResponse.json(
            { error: 'At least 2 categories are required for classification' },
            { status: 400 }
          );
        }

        result = await orchestrator.classify(
          input,
          options.categories,
          options.classificationContext
        );
        break;
      }

      case 'generate': {
        const contentType = options.contentType || 'content';
        const tone = options.tone || 'professional';

        const systemPrompt = `You are a professional ${contentType} writer.

Write in a ${tone} tone. Be clear, concise, and engaging.
Focus on delivering value to the reader.
Use appropriate formatting for the content type.`;

        result = await orchestrator.quickComplete(input, {
          systemPrompt,
          model: options.model || 'claude-sonnet-4',
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens,
        });
        break;
      }

      case 'extract': {
        if (!options.schema) {
          return NextResponse.json(
            { error: 'Schema is required for extraction' },
            { status: 400 }
          );
        }

        result = await orchestrator.extract(
          input,
          options.schema,
          options.model
        );
        break;
      }

      case 'custom': {
        if (!options.systemPrompt) {
          return NextResponse.json(
            { error: 'System prompt is required for custom completion' },
            { status: 400 }
          );
        }

        result = await orchestrator.quickComplete(input, {
          systemPrompt: options.systemPrompt,
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          responseFormat: options.responseFormat,
        });

        // Parse JSON if responseFormat is json
        if (options.responseFormat === 'json' && typeof result === 'string') {
          try {
            result = JSON.parse(result);
          } catch {
            // Keep as string if parsing fails
          }
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown completion type: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      result,
      type,
    });
  } catch (error) {
    console.error('Error in AI complete:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
