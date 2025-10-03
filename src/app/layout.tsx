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
import { WorkspaceLoadingWrapper } from '@/components/layout/WorkspaceLoadingWrapper';
import { MentionProvider } from '@/context/MentionContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { DockProvider } from '@/context/DockContext';
import { ActivityProvider } from '@/context/ActivityContext';
import Hotjar from "@/components/analytics/Hotjar";
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from "next/headers";

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

  const cookieStore = await cookies();
  const sidebar = cookieStore.get("sidebarDesktop")?.value ?? "open"; // "open" | "closed"
  const width = sidebar === "open" ? "var(--sidebar-open)" : "var(--sidebar-closed)";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload Logo */}
        <link rel="preload" href="/logo-text.svg" as="image" />
        
        {/* Preload common assets */}
        <link rel="preload" href="/icons/search.svg" as="image" />
        
        <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Hotjar Tracking */}
        <Hotjar />
      </head>

      <body
        className={cn("bg-background font-sans antialiased", fontSans.variable, inter.className)}
        style={{ "--sidebar-width": width } as React.CSSProperties}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <SessionProvider>
            <QueryProvider>
              <ActivityProvider>
                <WorkspaceProvider>
                  <WorkspaceLoadingWrapper>
                    <MentionProvider>
                      <UiProvider>
                        <CustomThemeProvider>
                          <DockProvider>
                            <main className="h-screen flex flex-col">
                              {children}
                            </main>
                            <Toaster />
                          <Script
                            src="https://api.chatproject.io/chat-widget.js"
                            id="chat-widget-script"
                            strategy="lazyOnload"
                          />
                        </DockProvider>
                      </CustomThemeProvider>
                    </UiProvider>
                  </MentionProvider>
                </WorkspaceLoadingWrapper>
              </WorkspaceProvider>
              </ActivityProvider>
            </QueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
