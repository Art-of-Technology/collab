import nodemailer from 'nodemailer';

// Email configuration
// For production, use your SMTP provider settings
// For development, you can use services like Mailtrap, Ethereal, or your own SMTP
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || '',
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
  from = process.env.EMAIL_FROM || 'noreply@collab.com',
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
  const url = invitationUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/workspace-invitation/${invitationToken}`;
  
  const subject = `${inviterName} invited you to join ${workspaceName} on Collab`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've been invited to join ${workspaceName}</h2>
      <p>${inviterName} has invited you to collaborate on Collab.</p>
      <div style="margin: 30px 0;">
        <a href="${url}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Accept Invitation
        </a>
      </div>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="margin-bottom: 30px; word-break: break-all;">
        <a href="${url}" style="color: #0070f3; text-decoration: underline;">${url}</a>
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