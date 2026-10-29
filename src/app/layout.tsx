import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { fontSans } from "@/lib/fonts";
import SessionProvider from "@/providers/SessionProvider";

import { UiProvider } from "@/context/UiContext";
import { ThemeProvider as CustomThemeProvider } from "@/context/ThemeContext";
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { WorkspaceLoadingWrapper } from '@/components/layout/WorkspaceLoadingWrapper';
import { MentionProvider } from '@/context/MentionContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { DockProvider } from '@/context/DockContext';
import Hotjar from "@/components/analytics/Hotjar";
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from "next/headers";
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { getServerSession } from '@/lib/request-session';
import { authOptions } from '@/lib/auth-options';
import { getUserWorkspaces } from '@/actions/workspace';

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
  // Resolve the session and the workspace list on the server. The client used to fetch both after hydration
  // and hid the whole app behind GlobalLoading until they arrived.
  const session = await getServerSession(authOptions);
  const queryClient = new QueryClient();
  if (session?.user?.id) {
    // Same key as useUserWorkspaces in src/hooks/queries/useWorkspace.ts.
    await queryClient.prefetchQuery({ queryKey: ['workspaces', 'list'], queryFn: async () => (await getUserWorkspaces()).all });
  }
  const sidebar = cookieStore.get("sidebarDesktop")?.value ?? "open"; // "open" | "closed"
  const width = sidebar === "open" ? "var(--sidebar-open)" : "var(--sidebar-closed)";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload Logo */}
        <link rel="preload" href="/logo-text.svg" as="image" />
        
        {/* Preload common assets */}
        
        <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        
        {/* Hotjar Tracking */}
        <Hotjar />
      </head>

      <body
        className={cn("font-sans antialiased dark:bg-collab-950 dark:text-white", fontSans.variable, inter.className)}
        style={{ "--sidebar-width": width } as React.CSSProperties}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <SessionProvider session={session}>
            <QueryProvider>
              <HydrationBoundary state={dehydrate(queryClient)}>
                <WorkspaceProvider>
                  <WorkspaceLoadingWrapper>
                    <MentionProvider>
                      <UiProvider>
                        <CustomThemeProvider>
                          <DockProvider>
                            <div className="h-full">
                              {children}
                            </div>
                            <Toaster />
                        </DockProvider>
                      </CustomThemeProvider>
                    </UiProvider>
                  </MentionProvider>
                </WorkspaceLoadingWrapper>
              </WorkspaceProvider>
              </HydrationBoundary>
            </QueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
