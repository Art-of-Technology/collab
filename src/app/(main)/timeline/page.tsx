import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { XCircleIcon } from "@heroicons/react/24/outline";
import PostList from "@/components/posts/PostList";
import CreatePostForm from "@/components/posts/CreatePostForm";
import FilterTabs from "@/components/posts/FilterTabs";
import { Badge } from "@/components/ui/badge";
import { cookies } from "next/headers";

interface TimelinePageProps {
  searchParams: { 
    filter?: string;
    tag?: string;
  }
}

// Define a proper type for the where clause
interface WhereClause {
  type?: string;
  tags?: {
    some: {
      name: string;
    }
  };
  workspaceId?: string;
}

export const dynamic = 'force-dynamic';

export default async function TimelinePage({
  searchParams,
}: TimelinePageProps) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }

  // Get current workspace from cookie
  const cookieStore = await cookies();
  const currentWorkspaceId = cookieStore.get('currentWorkspaceId')?.value;

  // If no workspace ID found, we need to get the user's workspaces
  let workspaceId = currentWorkspaceId;
  
  if (!workspaceId) {
    // Get user's first workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: { id: true }
    });
    
    if (workspace) {
      workspaceId = workspace.id;
    }
  }

  // If we still don't have a workspaceId, redirect to create workspace
  if (!workspaceId) {
    redirect('/create-workspace');
  }
  
  const _searchParams = await searchParams;
  // Safely handle searchParams - check if they exist first before awaiting
  const filterParam = _searchParams?.filter ? await _searchParams.filter : undefined;
  const tagParam = _searchParams?.tag ? await _searchParams.tag : undefined;
  
  const filter = typeof filterParam === 'string' ? filterParam.toLowerCase() : undefined;
  const tag = typeof tagParam === 'string' ? tagParam : undefined;
  
  // Build query based on filter
  const whereClause: WhereClause = {
    workspaceId: workspaceId // Add workspace filter
  };
  
  if (filter) {
    // Map URL filter to database filter
    const filterMap: { [key: string]: string } = {
      'updates': 'UPDATE',
      'blockers': 'BLOCKER',
      'ideas': 'IDEA',
      'questions': 'QUESTION',
    };
    
    if (filterMap[filter]) {
      whereClause.type = filterMap[filter];
    }
  }
  
  // Add tag filter if provided
  if (tag) {
    whereClause.tags = {
      some: {
        name: tag
      }
    };
  }
  
  // Fetch posts with applied filter
  const posts = await prisma.post.findMany({
    where: whereClause,
    take: 20,
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: true,
    },
  });
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timeline</h1>
        <p className="text-muted-foreground">
          Latest updates from your team
        </p>
      </div>
      
      {tag && (
        <div className="mb-6 flex items-center">
          <p className="mr-2">Showing posts tagged:</p>
          <div className="flex items-center">
            <Badge variant="secondary" className="px-3 py-1">
              #{tag}
            </Badge>
            <Link 
              href="/timeline" 
              className="ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear tag filter"
            >
              <XCircleIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <CreatePostForm />
      </div>
      
      <div className="mb-6">
        <FilterTabs />
      </div>
      
      <PostList posts={posts} currentUserId={user.id} />
    </div>
  );
} 