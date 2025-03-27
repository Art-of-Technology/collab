import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { fontSans } from "@/lib/fonts";
import SessionProvider from "@/providers/SessionProvider";
import Script from "next/script";
import { UiProvider } from "@/context/UiContext";
import { ThemeProvider as CustomThemeProvider } from "@/context/ThemeContext";

export const metadata = {
  title: "Collabri",
  description: "A collabration platform for teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="shortcut icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/site.webmanifest" />

      <body className={cn("min-h-screen bg-background font-sans antialiased", fontSans.variable)}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <UiProvider>
            <CustomThemeProvider>
              <SessionProvider>
                {children}
                <Toaster />
              </SessionProvider>
              <Script
                src="https://api.chatproject.io/chat-widget.js"
                id="chat-widget-script"
                strategy="lazyOnload"
              />
            </CustomThemeProvider>
          </UiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
