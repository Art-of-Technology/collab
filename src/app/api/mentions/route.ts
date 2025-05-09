import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

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

type MentionSchemaType = z.infer<typeof mentionSchema>;

// POST /api/mentions - Process new mentions
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate the request body
    const body = await req.json();
    const validationResult = mentionSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { userIds, sourceType, sourceId, content } = validationResult.data;

    // Create notifications for each mentioned user
    const notifications = await Promise.all(
      userIds.map(async (userId) => {
        // Skip if mentioning oneself
        if (userId === session.user.id) {
          return null;
        }

        // Map sourceType to notification type
        const notificationType = `${sourceType}_mention`;
        
        // Create notification data object
        const notificationData: any = {
          type: notificationType,
          content: content,
          userId: userId,
          senderId: session.user.id,
          read: false,
        };
        
        // Add the appropriate field based on sourceType
        switch (sourceType) {
          case 'post':
            notificationData.postId = sourceId;
            break;
          case 'comment':
            notificationData.commentId = sourceId;
            break;
          case 'feature':
            notificationData.featureRequestId = sourceId;
            break;
          case 'task':
            notificationData.taskId = sourceId;
            break;
          case 'epic':
            notificationData.epicId = sourceId;
            break;
          case 'story':
            notificationData.storyId = sourceId;
            break;
          case 'milestone':
            notificationData.milestoneId = sourceId;
            break;
          case 'taskComment':
            // For taskComment, we need to get the taskId first
            const taskComment = await prisma.taskComment.findUnique({
              where: { id: sourceId },
              select: { taskId: true },
            });
            if (taskComment) {
              notificationData.taskId = taskComment.taskId;
            }
            break;
        }

        // Create the notification in the database
        return await prisma.notification.create({
          data: notificationData
        });
      })
    );

    // Filter out null values (self-mentions)
    const validNotifications = notifications.filter((notification): notification is NonNullable<typeof notification> => notification !== null);

    // Send push notifications via OneSignal if configured
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (oneSignalApiKey && oneSignalAppId && validNotifications.length > 0) {
      try {
        // Get the user who is mentioning others
        const mentioningUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        });

        // Get the details of all mentioned users to ensure we have the correct IDs
        const mentionedUsers = await prisma.user.findMany({
          where: {
            id: {
              in: validNotifications.map(notification => notification.userId)
            }
          },
          select: {
            id: true,
            email: true,
            name: true
          }
        });

        // Map the user IDs for OneSignal - THESE MUST BE EXACTLY THE DATABASE IDs
        const externalUserIds = mentionedUsers.map(user => user.id);
        
        // Debug info to troubleshoot notification targeting
        console.log('Sending notifications to the following users:');
        mentionedUsers.forEach(user => {
          console.log(`- ${user.name} (${user.email}): ID=${user.id}`);
        });

        // Prepare notification data
        const notificationTitle = `${mentioningUser?.name || 'Someone'} mentioned you`;
        const notificationMessage = content || `You were mentioned in a ${sourceType}`;
        
        // Construct the URL based on the source type
        let url;
        switch (sourceType) {
          case 'task':
            url = `${process.env.NEXT_PUBLIC_APP_URL}/tasks/${sourceId}`;
            break;
          case 'post':
            url = `${process.env.NEXT_PUBLIC_APP_URL}/posts/${sourceId}`;
            break;
          case 'feature':
            url = `${process.env.NEXT_PUBLIC_APP_URL}/features/${sourceId}`;
            break;
          case 'milestone':
            url = `${process.env.NEXT_PUBLIC_APP_URL}/milestones/${sourceId}`;
            break;
          case 'taskComment':
            const taskComment = await prisma.taskComment.findUnique({
              where: { id: sourceId },
              select: { taskId: true },
            });
            url = `${process.env.NEXT_PUBLIC_APP_URL}/tasks/${taskComment?.taskId}`;
            break;
          default:
            url = process.env.NEXT_PUBLIC_APP_URL;
        }

        // Send the notification with exact external user IDs from the database
        console.log('Preparing OneSignal notification payload:', {
          app_id: oneSignalAppId,
          contents: { en: notificationMessage },
          headings: { en: notificationTitle },
          url,
          include_external_user_ids: externalUserIds,
        });

        const response = await axios.post(
          'https://onesignal.com/api/v1/notifications',
          {
            app_id: oneSignalAppId,
            contents: { en: notificationMessage },
            headings: { en: notificationTitle },
            url,
            include_external_user_ids: externalUserIds,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${oneSignalApiKey}`,
            },
          }
        );

        console.log('OneSignal API response:', {
          status: response.status, 
          data: response.data
        });

        console.log('Push notifications sent for mentions to IDs:', externalUserIds);
      } catch (error) {
        console.error('Error sending push notifications for mentions:', error);
        // Continue even if push notification fails
      }
    }

    return NextResponse.json({
      success: true,
      notifications: validNotifications,
    });
  } catch (error: any) {
    console.error('Error creating mentions:', error);
    return NextResponse.json(
      { error: 'Failed to create mentions', details: error.message },
      { status: 500 }
    );
  }
} 