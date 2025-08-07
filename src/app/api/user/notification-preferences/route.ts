import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Default preferences that match the schema defaults
const DEFAULT_PREFERENCES = {
  taskCreated: true,
  taskStatusChanged: true,
  taskAssigned: true,
  taskCommentAdded: true,
  taskPriorityChanged: true,
  taskDueDateChanged: true,
  taskColumnMoved: false,
  taskUpdated: true,
  taskDeleted: true,
  taskMentioned: true,
  boardTaskCreated: true,
  boardTaskStatusChanged: true,
  boardTaskAssigned: false,
  boardTaskCompleted: true,
  boardTaskDeleted: true,
  postCommentAdded: true,
  postUpdated: true,
  postResolved: true,
  // Leave notifications
  leaveRequestStatusChanged: true,
  leaveRequestEdited: true,
  leaveRequestManagerAlert: true,
  leaveRequestHRAlert: false,
  emailNotificationsEnabled: true,
};

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // First try to get existing preferences
    let preferences = await prisma.notificationPreferences.findUnique({
      where: { userId: currentUser.id },
    });

    // If no preferences exist, create default ones
    if (!preferences) {
      try {
        preferences = await prisma.notificationPreferences.create({
          data: {
            userId: currentUser.id,
            ...DEFAULT_PREFERENCES,
          },
        });
      } catch (createError) {
        console.error("Error creating notification preferences:", createError);
        // If creation fails, return default preferences without saving
        return NextResponse.json({
          id: null,
          userId: currentUser.id,
          ...DEFAULT_PREFERENCES,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error getting notification preferences:", error);

    // Log the specific error for debugging
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Validate the body contains only expected fields
    const allowedFields = [
      "taskCreated",
      "taskStatusChanged",
      "taskAssigned",
      "taskCommentAdded",
      "taskPriorityChanged",
      "taskDueDateChanged",
      "taskColumnMoved",
      "taskUpdated",
      "taskDeleted",
      "taskMentioned",
      "boardTaskCreated",
      "boardTaskStatusChanged",
      "boardTaskAssigned",
      "boardTaskCompleted",
      "boardTaskDeleted",
      "postCommentAdded",
      "postUpdated",
      "postResolved",
      // Leave notification fields
      "leaveRequestStatusChanged",
      "leaveRequestEdited",
      "leaveRequestManagerAlert",
      "leaveRequestHRAlert",
      "emailNotificationsEnabled",
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (field in body && typeof body[field] === "boolean") {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update or create notification preferences
    const preferences = await prisma.notificationPreferences.upsert({
      where: { userId: currentUser.id },
      update: updateData,
      create: {
        userId: currentUser.id,
        ...DEFAULT_PREFERENCES,
        ...updateData,
      },
    });

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Error updating notification preferences:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Reset to default preferences
    const defaultPreferences = await prisma.notificationPreferences.upsert({
      where: { userId: currentUser.id },
      update: DEFAULT_PREFERENCES,
      create: {
        userId: currentUser.id,
        ...DEFAULT_PREFERENCES,
      },
    });

    return NextResponse.json(defaultPreferences);
  } catch (error) {
    console.error("Error resetting notification preferences:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
