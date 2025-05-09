import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const { title, message, url, userIds, segments } = await request.json();

    if (!title || !message) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 });
    }

    // Either userIds or segments must be provided
    if (!userIds?.length && !segments?.length) {
      return NextResponse.json(
        { error: 'Either userIds or segments must be provided' }, 
        { status: 400 }
      );
    }

    // OneSignal API key from environment variables
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    const oneSignalAppId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!oneSignalApiKey || !oneSignalAppId) {
      return NextResponse.json(
        { error: 'OneSignal configuration is missing' }, 
        { status: 500 }
      );
    }

    // Prepare the notification payload
    const notificationPayload: any = {
      app_id: oneSignalAppId,
      contents: { en: message },
      headings: { en: title },
      url: url || process.env.NEXT_PUBLIC_APP_URL,
    };

    // Add filters based on provided parameters
    if (userIds && userIds.length > 0) {
      notificationPayload.include_external_user_ids = userIds;
    }

    if (segments && segments.length > 0) {
      notificationPayload.included_segments = segments;
    }

    // Send the notification via OneSignal API
    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      notificationPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${oneSignalApiKey}`
        }
      }
    );

    return NextResponse.json({ 
      success: true, 
      data: response.data 
    });
    
  } catch (error: any) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send notification', 
        details: error.message 
      }, 
      { status: 500 }
    );
  }
} 