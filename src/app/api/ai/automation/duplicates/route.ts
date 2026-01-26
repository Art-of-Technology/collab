/**
 * Duplicate Detection API Route
 *
 * Finds potential duplicate issues using semantic search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getDuplicateDetectionService, type IssueForDuplication } from '@/lib/ai/automation';

interface DuplicateCheckRequest {
  title: string;
  description?: string;
  existingIssues: IssueForDuplication[];
  options?: {
    threshold?: number;
    maxCandidates?: number;
    includeExplanation?: boolean;
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
    const body: DuplicateCheckRequest = await req.json();
    const { title, description, existingIssues, options } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!existingIssues || !Array.isArray(existingIssues)) {
      return NextResponse.json(
        { error: 'Existing issues array is required' },
        { status: 400 }
      );
    }

    // Get duplicate detection service
    const duplicateService = getDuplicateDetectionService();

    // Find duplicates
    const result = await duplicateService.findDuplicates(
      { title, description },
      existingIssues,
      options
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in duplicate detection:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to check duplicates' },
      { status: 500 }
    );
  }
}
