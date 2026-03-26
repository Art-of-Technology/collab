import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RelatedIssue {
  id: string;
  issueKey: string;
  title: string;
  status?: string;
  statusColor?: string;
  priority?: string;
  similarity: number;
  relation: 'similar' | 'dependent' | 'blocks' | 'related';
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const issueId = searchParams.get("issueId");
    const workspaceId = searchParams.get("workspaceId");

    if (!issueId || !workspaceId) {
      return NextResponse.json({ error: "Issue ID and Workspace ID required" }, { status: 400 });
    }

    // Verify workspace access
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get the current issue
    const currentIssue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        labels: true,
        project: true,
      },
    });

    if (!currentIssue) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    // Find related issues using various criteria
    const relatedIssues: RelatedIssue[] = [];

    // 1. Find issues with similar title (basic text similarity)
    const titleWords = currentIssue.title
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);

    if (titleWords.length > 0) {
      const similarTitleIssues = await prisma.issue.findMany({
        where: {
          project: { workspaceId },
          id: { not: issueId },
          OR: titleWords.map(word => ({
            title: { contains: word, mode: 'insensitive' as const },
          })),
        },
        include: {
          status: { select: { name: true, color: true } },
        },
        take: 5,
      });

      for (const issue of similarTitleIssues) {
        // Calculate simple word overlap similarity
        const issueTitleWords = issue.title.toLowerCase().split(/\s+/);
        const overlap = titleWords.filter(word =>
          issueTitleWords.some(tw => tw.includes(word) || word.includes(tw))
        ).length;
        const similarity = overlap / Math.max(titleWords.length, 1);

        if (similarity > 0.2) {
          relatedIssues.push({
            id: issue.id,
            issueKey: issue.issueKey,
            title: issue.title,
            status: issue.status?.name,
            statusColor: issue.status?.color || undefined,
            priority: issue.priority || undefined,
            similarity,
            relation: 'similar',
          });
        }
      }
    }

    // 2. Find issues with same labels
    const labelIds = currentIssue.labels.map(l => l.id);
    if (labelIds.length > 0) {
      const sameLabelIssues = await prisma.issue.findMany({
        where: {
          project: { workspaceId },
          id: { not: issueId },
          labels: { some: { id: { in: labelIds } } },
        },
        include: {
          labels: true,
          status: { select: { name: true, color: true } },
        },
        take: 5,
      });

      for (const issue of sameLabelIssues) {
        // Don't add duplicates
        if (relatedIssues.some(r => r.id === issue.id)) continue;

        const commonLabels = issue.labels.filter(l => labelIds.includes(l.id)).length;
        const similarity = commonLabels / Math.max(labelIds.length, 1) * 0.8;

        relatedIssues.push({
          id: issue.id,
          issueKey: issue.issueKey,
          title: issue.title,
          status: issue.status?.name,
          statusColor: issue.status?.color || undefined,
          priority: issue.priority || undefined,
          similarity,
          relation: 'related',
        });
      }
    }

    // 3. Find explicit issue links
    const linkedIssues = await prisma.issueLink.findMany({
      where: {
        OR: [
          { sourceIssueId: issueId },
          { targetIssueId: issueId },
        ],
      },
      include: {
        sourceIssue: {
          include: { status: { select: { name: true, color: true } } },
        },
        targetIssue: {
          include: { status: { select: { name: true, color: true } } },
        },
      },
    });

    for (const link of linkedIssues) {
      const linkedIssue = link.sourceIssueId === issueId
        ? link.targetIssue
        : link.sourceIssue;

      // Don't add duplicates
      if (relatedIssues.some(r => r.id === linkedIssue.id)) continue;

      let relation: RelatedIssue['relation'] = 'related';
      if (link.type === 'blocks' && link.sourceIssueId === issueId) {
        relation = 'blocks';
      } else if (link.type === 'blocks' && link.targetIssueId === issueId) {
        relation = 'dependent';
      }

      relatedIssues.push({
        id: linkedIssue.id,
        issueKey: linkedIssue.issueKey,
        title: linkedIssue.title,
        status: linkedIssue.status?.name,
        statusColor: linkedIssue.status?.color || undefined,
        priority: linkedIssue.priority || undefined,
        similarity: 1.0,
        relation,
      });
    }

    // Sort by similarity and take top 10
    relatedIssues.sort((a, b) => b.similarity - a.similarity);
    const topRelated = relatedIssues.slice(0, 10);

    return NextResponse.json({ relatedIssues: topRelated });
  } catch (error) {
    console.error("Related issues API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch related issues" },
      { status: 500 }
    );
  }
}
