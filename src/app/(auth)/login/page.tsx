import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoIcon from "@/components/icons/LogoIcon";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/timeline");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-8 py-12">
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <Link href="/" className="mb-4">
            <LogoIcon className="h-12 w-12 text-primary" />
          </Link>
          <h1 className="text-3xl font-bold">Weezboo Teams</h1>
          <p className="mt-2 text-muted-foreground">Connect with your development team</p>
        </div>
        
        <div className="bg-card border border-border/40 shadow-lg rounded-lg p-8">
          <h2 className="text-xl font-semibold text-center mb-6">Sign in to your account</h2>
          <LoginForm />
        </div>
      </div>
    </div>
  );
} 