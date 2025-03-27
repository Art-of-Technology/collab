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
  const post = await prisma.post.findUnique({
    where: { id: params.postId },
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

  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    include: {
      author: true,
      tags: true,
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

  return <PostPageContent post={post} currentUserId={session.user.id} />;
} 