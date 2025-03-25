import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Comment, Reaction, User } from "@prisma/client";

// Define types based on Prisma models
type CommentWithAuthorAndReactions = Comment & {
  author: User;
  reactions: (Reaction & {
    author: {
      id: string;
      name: string | null;
      image: string | null;
    }
  })[];
  replies?: CommentWithAuthorAndReactions[];
};

// Slack webhook URL from the environment variables
const SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/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";

// Function to send Slack notification
async function sendSlackNotification(userId: string, postAuthorId: string, commentText: string, postId: string) {
  try {
    // Check if notification should be sent (don't notify if user comments on their own post)
    if (userId === postAuthorId) {
      return;
    }
    
    // Get the post author's details
    const postAuthor = await prisma.user.findUnique({
      where: { id: postAuthorId },
      select: { name: true, slackId: true }
    });
    
    // Get commenter details
    const commenter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });
    
    // If author has no slackId, don't send notification
    if (!postAuthor?.slackId) {
      return;
    }
    
    // Get post details
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { message: true }
    });
    
    if (!post) return;
    
    // Prepare message text
    const postExcerpt = post.message.length > 50 
      ? post.message.substring(0, 50) + "..." 
      : post.message;
    
    const commentExcerpt = commentText.length > 100 
      ? commentText.substring(0, 100) + "..." 
      : commentText;
    
    // Create message payload
    const payload = {
      text: `New comment notification for ${postAuthor.name}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hey <@${postAuthor.slackId}>! *${commenter?.name || "Someone"}* commented on your post:`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `> ${postExcerpt}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Comment:*\n${commentExcerpt}`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View Post"
              },
              url: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/timeline?post=${postId}`,
              action_id: "view-post"
            }
          ]
        }
      ]
    };
    
    // Send notification to Slack
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to send Slack notification: ${response.statusText}`);
    }
    
    console.log("Slack notification sent successfully");
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    // Don't throw - we don't want to fail the comment creation if notification fails
  }
}

export async function POST(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const _params = await params;
    const postId = await _params.postId;
    const body = await req.json();
    const { message, parentId } = body;
    
    if (!message || message.trim() === "") {
      return new NextResponse("Message is required", { status: 400 });
    }
    
    // Verify parentId references a valid comment if provided
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId, postId },
      });
      
      if (!parentComment) {
        return new NextResponse("Parent comment not found", { status: 404 });
      }
    }
    
    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        message,
        postId,
        authorId: user.id,
        parentId: parentId || null, // Explicitly set to null if not provided
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });
    
    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error creating comment:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const _params = await params;
    const postId = await _params.postId;
    
    // First, get all top-level comments (those without a parent)
    const topLevelComments = await prisma.comment.findMany({
      where: {
        postId,
        parentId: null, // Only get comments without a parent
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
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
    
    // Then, get all replies (comments with a parentId)
    const replies = await prisma.comment.findMany({
      where: {
        postId,
        NOT: {
          parentId: null, // Only get comments with a parent
        },
      },
      orderBy: {
        createdAt: 'asc', // Sort replies chronologically
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
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
    
    // Group replies by their parentId for easier assignment
    const repliesByParentId = replies.reduce((acc, reply) => {
      const parentId = reply.parentId as string;
      if (!acc[parentId]) {
        acc[parentId] = [];
      }
      acc[parentId].push(reply);
      return acc;
    }, {} as Record<string, any[]>);
    
    // Attach replies to their parent comments
    const commentsWithReplies = topLevelComments.map(comment => ({
      ...comment,
      replies: repliesByParentId[comment.id] || [],
    }));
    
    return NextResponse.json({ comments: commentsWithReplies });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 