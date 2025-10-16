import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

/**
 * API route handler for fetching link previews
 * Handles both external links (via unfurl) and internal links (notes, issues)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { url, workspaceId } = await req.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Check if it's an internal link - supports both workspace slug and ID
    const internalLinkMatch = url.match(/\/([\w-]+)\/(notes|issues)\/([\w-]+)/);
    
    if (internalLinkMatch) {
      const [, workspaceIdentifier, type, id] = internalLinkMatch;
      
      // Fetch internal link preview - OPTIMIZED: Only essential fields
      // Support both workspace slug and workspace ID
      if (type === 'notes') {
        const note = await prisma.note.findFirst({
          where: {
            id,
            workspace: {
              OR: [
                { slug: workspaceIdentifier },
                { id: workspaceIdentifier }
              ],
            },
          },
          select: {
            id: true,
            title: true,
            isPublic: true,
            isFavorite: true,
            updatedAt: true,
            author: {
              select: {
                name: true,
              },
            },
            workspace: {
              select: {
                name: true,
              },
            },
          },
        });

        if (note) {
          return NextResponse.json({
            type: 'internal',
            subtype: 'note',
            title: note.title,
            description: '',
            url,
            image: null,
            metadata: {
              workspace: note.workspace?.name,
              author: note.author.name,
              isPublic: note.isPublic,
              isFavorite: note.isFavorite,
              updatedAt: note.updatedAt,
            },
          });
        }
      } else if (type === 'issues') {
        const issue = await prisma.issue.findFirst({
          where: {
            issueKey: id,
            workspace: {
              OR: [
                { slug: workspaceIdentifier },
                { id: workspaceIdentifier }
              ],
            },
          },
          select: {
            id: true,
            issueKey: true,
            title: true,
            status: true,
            priority: true,
            type: true,
            updatedAt: true,
            assignee: {
              select: {
                name: true,
              },
            },
            workspace: {
              select: {
                name: true,
              },
            },
          },
        });

        if (issue) {
          return NextResponse.json({
            type: 'internal',
            subtype: 'issue',
            title: `${issue.issueKey}: ${issue.title}`,
            description: '',
            url,
            image: null,
            metadata: {
              issueKey: issue.issueKey,
              workspace: issue.workspace.name,
              status: issue.status,
              priority: issue.priority,
              type: issue.type,
              assignee: issue.assignee?.name,
              updatedAt: issue.updatedAt,
            },
          });
        }
      }
      
      // Internal link not found - Return a preview that shows the error
      // Include a flag to indicate this is a failed preview (not loading)
      return NextResponse.json({
        type: 'internal',
        subtype: type === 'notes' ? 'note' : 'issue',
        title: 'Not Found',
        description: `This ${type === 'notes' ? 'note' : 'issue'} may have been deleted or you don't have access to it.`,
        url,
        image: null,
        metadata: {
          notFound: true, // Flag to indicate this is not a loading state
        },
      });
    }

    // External link - OPTIMIZED: Skip HTML fetching for speed
    // Since we only show favicon + title + domain in the simplified UI,
    // we can generate the preview instantly from the URL
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      
      // Extract a readable title from the URL path if possible
      const urlPath = new URL(url).pathname;
      const pathSegments = urlPath.split('/').filter(Boolean);
      const lastSegment = pathSegments[pathSegments.length - 1] || '';
      
      // Clean up the last segment to make it more readable
      const cleanTitle = lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.(html|htm|php|asp|aspx|jsp)$/i, '')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Use domain name as fallback title
      const title = cleanTitle.trim() || domain;

      return NextResponse.json({
        type: 'external',
        title: title.length > 50 ? domain : title, // Use domain if title is too long
        description: '',
        url,
        image: null,
        metadata: {
          domain,
          favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        },
      });
    } catch (error) {
      console.error('Error parsing external link URL:', error);
      
      // Fallback: use the URL as-is
      return NextResponse.json({
        type: 'external',
        title: url,
        description: '',
        url,
        image: null,
        metadata: {
          domain: 'External Link',
          favicon: null,
        },
      });
    }
  } catch (error) {
    console.error('Error in link preview API:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch link preview' },
      { status: 500 }
    );
  }
}

