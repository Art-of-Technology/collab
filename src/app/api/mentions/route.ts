import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { z } from "zod";
import { sanitizeHtmlToPlainText } from "@/lib/html-sanitizer";
import { NotificationService } from "@/lib/notification-service";

// Validation schema for mention requests
const mentionSchema = z.object({
  userIds: z.array(z.string()).min(1, "At least one user ID is required"),
  sourceType: z.enum([
    "post",
    "comment",
    "taskComment",
    "feature",
    "task",
    "epic",
    "story",
    "milestone",
  ]),
  sourceId: z.string().min(1, "Source ID is required"),
  content: z.string().min(1, "Content is required"),
});

// POST /api/mentions - Process new mentions
export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Validate request body
    const body = await req.json();
    const validationResult = mentionSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validationResult.error.format() },
        { status: 400 }
      );
    }
    
    const { userIds, sourceType, sourceId, content } = validationResult.data;
    const sanitizedContent = sanitizeHtmlToPlainText(content);
    
    // Create notifications using the service
    const recipientIds = userIds.filter((id) => id !== currentUser.id);

    let relationOptions: any = {};
    if (sourceType === "taskComment") {
      const taskComment = await prisma.taskComment.findUnique({
        where: { id: sourceId },
        select: { taskId: true },
      });
      relationOptions = {
        taskCommentId: sourceId,
        ...(taskComment?.taskId ? { taskId: taskComment.taskId } : {}),
      };
    } else if (sourceType === "post") {
      relationOptions = { postId: sourceId };
    } else if (sourceType === "comment") {
      relationOptions = { commentId: sourceId };
    } else if (sourceType === "feature") {
      relationOptions = { featureRequestId: sourceId };
    } else if (sourceType === "task") {
      relationOptions = { taskId: sourceId };
    } else if (sourceType === "epic") {
      relationOptions = { epicId: sourceId };
    } else if (sourceType === "story") {
      relationOptions = { storyId: sourceId };
    } else if (sourceType === "milestone") {
      relationOptions = { milestoneId: sourceId };
    }

    const notificationCount = await NotificationService.notifyUsers(
      recipientIds,
      `${sourceType}_mention`,
      sanitizedContent,
      currentUser.id,
      relationOptions
    );
    
    // Note: We are not creating a generic 'Mention' record anymore,
    // as notifications serve the primary purpose for mentions across different types.
    // If a dedicated 'Mention' table is needed for analytics, etc.,
    // logic would need to be added here to handle different source types.
    
    return NextResponse.json({
      message: "Mentions processed successfully",
      mentionsCount: userIds.length,
      notificationsCreated: notificationCount,
    });
  } catch (error) {
    console.error("Error processing mentions:", error);
    // Provide more specific error message if possible
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process mentions", details: errorMessage },
      { status: 500 }
    );
  }
} 