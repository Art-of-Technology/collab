import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoIcon } from "@/components/icons/LogoIcon";

export default async function Home() {
  const user = await getCurrentUser();

  // If user is logged in, redirect to timeline
  if (user) {
    redirect("/timeline");
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero Section */}
      <main className="flex-grow flex items-center justify-center">
        <div className="container mx-auto px-4 py-16 flex flex-col md:flex-row items-center gap-12">
          <div className="md:w-1/2 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-6">
              <LogoIcon className="h-12 w-12 text-primary" />
              <h1 className="text-5xl font-bold">Weezboo Teams</h1>
            </div>
            <h2 className="text-3xl font-bold mb-6">
              The internal timeline for developer teams
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Share updates, track blockers, and collaborate with your team in a
              simple, streamlined timeline — without the complexity of traditional
              project management tools.
            </p>
            <div className="flex gap-4">
              <Button asChild size="lg" className="gap-2">
                <Link href="/login">
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
          <div className="md:w-1/2">
            <Card className="border-border/40 bg-card/95 shadow-lg hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6 space-y-4">
                {/* Timeline Preview */}
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-background border border-border/40 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold">JD</div>
                      <div>
                        <p className="font-medium">Jane Doe</p>
                        <p className="text-xs text-muted-foreground">10m ago • UPDATE</p>
                      </div>
                    </div>
                    <p className="text-sm">Completed the responsive design for the login form. Moving on to registration page now.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-background border border-border/40 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-destructive/20 rounded-full flex items-center justify-center text-destructive font-bold">JS</div>
                      <div>
                        <p className="font-medium">John Smith</p>
                        <p className="text-xs text-muted-foreground">1h ago • BLOCKER</p>
                      </div>
                    </div>
                    <p className="text-sm">Having issues with the authentication service. Getting timeout errors when connecting to the DB.</p>
                  </div>
                  <div className="p-4 rounded-lg bg-background border border-border/40 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 font-bold">AB</div>
                      <div>
                        <p className="font-medium">Alice Brown</p>
                        <p className="text-xs text-muted-foreground">3h ago • IDEA</p>
                      </div>
                    </div>
                    <p className="text-sm">What if we implement a dark mode option for the dashboard? Would improve accessibility and user experience.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-card/80 border-t border-border/30 py-8">
        <div className="container mx-auto px-4">
          <p className="text-center text-muted-foreground">© 2025 Weezboo. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
