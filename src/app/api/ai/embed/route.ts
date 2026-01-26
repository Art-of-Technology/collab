/**
 * AI Embeddings API Route
 *
 * Generates vector embeddings for text using OpenAI's embedding models.
 * Used for semantic search and similarity matching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAIOrchestrator } from '@/lib/ai';

interface EmbedRequest {
  input: string | string[];
  dimensions?: number;
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: EmbedRequest = await req.json();
    const { input, dimensions } = body;

    // Validate input
    if (!input) {
      return NextResponse.json(
        { error: 'Input text is required' },
        { status: 400 }
      );
    }

    // Validate input length
    const inputs = Array.isArray(input) ? input : [input];
    if (inputs.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 inputs allowed per request' },
        { status: 400 }
      );
    }

    // Check for empty strings
    if (inputs.some((i) => !i.trim())) {
      return NextResponse.json(
        { error: 'Empty strings are not allowed' },
        { status: 400 }
      );
    }

    const orchestrator = getAIOrchestrator();

    const response = await orchestrator.embed({
      input,
      dimensions,
    });

    return NextResponse.json({
      embeddings: response.embeddings,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    console.error('Error generating embeddings:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    );
  }
}
