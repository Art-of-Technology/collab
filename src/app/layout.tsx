import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { fontSans } from "@/lib/fonts";
import SessionProvider from "@/providers/SessionProvider";
import Script from "next/script";
import { UiProvider } from "@/context/UiContext";
import { ThemeProvider as CustomThemeProvider } from "@/context/ThemeContext";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Collab',
  description: 'An application for teams to share updates, blockers, ideas, and questions.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className="min-h-screen h-screen overflow-hidden" lang="en" suppressHydrationWarning>
      <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/site.webmanifest" />

      <body className={cn("min-h-screen h-screen bg-background font-sans antialiased", fontSans.variable, inter.className)}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <SessionProvider>
            <WorkspaceProvider>
              <UiProvider>
                <CustomThemeProvider>
                  {children}
                  <Toaster />
                  <Script
                    src="https://api.chatproject.io/chat-widget.js"
                    id="chat-widget-script"
                    strategy="lazyOnload"
                  />
                </CustomThemeProvider>
              </UiProvider>
            </WorkspaceProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
