import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PostList from "@/components/posts/PostList";
import CreatePostForm from "@/components/posts/CreatePostForm";
import FilterTabs from "@/components/posts/FilterTabs";
import { Badge } from "@/components/ui/badge";
import { XCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  const filter = typeof searchParams.filter === 'string' ? searchParams.filter.toLowerCase() : undefined;
  const tag = typeof searchParams.tag === 'string' ? searchParams.tag : undefined;
  
  // Build query based on filter
  const whereClause: any = {};
  
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