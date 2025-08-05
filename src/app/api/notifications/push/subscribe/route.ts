import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EncryptionService } from "@/lib/encryption";
import { withRateLimit, pushSubscriptionRateLimit } from "@/lib/rate-limit";
import { withValidation, pushSubscriptionSchema } from "@/lib/validation";
import { withCors, getCorsConfig } from "@/lib/cors";

export const POST = withCors(
  withRateLimit(
    withValidation(async function(request: NextRequest, { body }) {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { subscription } = body;

    // Encrypt the subscription data before storing
    let encryptedSubscription: string;
    try {
      encryptedSubscription = EncryptionService.encrypt(subscription);
    } catch (encryptError) {
      console.error("Failed to encrypt subscription:", encryptError);
      return NextResponse.json(
        { error: "Failed to process subscription" },
        { status: 500 }
      );
    }

    // Update or create notification preferences with encrypted push subscription
    await prisma.notificationPreferences.upsert({
      where: { userId: user.id },
      update: {
        pushSubscription: encryptedSubscription,
        pushNotificationsEnabled: true,
      },
      create: {
        userId: user.id,
        pushSubscription: encryptedSubscription,
        pushNotificationsEnabled: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return NextResponse.json(
      { error: "Failed to save push subscription" },
      { status: 500 }
    );
  }
}, { body: pushSubscriptionSchema }), pushSubscriptionRateLimit),
  getCorsConfig()
);

export const DELETE = withCors(
  withRateLimit(async function(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Remove push subscription
    await prisma.notificationPreferences.update({
      where: { userId: user.id },
      data: {
        pushSubscription: null,
        pushNotificationsEnabled: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return NextResponse.json(
      { error: "Failed to remove push subscription" },
      { status: 500 }
    );
  }
}, pushSubscriptionRateLimit),
  getCorsConfig()
);

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}