import { NextResponse } from 'next/server';

// It's highly recommended to store your API key in environment variables
// const CHAT_PROJECT_API_KEY = process.env.CHAT_PROJECT_API_KEY;
// For this example, using the key directly as provided.
const CHAT_PROJECT_API_KEY = '2ca5bd89c3f4d9b08b8c82db135c8a592df9dd85477b275b3c15de10e46b3e06';
const CHAT_PROJECT_TOKEN_URL = 'https://api.chatproject.io/api/auth/generate-widget-token';

export async function POST(request: Request) {
  if (!CHAT_PROJECT_API_KEY) {
    console.error('Chat Project API key is not configured.');
    return NextResponse.json({ error: 'Chat service API key not configured on server.' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    console.error('Error parsing request body:', error);
    return NextResponse.json({ error: 'Invalid request body. JSON expected.' }, { status: 400 });
  }
  
  const { externalUserId, name, email, avatar } = body;

  if (!externalUserId || !name || !email) {
    return NextResponse.json(
      { error: 'Missing required fields: externalUserId, name, and email are required.' },
      { status: 400 }
    );
  }

  try {
    const apiRequestBody: {
      externalUserId: string;
      name: string;
      email: string;
      avatar?: string;
    } = {
      externalUserId,
      name,
      email,
    };

    if (avatar) {
      apiRequestBody.avatar = avatar;
    }

    const response = await fetch(CHAT_PROJECT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': CHAT_PROJECT_API_KEY,
      },
      body: JSON.stringify(apiRequestBody),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Error from Chat Project API:', responseData);
      return NextResponse.json(
        { error: 'Failed to generate chat token from provider.', details: responseData },
        { status: response.status }
      );
    }

    if (!responseData.token) {
      console.error('No token in Chat Project API response:', responseData);
      return NextResponse.json({ error: 'Token not found in provider response.' }, { status: 500 });
    }

    return NextResponse.json({ token: responseData.token });

  } catch (error) {
    console.error('Internal server error while generating chat token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: 'Internal server error.', details: errorMessage }, { status: 500 });
  }
}

// Optional: Define a GET handler or other methods if needed, 
// otherwise requests other than POST will automatically result in a 405 Method Not Allowed. 