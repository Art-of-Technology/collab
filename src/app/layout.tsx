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
import Hotjar from "@/components/analytics/Hotjar";
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

// Load the Inter font with display swap for better font loading performance
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap', 
  preload: true
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Collab by Weezboo',
  description: 'An application for teams to share updates, blockers, ideas, and questions.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload critical CSS */}
        <link rel="preload" href="/globals.css" as="style" />
        
        {/* Preload Logo */}
        <link rel="preload" href="/logo-v2.png" as="image" />
        
        {/* Preload common assets */}
        <link rel="preload" href="/icons/search.svg" as="image" />
        
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Hotjar Tracking */}
        <Hotjar />
      </head>

      <body className={cn("bg-background font-sans antialiased", fontSans.variable, inter.className)}>
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
                  <main className="flex flex-col">
                    {children}
                  </main>
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
