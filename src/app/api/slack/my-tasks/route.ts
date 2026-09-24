import { NextResponse } from 'next/server';

// Legacy profile slackId values are not verified identities. Forge-backed
// commands will use an explicit workspace/channel-to-project binding.
export async function POST() {
  return NextResponse.json({
    response_type: 'ephemeral',
    text: 'This legacy command is unavailable while verified Forge-backed project commands are being prepared.',
  }, { status: 503 });
}
