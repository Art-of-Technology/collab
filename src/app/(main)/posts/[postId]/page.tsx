import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import PostPageContent from "@/components/posts/PostPageContent";

interface PostPageProps {
  params: {
    postId: string;
  };
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const _params = await params;
  const post = await prisma.post.findUnique({
    where: { id: _params.postId },
    include: { author: true },
  });

  if (!post) {
    return {
      title: "Post Not Found",
      description: "The requested post could not be found.",
    };
  }

  return {
    title: `${post.author.name}'s Post`,
    description: post.message.substring(0, 160),
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  const _params = await params;
  const post = await prisma.post.findUnique({
    where: { id: _params.postId },
    include: {
      author: true,
      tags: true,
      workspace: {
        select: {
          id: true,
          name: true,
          members: {
            where: {
              userId: session.user.id
            },
            select: {
              id: true
            }
          },
          ownerId: true
        }
      },
      comments: {
        include: {
          author: true,
          reactions: {
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    redirect("/dashboard");
  }

  // Check if user has access to the workspace this post belongs to
  const isWorkspaceOwner = post.workspace?.ownerId === session.user.id;
  const isMember = post.workspace?.members && post.workspace.members.length > 0;
  const hasAccess = isWorkspaceOwner || isMember;
  
  if (!hasAccess) {
    // User doesn't have access to this post, redirect to welcome page if they have no workspaces
    const userWorkspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      take: 1
    });
    
    if (userWorkspaces.length === 0) {
      redirect('/welcome');
    } else {
      redirect('/timeline');
    }
  }

  return <PostPageContent post={post} currentUserId={session.user.id} />;
} 