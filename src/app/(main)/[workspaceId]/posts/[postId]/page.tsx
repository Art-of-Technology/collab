import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPostById } from "@/actions/post";
import PostDetailClient from "@/components/posts/PostDetailClient";

interface PostPageProps {
  params: {
    postId: string;
    workspaceId: string;
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

  try {
    const _params = await params;
    // Get post data with server action
    const post = await getPostById(_params.postId);
    
    return (
      <PostDetailClient 
        postId={_params.postId}
        initialPost={post}
        currentUserId={session.user.id}
      />
    );
  } catch (error) {
    const _params = await params;
    const { workspaceId } = _params;
    
    // If server action fails (unauthorized, not found), redirect appropriately
    // Check for specific error messages to determine where to redirect
    if (error instanceof Error && error.message.includes("access")) {
      // User doesn't have access to this post, redirect to workspace timeline
      return redirect(`/${workspaceId}/timeline`);
    }
    
    // Generic error handling, redirect to workspace dashboard
    return redirect(`/${workspaceId}/dashboard`);
  }
} 