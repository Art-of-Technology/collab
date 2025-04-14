import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { z } from "zod";

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
    
    // Create notification promises
    const notificationPromises = userIds.map(async (userId) => {
      // Skip mentions of the current user
      if (userId === currentUser.id) return null;
      
      // Create notification for the mentioned user
      const notificationType = `${sourceType}_mention`;
      
      let taskIdForNotification: string | null = null;
      
      // If the mention is from a taskComment, find the parent task ID
      if (sourceType === "taskComment") {
        const taskComment = await prisma.taskComment.findUnique({
          where: { id: sourceId },
          select: { taskId: true },
        });
        if (taskComment) {
          taskIdForNotification = taskComment.taskId;
        }
      }
      
      return prisma.notification.create({
        data: {
          type: notificationType,
          content: content,
          userId: userId,
          senderId: currentUser.id,
          read: false,
          // Dynamically set the appropriate ID field based on source type
          ...(sourceType === "post" && { postId: sourceId }),
          ...(sourceType === "comment" && { commentId: sourceId }),
          ...(sourceType === "taskComment" && { 
            taskCommentId: sourceId,
            // Also include taskId if we found it
            ...(taskIdForNotification && { taskId: taskIdForNotification })
          }), 
          ...(sourceType === "feature" && { featureRequestId: sourceId }),
          // Ensure direct task mentions also link taskId
          ...(sourceType === "task" && { taskId: sourceId }),
          ...(sourceType === "epic" && { epicId: sourceId }),
          ...(sourceType === "story" && { storyId: sourceId }),
          ...(sourceType === "milestone" && { milestoneId: sourceId }),
        },
      });
    });
    
    // Wait for all notification operations to complete
    const results = await Promise.all(notificationPromises);
    const notificationCount = results.filter(Boolean).length;
    
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