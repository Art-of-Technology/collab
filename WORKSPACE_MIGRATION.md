## Email Configuration

To enable email notifications for workspace invitations, configure your email settings in your environment variables:

1. Copy the email settings from `.env.example` to your `.env` file:

```
# Email Configuration
EMAIL_FROM="Devitter Team <noreply@devitter.com>"
EMAIL_HOST="smtp.example.com"
EMAIL_PORT="587"
EMAIL_USER="your-email-username"
EMAIL_PASSWORD="your-email-password"
EMAIL_SECURE="false" # true for 465, false for other ports
```

2. Update these settings with your SMTP provider details:
   - For development, you can use services like [Mailtrap](https://mailtrap.io/), [Ethereal](https://ethereal.email/), or your own SMTP server
   - For production, use a transactional email service like Sendgrid, Mailgun, or AWS SES

3. Set the `NEXT_PUBLIC_APP_URL` to your application's public URL to ensure invitation links work correctly:

```
NEXT_PUBLIC_APP_URL="https://your-app-domain.com"
```

If email configuration is missing or incorrect, invitations will still be created, but users will need to be manually informed about them. The invitations can be viewed and managed in the workspace settings panel. 