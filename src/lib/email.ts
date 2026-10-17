import 'server-only';

// Shared sender for invitations and other transactional email.
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = process.env.EMAIL_FROM?.trim() || 'Collab <collab@weezboo.com>',
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, error: 'Email delivery is not configured. Contact your workspace administrator.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text: text ?? html.replace(/<[^>]*>/g, '') }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error('Resend email request failed', { status: response.status });
      return { success: false, error: 'The email service did not accept the message. Please retry from workspace invitations.' };
    }
    const result = await response.json();
    if (typeof result?.id === 'string' && result.id.trim()) {
      return { success: true, messageId: result.id };
    }
  } catch {
    // A timeout can happen after acceptance; never resend automatically.
  }
  console.error('Resend email request could not be confirmed');
  return { success: false, error: 'Email delivery could not be confirmed. Check the recipient inbox before retrying.' };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export async function sendWorkspaceInvitationEmail({
  to,
  inviterName,
  workspaceName,
  invitationToken,
  invitationUrl,
}: {
  to: string;
  inviterName: string;
  workspaceName: string;
  invitationToken: string;
  invitationUrl?: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://collab.weez.boo';
  const url = invitationUrl || new URL(`/workspace-invitation/${encodeURIComponent(invitationToken)}`, appUrl).href;
  const subject = `${inviterName} invited you to join ${workspaceName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've been invited to join ${escapeHtml(workspaceName)}</h2>
      <p>${escapeHtml(inviterName)} has invited you to collaborate on Collab.</p>
      <div style="margin: 30px 0;">
        <a href="${escapeHtml(url)}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="margin-bottom: 30px; word-break: break-all;">
        <a href="${escapeHtml(url)}" style="color: #22c55e; text-decoration: underline;">${escapeHtml(url)}</a>
      </p>
      <p style="color: #666; font-size: 14px;">This invitation will expire in 7 days.</p>
    </div>
  `;
  return sendEmail({
    to, subject, html,
    text: `${inviterName} invited you to join ${workspaceName} on Collab.\n\nAccept invitation: ${url}\n\nThis invitation expires in 7 days.`,
  });
}
