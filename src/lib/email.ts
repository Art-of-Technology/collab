import nodemailer from 'nodemailer';

// Email configuration for Amazon SES
// IMPORTANT: Don't hardcode credentials - use environment variables
// The credentials shown in the sample should be rotated immediately as they are compromised
const emailConfig = {
  host: process.env.EMAIL_HOST || 'email-smtp.eu-west-1.amazonaws.com',
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true, // Use TLS
  auth: {
    user: process.env.EMAIL_USER || '', // SES SMTP user
    pass: process.env.EMAIL_PASSWORD || '', // SES SMTP password
  },
};

// Create a transporter
const transporter = nodemailer.createTransport(emailConfig);

// Helper function to verify email configuration
export async function verifyEmailConfig() {
  try {
    await transporter.verify();
    return { success: true };
  } catch (error) {
    console.error('Email verification failed:', error);
    return { success: false, error };
  }
}

// Generic send email function
export async function sendEmail({ 
  to, 
  subject, 
  html, 
  text,
  from = process.env.EMAIL_FROM || 'noreply@mx.weezboo.com', // Updated default sender
}: { 
  to: string; 
  subject: string; 
  html: string; 
  text?: string;
  from?: string;
}) {
  try {
    const result = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text alternative
    });
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error };
  }
}

// Workspace invitation email
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
  // Generate invitation URL if not provided
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = invitationUrl || `${appUrl}/workspace-invitation/${invitationToken}`;
  
  const subject = `${inviterName} invited you to join ${workspaceName}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've been invited to join ${workspaceName}</h2>
      <p>${inviterName} has invited you to collaborate on Collab.</p>
      <div style="margin: 30px 0;">
        <a href="${url}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="margin-bottom: 30px; word-break: break-all;">
        <a href="${url}" style="color: #22c55e; text-decoration: underline;">${url}</a>
      </p>
      <p style="color: #666; font-size: 14px;">
        This invitation will expire in 7 days.
      </p>
    </div>
  `;
  
  return sendEmail({
    to,
    subject,
    html,
  });
} 