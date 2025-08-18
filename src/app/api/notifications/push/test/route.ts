import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sendPushNotification } from "@/lib/push-notifications";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Send a test push notification
    const result = await sendPushNotification(user.id, {
      title: "Test Push Notification",
      body: "This is a test push notification from Collab!",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      url: "/",
      requireInteraction: true,
      actions: [
        {
          action: "view",
          title: "View"
        },
        {
          action: "dismiss",
          title: "Dismiss"
        }
      ]
    });

    if (result) {
      return NextResponse.json({ success: true, message: "Test notification sent!" });
    } else {
      return NextResponse.json(
        { error: "Failed to send test notification. Make sure push notifications are enabled." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error sending test push notification:", error);
    return NextResponse.json(
      { error: "Failed to send test notification" },
      { status: 500 }
    );
  }
}