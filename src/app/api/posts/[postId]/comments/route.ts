import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

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
    
    const { postId } = params;
    const { message } = await req.json();
    
    if (!message || typeof message !== "string" || !message.trim()) {
      return new NextResponse("Comment message is required", { status: 400 });
    }
    
    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });
    
    if (!post) {
      return new NextResponse("Post not found", { status: 404 });
    }
    
    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        message,
        postId,
        authorId: user.id,
      },
      include: {
        author: true,
      }
    });
    
    // Send Slack notification
    await sendSlackNotification(user.id, post.authorId, message, postId);
    
    return NextResponse.json(comment);
    
  } catch (error) {
    console.error("Comment error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const { postId } = params;
    
    const comments = await prisma.comment.findMany({
      where: {
        postId,
      },
      include: {
        author: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    
    return NextResponse.json(comments);
  } catch (error) {
    console.error("[COMMENTS_GET]", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
} 