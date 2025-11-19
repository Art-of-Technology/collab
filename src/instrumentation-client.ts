// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out resource loading errors (CSS, images, etc.)
  beforeSend(event, hint) {
    const error = hint.originalException;
    
    // Ignore resource loading errors (CSS, images, fonts, etc.)
    if (error instanceof Event) {
      const target = error.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'LINK' ||
         target.tagName === 'IMG' ||
         target.tagName === 'SCRIPT' ||
         target.tagName === 'IFRAME')
      ) {
        // This is a resource loading error, ignore it
        return null;
      }
    }

    // Ignore if error message indicates resource loading failure
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String(error.message);
      if (
        message.includes('Failed to load resource') ||
        message.includes('net::ERR_') ||
        message.includes('Loading chunk') ||
        message.includes('ChunkLoadError')
      ) {
        return null;
      }
    }

    return event;
  },

  // Filter unhandled promise rejections
  ignoreErrors: [
    // Resource loading errors
    /Failed to load resource/,
    /net::ERR_/,
    /Loading chunk/,
    /ChunkLoadError/,
    // CSS loading errors
    /stylesheet/,
    /link.*error/i,
  ],
});

// Handle unhandled promise rejections that might be Event objects
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    // If the rejection reason is an Event object (like CSS loading errors), prevent it from being logged
    if (event.reason instanceof Event) {
      const target = event.reason.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'LINK' ||
         target.tagName === 'IMG' ||
         target.tagName === 'SCRIPT' ||
         target.tagName === 'IFRAME')
      ) {
        // Prevent the default error logging for resource loading errors
        event.preventDefault();
      }
    }
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;