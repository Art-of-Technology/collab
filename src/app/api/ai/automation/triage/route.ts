/**
 * Auto-Triage API Route
 *
 * Analyzes issues and provides triage suggestions for type, priority, labels, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getAutoTriageService } from '@/lib/ai/automation';

interface TriageRequest {
  title: string;
  description?: string;
  projectContext?: {
    name: string;
    description?: string;
    existingLabels: string[];
  };
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body: TriageRequest = await req.json();
    const { title, description, projectContext } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Get triage service
    const triageService = getAutoTriageService();

    // Analyze the issue
    const suggestions = await triageService.analyzeIssue({
      title,
      description,
      projectContext,
    });

    return NextResponse.json({
      suggestions,
    });
  } catch (error) {
    console.error('Error in auto-triage:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to analyze issue' },
      { status: 500 }
    );
  }
}
