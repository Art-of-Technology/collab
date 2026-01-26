/**
 * Spec and Test Generation API
 *
 * POST /api/ai/content/spec
 * Generate technical specifications and test cases
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSpecGenerator, type IssueInput, type ProjectContext } from '@/lib/ai/content';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action, // 'spec' | 'tests' | 'acceptance' | 'estimate' | 'full'
      issue,
      spec,
      projectContext,
      options,
    } = body;

    // Validate required fields
    if (!issue || !issue.id || !issue.title) {
      return NextResponse.json(
        { error: 'Missing required fields: issue with id and title' },
        { status: 400 }
      );
    }

    // Build issue input
    const issueInput: IssueInput = {
      id: issue.id,
      identifier: issue.identifier || issue.id,
      title: issue.title,
      description: issue.description,
      type: issue.type || 'task',
      priority: issue.priority,
      labels: issue.labels,
      parentIssue: issue.parentIssue,
      relatedIssues: issue.relatedIssues,
      comments: issue.comments,
    };

    // Build project context if provided
    const context: ProjectContext | undefined = projectContext
      ? {
          name: projectContext.name,
          description: projectContext.description,
          techStack: projectContext.techStack,
          existingFeatures: projectContext.existingFeatures,
          codingStandards: projectContext.codingStandards,
          testingFramework: projectContext.testingFramework,
        }
      : undefined;

    const generator = getSpecGenerator(options);

    switch (action) {
      case 'spec': {
        const technicalSpec = await generator.generateSpec(issueInput, context);
        return NextResponse.json({
          success: true,
          spec: technicalSpec,
        });
      }

      case 'tests': {
        const testSuite = await generator.generateTests(issueInput, spec, context);
        return NextResponse.json({
          success: true,
          tests: testSuite,
        });
      }

      case 'acceptance': {
        const criteria = await generator.generateAcceptanceCriteria(issueInput);
        return NextResponse.json({
          success: true,
          acceptanceCriteria: criteria,
        });
      }

      case 'estimate': {
        const estimate = await generator.estimateEffort(issueInput, context);
        return NextResponse.json({
          success: true,
          estimate,
        });
      }

      case 'full':
      default: {
        // Generate full spec and tests
        const technicalSpec = await generator.generateSpec(issueInput, context);
        const testSuite = await generator.generateTests(issueInput, technicalSpec, context);

        return NextResponse.json({
          success: true,
          spec: technicalSpec,
          tests: testSuite,
        });
      }
    }
  } catch (error) {
    console.error('Spec generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate specification' },
      { status: 500 }
    );
  }
}
