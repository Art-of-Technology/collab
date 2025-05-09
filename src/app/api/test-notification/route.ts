import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request data
    const { userId, message } = await req.json();
    
    if (!userId || !message) {
      return NextResponse.json({ error: 'userId and message are required' }, { status: 400 });
    }

    // Send direct OneSignal notification
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!oneSignalApiKey || !oneSignalAppId) {
      return NextResponse.json({ error: 'OneSignal credentials not configured' }, { status: 500 });
    }

    console.log(`Sending test notification to user ID: ${userId}`);
    
    // Create the notification payload
    const notificationPayload = {
      app_id: oneSignalAppId,
      contents: { en: message },
      headings: { en: "Test Notification" },
      url: process.env.NEXT_PUBLIC_APP_URL,
      include_external_user_ids: [userId],
    };
    
    console.log('Test notification payload:', notificationPayload);

    // Send the notification
    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${oneSignalApiKey}`,
        },
      }
    );

    console.log('OneSignal API test response:', {
      status: response.status,
      data: response.data
    });

    return NextResponse.json({
      success: true,
      message: 'Test notification sent',
      details: response.data
    });
  } catch (error: any) {
    console.error('Error sending test notification:', error);
    return NextResponse.json(
      { error: 'Failed to send test notification', details: error.message },
      { status: 500 }
    );
  }
} 