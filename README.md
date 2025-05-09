This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Push Notifications

This project uses [OneSignal](https://onesignal.com) for browser push notifications. To set up push notifications:

1. Create a free OneSignal account at [onesignal.com](https://onesignal.com)
2. Create a new web push app in the OneSignal dashboard
3. Follow the setup instructions for a typical web app (not WordPress)
4. Copy your OneSignal App ID and REST API Key
5. Add these values to your `.env.local` file:

```bash
NEXT_PUBLIC_ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_API_KEY=your-onesignal-rest-api-key
```

The required service worker file `OneSignalSDKWorker.js` is already included in the `public` directory.

### Push Notification Features

- Browser notifications for mentions and important events
- Each user can subscribe/unsubscribe from notifications 
- Users are automatically associated with their account when logged in
- Notification preferences can be managed via the notification button in the navbar

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
