/**
 * Release Notes Generation API
 *
 * POST /api/ai/content/release-notes
 * Generate release notes from completed issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReleaseNotesGenerator, type ReleaseData } from '@/lib/ai/content';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      version,
      releaseName,
      releaseDate,
      previousVersion,
      issues,
      pullRequests,
      contributors,
      breakingChanges,
      deprecations,
      options,
    } = body;

    // Validate required fields
    if (!version || !issues || !Array.isArray(issues)) {
      return NextResponse.json(
        { error: 'Missing required fields: version and issues array' },
        { status: 400 }
      );
    }

    // Build release data
    const releaseData: ReleaseData = {
      version,
      releaseName,
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      previousVersion,
      issues: issues.map((issue: Record<string, unknown>) => ({
        id: issue.id as string,
        identifier: issue.identifier as string,
        title: issue.title as string,
        description: issue.description as string | undefined,
        type: mapIssueType(issue.type as string),
        priority: (issue.priority as string) || 'medium',
        labels: issue.labels as string[] | undefined,
        component: issue.component as string | undefined,
        assignee: issue.assignee as string | undefined,
        completedAt: issue.completedAt ? new Date(issue.completedAt as string) : new Date(),
      })),
      pullRequests,
      contributors,
      breakingChanges,
      deprecations,
    };

    // Generate release notes
    const generator = getReleaseNotesGenerator(options);
    const notes = await generator.generateReleaseNotes(releaseData);

    return NextResponse.json({
      success: true,
      notes,
    });
  } catch (error) {
    console.error('Release notes generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate release notes' },
      { status: 500 }
    );
  }
}

function mapIssueType(type: string): 'feature' | 'bug' | 'enhancement' | 'chore' | 'docs' | 'other' {
  const normalized = type.toLowerCase();
  if (normalized.includes('feature') || normalized.includes('story')) return 'feature';
  if (normalized.includes('bug') || normalized.includes('defect')) return 'bug';
  if (normalized.includes('enhancement') || normalized.includes('improvement')) return 'enhancement';
  if (normalized.includes('chore') || normalized.includes('task')) return 'chore';
  if (normalized.includes('doc')) return 'docs';
  return 'other';
}
