"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/timeline" });
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to sign in with Google");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full flex items-center justify-center gap-2 p-6"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <span>Signing in...</span>
          </div>
        ) : (
          <>
            <Image 
              src="/google.svg" 
              alt="Google" 
              width={20} 
              height={20} 
              className="h-5 w-5" 
            />
            <span>Sign in with Google</span>
          </>
        )}
      </Button>
      
      <p className="text-center text-sm text-muted-foreground">
        By signing in, you agree to our Terms and Privacy Policy.
      </p>
    </div>
  );
} 